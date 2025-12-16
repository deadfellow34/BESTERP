// backend/src/routes/databaseRoutes.js
const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const { ensureAuth } = require('../middleware/authMiddleware');

// GET /database → Veritabanı yönetim sayfası
router.get('/', ensureAuth, databaseController.showDatabasePage);

// POST /database/add-company → Şirket ekle
router.post('/add-company', ensureAuth, databaseController.addCompany);

// POST /database/delete-company/:id → Şirket sil
router.post('/delete-company/:id', ensureAuth, databaseController.deleteCompany);

// POST /database/add-seal → Mühür ekle
router.post('/add-seal', ensureAuth, databaseController.addSeal);

// POST /database/add-truck-driver → Çekici / şoför ekle veya güncelle
router.post('/add-truck-driver', ensureAuth, databaseController.addTruckDriver);

// POST /database/delete-truck/:id → Çekici sil
router.post('/delete-truck/:id', ensureAuth, databaseController.deleteTruck);

// POST /database/delete-seal/:id → Mühür sil
router.post('/delete-seal/:id', ensureAuth, databaseController.deleteSeal);

// POST /database/unmark-seal/:id → Kullanılmış mühürü tekrar kullanılabilir yap
router.post('/unmark-seal/:id', ensureAuth, databaseController.unmarkSeal);

// POST /database/clear-chat → Tüm chat loglarını sil
router.post('/clear-chat', ensureAuth, databaseController.clearChatLogs);

// GET /database/chat-stats → Chat istatistikleri
router.get('/chat-stats', ensureAuth, databaseController.getChatStats);

module.exports = router;
