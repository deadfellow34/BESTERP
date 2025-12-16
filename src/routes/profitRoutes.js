const express = require('express');
const router = express.Router();
const profitController = require('../controllers/profitController');
const { ensureAuth } = require('../middleware/authMiddleware');

// GET /profit - Main profit listing page
router.get('/', ensureAuth, profitController.index);

// GET /profit/dashboard - Profit dashboard with charts
router.get('/dashboard', ensureAuth, profitController.dashboard);

// GET /profit/api/data - API endpoint for profit data (JSON)
router.get('/api/data', ensureAuth, profitController.apiData);

// GET /profit/api/dashboard - API endpoint for dashboard chart data
router.get('/api/dashboard', ensureAuth, profitController.apiDashboard);

module.exports = router;
