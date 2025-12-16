// backend/src/routes/driverUploadRoutes.js
const express = require('express');
const router = express.Router();
const driverUploadController = require('../controllers/driverUploadController');

// Auth middleware
const ensureAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Management page (requires auth) - MUST be before /:token routes
router.get('/management', ensureAuth, driverUploadController.showManagementPage);

// Public routes (no auth required) - for drivers
router.get('/:token', driverUploadController.showUploadPage);
router.post('/:token', driverUploadController.handleUpload);

module.exports = router;
