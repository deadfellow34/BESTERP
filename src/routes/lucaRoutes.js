/**
 * Luca e-Fatura API Routes
 * 
 * Bu modül Luca muhasebe entegrasyonu için API endpoint'lerini sağlar.
 */

const express = require('express');
const router = express.Router();
const lucaService = require('../services/lucaService');

// Middleware - Auth check
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Oturum açmanız gerekiyor' });
  }
  next();
};

// Admin check
const requireAdmin = (req, res, next) => {
  if (!req.session?.user?.role || !['admin', 'muhasebe'].includes(req.session.user.role)) {
    return res.status(403).json({ success: false, message: 'Yetkiniz yok' });
  }
  next();
};

// =====================
// ANA SAYFA
// =====================

/**
 * GET /luca
 * Luca e-Fatura yönetim sayfası
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    res.render('luca/index', {
      title: 'Luca e-Fatura',
      currentUser: req.session.user
    });
  } catch (error) {
    console.error('[Luca] Sayfa yükleme hatası:', error);
    res.status(500).send('Sayfa yüklenirken hata oluştu');
  }
});

// =====================
// GENEL
// =====================

/**
 * GET /api/luca/health
 * API sağlık kontrolü
 */
router.get('/health', async (req, res) => {
  try {
    const result = await lucaService.healthCheck();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/status
 * Bağlantı durumu
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const tokenInfo = lucaService.getTokenInfo();
    res.json({ 
      success: true, 
      connected: tokenInfo.hasToken,
      ...tokenInfo
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================
// KİMLİK DOĞRULAMA
// =====================

/**
 * POST /api/luca/login
 * Luca'ya giriş yap
 */
router.post('/login', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { identificationNumber, password } = req.body;
    const result = await lucaService.login(identificationNumber, password);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/logout
 * Çıkış yap
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await lucaService.logout();
    res.json({ success: true, message: 'Çıkış yapıldı' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/companies
 * Şirket listesi
 */
router.get('/companies', requireAuth, async (req, res) => {
  try {
    await lucaService.ensureAuthenticated();
    const companies = lucaService.getCompanyList();
    res.json({ success: true, companies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================
// PARAMETRELER
// =====================

/**
 * GET /api/luca/parameters
 * Tüm parametreleri al
 */
router.get('/parameters', requireAuth, async (req, res) => {
  try {
    const params = await lucaService.getAllParameters();
    res.json({ success: true, ...params });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/currencies
 * Para birimleri
 */
router.get('/currencies', requireAuth, async (req, res) => {
  try {
    const currencies = await lucaService.getCurrencyList();
    res.json({ success: true, currencies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoice-types
 * Fatura tipleri
 */
router.get('/invoice-types', requireAuth, async (req, res) => {
  try {
    const invoiceTypes = await lucaService.getInvoiceTypeList();
    res.json({ success: true, invoiceTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/measure-units
 * Ölçü birimleri
 */
router.get('/measure-units', requireAuth, async (req, res) => {
  try {
    const measureUnits = await lucaService.getMeasureUnitList();
    res.json({ success: true, measureUnits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/tax-types
 * Vergi türleri
 */
router.get('/tax-types', requireAuth, async (req, res) => {
  try {
    const taxTypes = await lucaService.getTaxTypeList();
    res.json({ success: true, taxTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/cities
 * İl listesi
 */
router.get('/cities', requireAuth, async (req, res) => {
  try {
    const cities = await lucaService.getCityCodeList();
    res.json({ success: true, cities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/towns/:cityCode
 * İlçe listesi
 */
router.get('/towns/:cityCode', requireAuth, async (req, res) => {
  try {
    const towns = await lucaService.getTownCodeList(req.params.cityCode);
    res.json({ success: true, towns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/tax-offices
 * Vergi daireleri
 */
router.get('/tax-offices', requireAuth, async (req, res) => {
  try {
    const taxOffices = await lucaService.getTaxOfficeList();
    res.json({ success: true, taxOffices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/tax-exemption-codes
 * Vergi muafiyet kodları
 */
router.get('/tax-exemption-codes', requireAuth, async (req, res) => {
  try {
    const codes = await lucaService.getTaxExemptionCodeList();
    res.json({ success: true, codes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================
// ŞİRKET / ALICI
// =====================

/**
 * GET /api/luca/recipients
 * Alıcı listesi
 */
router.get('/recipients', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const recipients = await lucaService.getRecipientList(companyId);
    res.json({ success: true, recipients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/recipients/:id
 * Alıcı detayı
 */
router.get('/recipients/:id', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const recipient = await lucaService.getRecipientDetail(companyId, req.params.id);
    res.json({ success: true, recipient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/recipients
 * Yeni alıcı kaydet
 */
router.post('/recipients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.saveRecipient(companyId, req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/gib-query/:vknTckn
 * VKN/TCKN ile GİB sorgusu
 */
router.get('/gib-query/:vknTckn', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.getGibUserByVknTckn(companyId, req.params.vknTckn);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/balance
 * Şirket bakiyesi
 */
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const balance = await lucaService.getCompanyBalance(companyId);
    res.json({ success: true, ...balance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/bank-accounts
 * Banka hesapları
 */
router.get('/bank-accounts', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const bankAccounts = await lucaService.getCompanyBankList(companyId);
    res.json({ success: true, bankAccounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/dashboard
 * Şirket dashboard özeti
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const dashboard = await lucaService.getCompanyDashboardSummary(companyId);
    res.json({ success: true, ...dashboard });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================
// FATURA
// =====================

/**
 * POST /api/luca/invoices
 * Fatura oluştur
 */
router.post('/invoices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await lucaService.saveInvoice(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/staging
 * Taslak fatura listesi
 */
router.get('/invoices/staging', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const filters = {
      pageIndex: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.limit) || 50,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      invoiceNumber: req.query.invoiceNumber,
      recipientName: req.query.recipientName
    };
    const invoices = await lucaService.getStagingInvoiceList(companyId, filters);
    res.json({ success: true, invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/sent
 * Gönderilmiş fatura listesi
 */
router.get('/invoices/sent', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const filters = {
      pageIndex: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.limit) || 50,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    const invoices = await lucaService.getSentStagingInvoiceList(companyId, filters);
    res.json({ success: true, invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/earchive
 * e-Arşiv fatura listesi
 */
router.get('/invoices/earchive', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const filters = {
      pageIndex: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.limit) || 50
    };
    const invoices = await lucaService.getEArchiveInvoiceList(companyId, filters);
    res.json({ success: true, invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/incoming
 * Gelen e-Fatura listesi
 */
router.get('/invoices/incoming', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const filters = {
      pageIndex: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.limit) || 50
    };
    const invoices = await lucaService.getIncomingEInvoiceList(companyId, filters);
    res.json({ success: true, invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/:id
 * Fatura detayı
 */
router.get('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const invoice = await lucaService.getStagingInvoice(companyId, req.params.id);
    res.json({ success: true, invoice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/:id/html
 * Fatura HTML önizleme
 */
router.get('/invoices/:id/html', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const html = await lucaService.getInvoiceHtml(companyId, req.params.id);
    res.send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/invoices/:id/send
 * Fatura gönder
 */
router.post('/invoices/:id/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.sendStagingInvoice(companyId, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/invoices/:id/approve
 * Fatura onayla
 */
router.post('/invoices/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.approveStagingInvoice(companyId, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/invoices/:id/cancel
 * e-Arşiv fatura iptal
 */
router.post('/invoices/:id/cancel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.cancelEArchiveInvoice(companyId, req.params.id, req.body.reason);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/invoices/:id/clone
 * Fatura kopyala
 */
router.post('/invoices/:id/clone', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.cloneInvoice(companyId, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/:id/pdf
 * Fatura PDF indir
 */
router.get('/invoices/:id/pdf', requireAuth, async (req, res) => {
  try {
    const pdf = await lucaService.getInvoicePdf(req.params.id, req.query.ettn);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=fatura_${req.params.id}.pdf`);
    res.send(Buffer.from(pdf));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/:id/xml
 * Fatura XML indir
 */
router.get('/invoices/:id/xml', requireAuth, async (req, res) => {
  try {
    const xml = await lucaService.getInvoiceXml(req.params.id, req.query.ettn);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=fatura_${req.params.id}.xml`);
    res.send(xml);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/invoices/:id/external-url
 * Fatura harici URL
 */
router.get('/invoices/:id/external-url', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const url = await lucaService.getInvoiceExternalUrl(companyId, req.params.id);
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =====================
// İRSALİYE
// =====================

/**
 * POST /api/luca/despatches
 * İrsaliye oluştur
 */
router.post('/despatches', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await lucaService.saveDespatchAdvice(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/despatches/staging
 * Taslak irsaliye listesi
 */
router.get('/despatches/staging', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const despatches = await lucaService.getStagingDespatchList(companyId, req.query);
    res.json({ success: true, despatches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/despatches/sent
 * Gönderilmiş irsaliye listesi
 */
router.get('/despatches/sent', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const despatches = await lucaService.getSentStagingDespatchList(companyId, req.query);
    res.json({ success: true, despatches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/luca/despatches/incoming
 * Gelen irsaliye listesi
 */
router.get('/despatches/incoming', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const despatches = await lucaService.getIncomingDespatchList(companyId, req.query);
    res.json({ success: true, despatches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/despatches/:id/send
 * İrsaliye gönder
 */
router.post('/despatches/:id/send', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.sendStagingDespatch(companyId, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// =====================
// ÜRÜN
// =====================

/**
 * GET /api/luca/products
 * Ürün listesi
 */
router.get('/products', requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId || lucaService.getActiveCompanyId();
    const products = await lucaService.getProductList(companyId);
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/luca/products
 * Ürün kaydet
 */
router.post('/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.body.companyId || lucaService.getActiveCompanyId();
    const result = await lucaService.saveProduct(companyId, req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// =====================
// POZİSYONDAN FATURA
// =====================

/**
 * POST /api/luca/invoices/from-position
 * Pozisyondan fatura oluştur
 */
router.post('/invoices/from-position', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { position, recipientData, options } = req.body;
    const companyId = options?.companyId || lucaService.getActiveCompanyId();
    
    const invoiceData = lucaService.createInvoiceFromPosition(position, companyId, recipientData, options);
    const result = await lucaService.saveInvoice(invoiceData);
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
