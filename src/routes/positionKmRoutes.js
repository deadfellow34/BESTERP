const express = require('express');
const router = express.Router();
const PositionKmModel = require('../models/positionKmModel');

// POST /api/position/:positionNo/km -> save/upsert km data
router.post('/position/:positionNo/km', (req, res) => {
  const positionNo = req.params.positionNo;
  const { segments, totalKm, loadingCount, unloadingCount, exitCount, europeCount, herstal, avrupa, avrupaData } = req.body || {};
  console.log(`[positionKmRoutes] POST save for ${positionNo}: totalKm=${totalKm}, loading=${loadingCount}, unloading=${unloadingCount}, exit=${exitCount}, europe=${europeCount}, herstal=${herstal}, avrupa=${avrupa}, avrupaData=${JSON.stringify(avrupaData)}`);

  PositionKmModel.upsert(positionNo, { segments, totalKm, loadingCount, unloadingCount, exitCount, europeCount, herstal, avrupa, avrupaData }, (err, result) => {
    if (err) {
      console.error('Error saving position KM:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    console.log('[positionKmRoutes] save result:', result);
    return res.json({ success: true, result });
  });
});

// GET /api/position/:positionNo/km -> fetch single position km (debug)
router.get('/position/:positionNo/km', (req, res) => {
  const positionNo = req.params.positionNo;
  PositionKmModel.getAll((err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    const found = (rows || []).find(r => r.position_no === positionNo);
    if (!found) return res.json({ success: true, km: null });
    return res.json({ success: true, km: found });
  });
});

module.exports = router;
