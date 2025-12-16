const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loadController');

// Basit giriş kontrolü
function ensureAuth(req, res, next) {
  if (req.session && req.session.user) {
    // İstersek view'lara da taşıyabiliriz
    res.locals.currentUser = req.session.user;
    return next();
  }
  return res.redirect('/login');
}

// LISTE  /loads
router.get('/', ensureAuth, loadController.list);

// YENI YUKLEME FORMU  /loads/new
router.get('/new', ensureAuth, loadController.showCreateForm);

// POZISYON YUKLEMELER - regex pattern to match position with slashes
router.get(/^\/position\/(.*)$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.showPositionLoads(req, res, next);
});

// Export position KM calculation as PDF (server-side generated)
router.post(/^\/position\/(.*)\/km-pdf$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.exportPositionKmPdf(req, res, next);
});

// İHRACAT POZ KAYDET / geri çek (alt sürücü route)
router.post(/^\/position\/(.*)\/ihr_poz$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.savePositionIhrPoz(req, res, next);
});

router.post(/^\/position\/(.*)\/ihr_poz\/remove$/, ensureAuth, (req, res, next) => {
  req.params.positionNo = decodeURIComponent(req.params[0]);
  loadController.removePositionIhrPoz(req, res, next);
});

// KAYIT OLUSTUR  POST /loads
router.post('/', ensureAuth, loadController.create);

// ("Yeni yük aynı pozisyona" functionality removed)

// DETAY  /loads/:id
router.get('/:id', ensureAuth, loadController.showDetail);

//  GÜNCELLEME (Edit formundan gelen POST buraya düşecek)
router.post('/:id', ensureAuth, loadController.update);

// (Varsa) DÜZENLEME SAYFASI  /loads/:id/edit
router.get('/:id/edit', ensureAuth, loadController.showEditForm);
router.post('/:id/edit', ensureAuth, loadController.update);

// SILME  POST /loads/:id/delete
router.post('/:id/delete', ensureAuth, loadController.delete);

// EDIT LOG HISTORY ROUTE
router.get('/:id/logs', ensureAuth, loadController.showLogs);


module.exports = router;
