const db = require('../config/db');
const SealModel = require('../models/sealModel');

const sealController = {
  // GET /seals - list
  list(req, res, next) {
    SealModel.getAll((err, seals) => {
      if (err) return next(err);
      // Try to normalize property name: some schemas use `code`, others `seal_no`
      const normalized = (seals || []).map(s => {
        if (s.code) return s;
        if (s.seal_no) return { ...s, code: s.seal_no };
        return s;
      });
      return res.render('seals/index', { seals: normalized });
    });
  },

  // GET /seals/new - show create form
  showCreateForm(req, res, next) {
    return res.render('seals/new', { error: null });
  },

  // POST /seals - create new seal (resilient to column name differences)
  create(req, res, next) {
    const val = (req.body.seal_no || req.body.code || req.body.seal || '').toString().trim();
    if (!val) {
      return res.render('seals/new', { error: 'Lütfen geçerli bir mühür kodu girin.' });
    }

    // Try insert into `code` column first, fallback to `seal_no`
    const tryInsert = (col, cb) => {
      const sql = `INSERT INTO seals (${col}) VALUES (?)`;
      db.run(sql, [val], function (err) {
        cb(err, this && this.lastID);
      });
    };

    tryInsert('code', (err, id) => {
      if (!err) return res.redirect('/seals');
      // if column `code` doesn't exist, try `seal_no`
      if (err.message && err.message.toLowerCase().includes('no such column')) {
        tryInsert('seal_no', (err2, id2) => {
          if (err2) return next(err2);
          return res.redirect('/seals');
        });
      } else if (err.message && err.message.toLowerCase().includes('unique')) {
        return res.render('seals/new', { error: 'Bu mühür zaten mevcut.' });
      } else {
        return next(err);
      }
    });
  },

  // POST /seals/:id/use - mark a seal as used (accept optional load_id in body)
  markUsed(req, res, next) {
    const id = req.params.id;
    const loadId = req.body.load_id || null;

    // Determine which column names exist and update accordingly
    db.get("PRAGMA table_info('seals')", [], (err, cols) => {
      // If PRAGMA returns rows via db.all normally; handle both
      const handleCols = (rows) => {
        const names = (rows || []).map(r => r.name);
        const hasSealNo = names.includes('seal_no');
        const hasCode = names.includes('code');

        let sql = '';
        if (hasCode) {
          sql = `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_position = NULL WHERE id = ?`;
        } else if (hasSealNo) {
          sql = `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_load_id = ? WHERE id = ?`;
        } else {
          // fallback generic
          sql = `UPDATE seals SET is_used = 1, used_at = datetime('now') WHERE id = ?`;
        }

        const params = hasSealNo && !hasCode ? [loadId || null, id] : [id];
        db.run(sql, params, function (uerr) {
          if (uerr) return next(uerr);
          return res.redirect('/seals');
        });
      };

      // PRAGMA may return via all or get depending on wrapper — use all
      db.all("PRAGMA table_info('seals')", [], (pErr, rows) => {
        if (pErr) return next(pErr);
        handleCols(rows);
      });
    });
  }
};

module.exports = sealController;
