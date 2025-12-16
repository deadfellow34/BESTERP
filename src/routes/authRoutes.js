// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Giriş ekranı
router.get('/login', authController.showLogin);

// Giriş POST
router.post('/login', authController.login);

// Çıkış
router.get('/logout', authController.logout);

module.exports = router;
