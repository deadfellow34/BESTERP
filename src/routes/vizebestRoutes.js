const express = require('express');
const router = express.Router();
const VizeBestModel = require('../models/vizebestModel');
const { ensureAuth } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// GET /vizebest/data -> return saved rows (active only)
router.get('/data', ensureAuth, (req, res) => {
  VizeBestModel.getAll((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ rows: rows || [] });
  });
});

// GET /vizebest/deleted -> return soft-deleted rows
router.get('/deleted', ensureAuth, (req, res) => {
  VizeBestModel.getDeleted((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ rows: rows || [] });
  });
});

// POST /vizebest/add -> add a row (expects JSON)
router.post('/add', ensureAuth, (req, res) => {
  const data = req.body || {};
  VizeBestModel.create(data, (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    return res.json({ success: true, id: result.id });
  });
});

// POST /vizebest/delete/:id -> soft delete row
router.post('/delete/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  VizeBestModel.delete(id, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// POST /vizebest/restore/:id -> restore soft-deleted row
router.post('/restore/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  VizeBestModel.restore(id, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// POST /vizebest/permanent-delete/:id -> permanently delete row
router.post('/permanent-delete/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  VizeBestModel.permanentDelete(id, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// POST /vizebest/update/:id -> update row
router.post('/update/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  const data = req.body || {};
  VizeBestModel.update(id, data, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});



// File upload endpoint: POST /vizebest/upload/:id
router.post('/upload/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  // support optional column (e.g. ?col=ukvisa)
  const col = req.query && req.query.col ? String(req.query.col).replace(/[^a-z0-9_\-]/ig, '') : '';
  const destDir = path.join(__dirname, '..', '..', 'uploads', 'vizebest', String(id), col || '');
  try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) {}
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, destDir); },
    filename: function (req, file, cb) {
      // keep original name but avoid collisions by prefixing timestamp
      const safeName = file.originalname.replace(/[^a-zA-Z0-9\.\-_\s]/g, '_');
      cb(null, Date.now() + '_' + safeName);
    }
  });
  const upload = multer({ storage: storage }).array('files');
  upload(req, res, function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    // return list of uploaded filenames and relative URLs (use same scheme as page)
    const relBase = '/uploads/vizebest/' + encodeURIComponent(String(id)) + (col ? '/' + encodeURIComponent(col) : '');
    const files = (req.files || []).map(f => ({ name: f.filename, url: relBase + '/' + encodeURIComponent(f.filename) }));
    return res.json({ success: true, files });
  });
});

// List attachments for a row: GET /vizebest/attachments/:id
router.get('/attachments/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  const col = req.query && req.query.col ? String(req.query.col).replace(/[^a-z0-9_\-]/ig, '') : '';
  const dir = path.join(__dirname, '..', '..', 'uploads', 'vizebest', String(id), col || '');
  fs.readdir(dir, (err, files) => {
    if (err) {
      if (err.code === 'ENOENT') return res.json({ files: [] });
      return res.status(500).json({ success: false, error: err.message });
    }
    const relBase = '/uploads/vizebest/' + encodeURIComponent(String(id)) + (col ? '/' + encodeURIComponent(col) : '');
    const list = files.map(f => ({ name: f, url: relBase + '/' + encodeURIComponent(f) }));
    return res.json({ files: list });
  });
});

// Delete an attachment: POST /vizebest/attachments/delete/:id  { filename }  optional ?col=...
router.post('/attachments/delete/:id', ensureAuth, (req, res) => {
  const id = req.params.id;
  const filename = req.body && req.body.filename;
  const col = req.query && req.query.col ? String(req.query.col).replace(/[^a-z0-9_\-]/ig, '') : '';
  if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
  if (!filename) return res.status(400).json({ success: false, error: 'Missing filename' });
  const safeName = path.basename(String(filename));
  const filePath = path.join(__dirname, '..', '..', 'uploads', 'vizebest', String(id), col || '', safeName);
  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ success: false, error: 'File not found' });
      return res.status(500).json({ success: false, error: err.message });
    }
    return res.json({ success: true });
  });
});

// Delete an attachment: POST /vizebest/attachments/delete/:id  { filename }
// (old duplicate deleted)

// BATCH: Get attachment counts for multiple rows at once
// POST /vizebest/attachments/batch-counts { ids: [1,2,3], cols: ['ukvisa','schengen',...] }
router.post('/attachments/batch-counts', ensureAuth, async (req, res) => {
  try {
    const { ids, cols } = req.body || {};
    if (!ids || !Array.isArray(ids) || !cols || !Array.isArray(cols)) {
      return res.status(400).json({ success: false, error: 'ids and cols arrays required' });
    }
    
    const results = {};
    const baseDir = path.join(__dirname, '..', '..', 'uploads', 'vizebest');
    
    for (const id of ids) {
      results[id] = {};
      for (const col of cols) {
        const safeCol = String(col).replace(/[^a-z0-9_\-]/ig, '');
        const dir = path.join(baseDir, String(id), safeCol);
        try {
          const files = fs.readdirSync(dir);
          results[id][safeCol] = files.length;
        } catch (e) {
          results[id][safeCol] = 0;
        }
      }
    }
    
    return res.json({ success: true, counts: results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
