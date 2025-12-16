const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/authMiddleware');
const logsController = require('../controllers/logsController');

// Middleware: Ensure logs panel is verified (PIN entered)
function ensureLogsVerified(req, res, next) {
  if (req.session && req.session.isLogsVerified === true) {
    return next();
  }
  return res.redirect('/logs/login');
}

// ============ AUTH ROUTES ============
// GET /logs/login - Show PIN login form
router.get('/login', ensureAuth, logsController.showPinLogin);

// POST /logs/login - Verify PIN
router.post('/login', ensureAuth, logsController.verifyPin);

// POST /logs/logout - Logout from logs (clear verification)
router.post('/logout', ensureAuth, logsController.logoutLogs);

// Ana sayfa - pozisyon listesi (requires PIN verification)
router.get('/', ensureAuth, ensureLogsVerified, logsController.index);

// Arama
router.get('/search', ensureAuth, ensureLogsVerified, logsController.search);

// Bugünün logları
router.get('/today', ensureAuth, ensureLogsVerified, logsController.today);

// Son loglar
router.get('/recent', ensureAuth, ensureLogsVerified, logsController.recent);

// İstatistikler
router.get('/stats', ensureAuth, ensureLogsVerified, logsController.stats);

// Tarih aralığı
router.get('/date', ensureAuth, ensureLogsVerified, logsController.byDateRange);

// Kullanıcıya göre
router.get('/user/:username', ensureAuth, ensureLogsVerified, logsController.byUser);

// Pozisyon detayı
router.get('/position/:positionNo', ensureAuth, ensureLogsVerified, logsController.position);

// API - Stats JSON
router.get('/api/stats', ensureAuth, ensureLogsVerified, logsController.apiStats);

// Tümünü temizle
router.post('/clear', ensureAuth, ensureLogsVerified, logsController.clearAll);

module.exports = router;
