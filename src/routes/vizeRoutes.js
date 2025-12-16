const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/authMiddleware');

// GET /vize-takip → göster Google Sheets embed
router.get('/', ensureAuth, (req, res, next) => {
  // Publicly published Google Sheets URL (from user)
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSDMgez1jbKj040EyRK1J0dLXDH-e1_qOYExQirIWtZqJ6FYBioyvqK_Hca7UaKHF4cSHtnUUeMvq2W/pubhtml?gid=1144211254&single=true';
  res.render('vizetakip', { sheetUrl });
});

module.exports = router;
