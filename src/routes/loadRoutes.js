
const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loadController');
const antrepoController = require('../controllers/antrepoController');
const driverUploadController = require('../controllers/driverUploadController');
const alertsService = require('../services/alertsService');
const multer = require('multer');
const os = require('os');

// multer config: store uploads in OS temp dir
const upload = multer({ dest: os.tmpdir() });

// Basit giriş kontrolü
function ensureAuth(req, res, next) {
  if (req.session && req.session.user) {
    // İstersek view'lara da taşıyabiliriz
    res.locals.currentUser = req.session.user;
    return next();
  }
  return res.redirect('/login');
}

// API: Get missing data alerts
router.get('/api/alerts', ensureAuth, async (req, res, next) => {
  try {
    // Get year from query params (e.g., 2025 -> "25")
    const year = req.query.year;
    const yearPrefix = year ? year.toString().slice(-2) : null;
    const alerts = await alertsService.getAlerts(yearPrefix);
    res.json({ success: true, alerts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Get alerts summary
router.get('/api/alerts/summary', ensureAuth, async (req, res, next) => {
  try {
    const year = req.query.year;
    const yearPrefix = year ? year.toString().slice(-2) : null;
    const summary = await alertsService.getAlertSummary(yearPrefix);
    res.json({ success: true, summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Get total open positions count (for completion percentage)
router.get('/api/positions-count', ensureAuth, (req, res) => {
  const db = require('../config/db');
  // Get year from query params
  const year = req.query.year;
  const yearPrefix = year ? year.toString().slice(-2) : null;
  const yearFilter = yearPrefix ? ` WHERE position_no LIKE '${yearPrefix}/%'` : '';
  
  // Get both total positions and completed positions count
  const sql = `
    SELECT 
      COUNT(DISTINCT position_no) as total,
      COUNT(DISTINCT CASE WHEN status = 'completed' THEN position_no END) as completed
    FROM loads${yearFilter}
  `;
  db.get(sql, [], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ 
      success: true, 
      total: row ? row.total : 0,
      completed: row ? row.completed : 0
    });
  });
});

// API: Get completed positions list
router.get('/api/completed-positions', ensureAuth, (req, res) => {
  const db = require('../config/db');
  const sql = `
    SELECT 
      l.position_no,
      l.customer_name,
      l.consignee_name,
      l.truck_plate,
      l.trailer_plate,
      l.driver_name,
      l.created_at
    FROM loads l
    WHERE l.status = 'completed'
    GROUP BY l.position_no
    ORDER BY l.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, positions: rows || [] });
  });
});

// API: Get driver locations for truck plates (uses GPS API data)
router.get('/api/truck-locations', ensureAuth, async (req, res) => {
  const GpsModel = require('../models/gpsModel');
  
  try {
    // Get truck plates from query (comma separated)
    const platesParam = req.query.plates || '';
    const truckPlates = platesParam.split(',').filter(p => p.trim()).map(p => p.trim());
    
    if (truckPlates.length === 0) {
      return res.json({ success: true, locations: {} });
    }
    
    // Get locations from GPS data (GPSBuddy API)
    const gpsLocations = GpsModel.getByPlates(truckPlates);
    
    // Transform to expected format
    const locations = {};
    for (const [plate, data] of Object.entries(gpsLocations)) {
      if (data.latitude && data.longitude) {
        // Extract country from address (e.g., "Street, City (DE)" -> "DE")
        let country = null;
        if (data.address) {
          const match = data.address.match(/\(([A-Z]{2})\)\s*$/);
          if (match) country = match[1];
        }
        
        locations[plate] = {
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address || data.location,
          country: country,
          velocity: data.velocity,
          time_indicator: data.time_indicator,
          driver_name: data.drivername
        };
      }
    }
    
    res.json({ success: true, locations: locations });
  } catch (e) {
    console.error('[TruckLocations] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});


// PDF EXPORT /loads/export/pdf
router.get('/export/pdf', ensureAuth, loadController.exportAllAsPdf);

// LISTE  /loads
router.get('/', ensureAuth, loadController.list);

// JSON API for a single load (used by client-side edit modal)
router.get('/api/:id', ensureAuth, loadController.getJson);

// YENİ POZİSYON OLUŞTUR  /loads/new
router.get('/new', ensureAuth, loadController.createNewPosition);

// YENİ FİRMA EKLE (Gönderici/Alıcı)  POST /loads/add-company
router.post('/add-company', ensureAuth, loadController.addCompany);

// FİRMA SİL  POST /loads/delete-company
router.post('/delete-company', ensureAuth, loadController.deleteCompany);

// YENİ FATURA FİRMASI EKLE  POST /loads/add-invoice-company
router.post('/add-invoice-company', ensureAuth, loadController.addInvoiceCompany);

// ("Yeni yük aynı pozisyona" functionality removed)

// (Varsa) DÜZENLEME SAYFASI  /loads/:id/edit
router.get('/:id/edit', ensureAuth, loadController.showEditForm);
router.post('/:id/edit', ensureAuth, loadController.update);

// EDIT LOG HISTORY ROUTE
router.get('/:id/logs', ensureAuth, loadController.showLogs);

// POZİSYON YÜKLEMELER  /loads/position/:positionNo
router.get(/^\/position\/(.+)\/export\/pdf$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.exportPositionAsPdf(req, res, next);
});

router.get(/^\/position\/(.+)\/ameta$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.showAmeta(req, res, next);
});

router.get(/^\/position\/(.+)\/yl$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.showYL(req, res, next);
});

// CMR PDF Generation
router.get(/^\/position\/(.+)\/cmr$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.exportCMR(req, res, next);
});

router.post(/^\/position\/(.+)\/antrepo-liste$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  antrepoController.generateAntrepoListePdf(req, res, next);
});

// Generate KM PDF from client-provided distance data
router.post(/^\/position\/(.+)\/km-pdf$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.exportPositionKmPdf(req, res, next);
});

// MASRAF SİLME - EN ÖNE ALINDI
router.post(/^\/position\/(.+)\/expenses\/(\d+)\/delete$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  req.params.expenseId = req.params[1];
  loadController.deleteExpense(req, res, next);
});

// MASRAF EKLEME
router.post(/^\/position\/(.+)\/expenses$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.addExpense(req, res, next);
});

router.post(/^\/position\/(.+)\/complete$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.completePosition(req, res, next);
});

// GÜRAY EMAIL - T1/GMR evraklarını mail ile gönder
router.post(/^\/position\/(.+)\/guray-email$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.sendGurayEmail(req, res, next);
});

// GÜRAY EMAIL - T1/GMR evrak listesi (API)
router.get(/^\/position\/(.+)\/t1gmr-documents$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.getT1GMRDocuments(req, res, next);
});

router.post(/^\/position\/(.+)\/reopen$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.reopenPosition(req, res, next);
});

// MASRAF YOK İŞARETLE
router.post(/^\/position\/(.+)\/mark-no-expense$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.markNoExpense(req, res, next);
});

// MASRAF YOK İŞARETİNİ KALDIR
router.post(/^\/position\/(.+)\/unmark-no-expense$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.unmarkNoExpense(req, res, next);
});

// MÜHÜR GÜNCELLEME
router.post(/^\/position\/(.+)\/seal$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.updatePositionSeal(req, res, next);
});

// MRN NO GÜNCELLEME
router.post(/^\/position\/(.+)\/mrn$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.updatePositionMrn(req, res, next);
});

// ARAÇ BİLGİLERİ GÜNCELLEME (çekici, dorse, şoför)
router.post(/^\/position\/(.+)\/update-vehicle$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.updatePositionVehicle(req, res, next);
});

// TARİH GÜNCELLEME (yükleme, varış)
router.post(/^\/position\/(.+)\/update-dates$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.updatePositionDates(req, res, next);
});

// EVRAK YÜKLEME
router.post(/^\/position\/(.+)\/upload-document$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.uploadDocument(req, res, next);
});

// ŞOFÖR EVRAK YÜKLEME LİNKİ KONTROL (mevcut token'ı getir, oluşturma)
router.get(/^\/position\/(.+)\/check-driver-upload-link$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  driverUploadController.checkExistingToken(req, res, next);
});

// ŞOFÖR EVRAK YÜKLEME LİNKİ OLUŞTUR
router.post(/^\/position\/(.+)\/create-driver-upload-link$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  driverUploadController.createUploadToken(req, res, next);
});

// ŞOFÖR EVRAK YÜKLEME LİNKİ İPTAL ET
router.post(/^\/position\/(.+)\/revoke-driver-upload-link$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  driverUploadController.revokeUploadToken(req, res, next);
});

// FILES LISTING - pozisyona ait evrak klasörünü tarayıcıda göster
router.get(/^\/position\/(.+)\/files$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.showPositionFiles(req, res, next);
});

// ÜST KLASÖR AÇ - Sunucu tarafında dosya tarayıcısı
router.get(/^\/position\/(.+)\/open-folder$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.openParentFolder(req, res, next);
});

// ANA KLASÖRE DOSYA YÜKLE
router.post(/^\/position\/(.+)\/upload-parent$/, ensureAuth, upload.single('file'), (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.uploadToParentFolder(req, res, next);
});

// ANA KLASÖRDEN DOSYA SİL
router.post(/^\/position\/(.+)\/delete-parent-file$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.deleteParentFile(req, res, next);
});

// EVRAK SİLME
router.post('/document/:id/delete', ensureAuth, loadController.deleteDocument);

// POZİSYON SİLME
router.post(/^\/position\/(.+)\/delete$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.deletePosition(req, res, next);
});

router.get(/^\/position\/(.+)$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.showPositionLoads(req, res, next);
});

// İHRACAT POZ KAYDET / geri çek
router.post(/^\/position\/(.+)\/ihr_poz$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.savePositionIhrPoz(req, res, next);
});

router.post(/^\/position\/(.+)\/ihr_poz\/remove$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.removePositionIhrPoz(req, res, next);
});

// MAİL GÖNDER  POST /loads/send-mail
router.post('/send-mail', ensureAuth, loadController.sendMail);

// OUTLOOK İLE MAİL GÖNDER  POST /loads/send-mail-outlook
router.post('/send-mail-outlook', ensureAuth, upload.array('attachments', 12), loadController.sendMailOutlook);

// KAYIT OLUSTUR  POST /loads
router.post('/', ensureAuth, loadController.create);

// INLINE GÜNCELLEME - Tek alan güncellemesi  POST /loads/:id/update-field
router.post('/:id/update-field', ensureAuth, loadController.updateField);

// Assign a unique 5-digit UID to a load (server-side) POST /loads/:id/assign-uid
router.post('/:id/assign-uid', ensureAuth, loadController.assignUid);

// DETAY  /loads/:id - Position sayfasına yönlendir
router.get('/:id', ensureAuth, loadController.redirectToPosition);

//  GÜNCELLEME (Edit formundan gelen POST buraya düşecek)
router.post('/:id', ensureAuth, loadController.update);

// SILME  POST /loads/:id/delete
router.post('/:id/delete', ensureAuth, loadController.delete);


module.exports = router;
