const express = require('express');
const router = express.Router();
const accountingController = require('../controllers/accountingController');
const { ensureAuth, ensureAccountingModify } = require('../middleware/authMiddleware');

// Ana sayfa
router.get('/', ensureAuth, accountingController.index);

// Dosya yükleme
router.post('/upload', ensureAuth, ensureAccountingModify, accountingController.upload);

// Dosyaları listeleme
router.get('/files/:type', ensureAuth, accountingController.listFiles);

// Pozisyona ait dosyaları listeleme
router.get('/position-files/:positionNo', ensureAuth, accountingController.positionFiles);

// Dosya görüntüleme
router.get('/view/:type/:filename', ensureAuth, accountingController.viewFile);

// Dosya silme
router.delete('/delete/:type/:filename', ensureAuth, ensureAccountingModify, accountingController.deleteFile);

module.exports = router;
