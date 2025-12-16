// backend/src/models/sealModel.js
const db = require('../config/db');

const SealModel = {
  // helper to decide which column names exist and invoke cb(names)
  _getColumns(cb) {
    db.all("PRAGMA table_info('seals')", [], (err, rows) => {
      if (err) return cb(err);
      const names = (rows || []).map(r => r.name);
      cb(null, names);
    });
  },

  getAll(callback) {
    this._getColumns((err, names) => {
      if (err) return callback(err);
      const hasCode = names.includes('code');
      const hasSealNo = names.includes('seal_no');
      const codeExpr = hasCode ? 'code' : (hasSealNo ? 'seal_no AS code' : 'NULL AS code');
      const usedInExpr = names.includes('used_in_position') ? 'used_in_position' : (names.includes('used_in_load_id') ? 'used_in_load_id AS used_in_position' : 'NULL AS used_in_position');

      const sql = `SELECT id, ${codeExpr}, is_used, used_at, ${usedInExpr} FROM seals ORDER BY ${hasCode ? 'code' : (hasSealNo ? 'seal_no' : 'id')} ASC`;
      db.all(sql, [], callback);
    });
  },

  getAvailable(callback) {
    this._getColumns((err, names) => {
      if (err) return callback(err);
      const hasCode = names.includes('code');
      const hasSealNo = names.includes('seal_no');
      const codeExpr = hasCode ? 'code' : (hasSealNo ? 'seal_no AS code' : 'NULL AS code');
      const usedInExpr = names.includes('used_in_position') ? 'used_in_position' : (names.includes('used_in_load_id') ? 'used_in_load_id AS used_in_position' : 'NULL AS used_in_position');

      const sql = `SELECT id, ${codeExpr}, is_used, used_at, ${usedInExpr} FROM seals WHERE is_used = 0 ORDER BY ${hasCode ? 'code' : (hasSealNo ? 'seal_no' : 'id')} ASC`;
      db.all(sql, [], (e, rows) => {
        if (e) return callback(e);
        // Ensure special TRIMEX seal is always available for selection
        const hasTrimex = (rows || []).some(r => String(r.code).toUpperCase() === 'TRIMEX');
        if (hasTrimex) return callback(null, rows);

        // Try to find TRIMEX in the table (regardless of is_used) and include it at the front
        const searchCol = hasCode ? 'code' : (hasSealNo ? 'seal_no' : null);
        if (!searchCol) return callback(null, rows);
        db.get(`SELECT id, ${searchCol} AS code, is_used, used_at, ${usedInExpr} FROM seals WHERE ${searchCol} = ? LIMIT 1`, ['TRIMEX'], (gErr, gRow) => {
          if (gErr) return callback(gErr);
          if (gRow) {
            // put TRIMEX first
            const out = [gRow].concat(rows || []);
            return callback(null, out);
          }
          return callback(null, rows);
        });
      });
    });
  },

  // mark selected seal as used; positionLabel is kept for backwards compatibility
  markAsUsed(code, positionLabel, callback) {
    if (!code) return callback(null);
    // Do not mark the special TRIMEX seal as used — it can be selected unlimited times
    if (String(code).toUpperCase() === 'TRIMEX') return callback(null);
    this._getColumns((err, names) => {
      if (err) return callback(err);
      const queries = [];
      if (names.includes('code')) {
        // update used_in_position if present
        if (names.includes('used_in_position')) {
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_position = ? WHERE code = ?`, params: [positionLabel || null, code] });
        } else if (names.includes('used_in_load_id')) {
          // cannot store position label into load_id; just mark used and null load id
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_load_id = NULL WHERE code = ?`, params: [code] });
        } else {
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now') WHERE code = ?`, params: [code] });
        }
      } else if (names.includes('seal_no')) {
        if (names.includes('used_in_load_id')) {
          // update used_in_load_id if provided (expecting numeric), else set to NULL
          const maybeId = Number(positionLabel);
          const updateParams = (Number.isFinite(maybeId) && maybeId > 0) ? [maybeId, code] : [null, code];
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_load_id = ? WHERE seal_no = ?`, params: updateParams });
        } else if (names.includes('used_in_position')) {
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now'), used_in_position = ? WHERE seal_no = ?`, params: [positionLabel || null, code] });
        } else {
          queries.push({ sql: `UPDATE seals SET is_used = 1, used_at = datetime('now') WHERE seal_no = ?`, params: [code] });
        }
      }

      // execute queries sequentially
      const runNext = (i) => {
        if (i >= queries.length) return callback(null);
        const q = queries[i];
        db.run(q.sql, q.params, (e) => {
          if (e) return callback(e);
          runNext(i + 1);
        });
      };
      runNext(0);
    });
  },

  markAsUnused(code, callback) {
    if (!code) return callback(null);
    this._getColumns((err, names) => {
      if (err) return callback(err);
      let sql = '';
      let params = [code];
      if (names.includes('code')) {
        if (names.includes('used_in_position')) {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL, used_in_position = NULL WHERE code = ?`;
        } else if (names.includes('used_in_load_id')) {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL, used_in_load_id = NULL WHERE code = ?`;
        } else {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL WHERE code = ?`;
        }
      } else if (names.includes('seal_no')) {
        if (names.includes('used_in_position')) {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL, used_in_position = NULL WHERE seal_no = ?`;
        } else if (names.includes('used_in_load_id')) {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL, used_in_load_id = NULL WHERE seal_no = ?`;
        } else {
          sql = `UPDATE seals SET is_used = 0, used_at = NULL WHERE seal_no = ?`;
        }
      } else {
        sql = `UPDATE seals SET is_used = 0, used_at = NULL WHERE id = ?`;
        params = [code];
      }

      db.run(sql, params, function (er) {
        if (callback) callback(er);
      });
    });
  },

  getByPosition(positionNo, callback) {
    // Try both columns
    this._getColumns((err, names) => {
      if (err) return callback(err);
      if (names.includes('used_in_position')) {
        const sql = `SELECT id, (CASE WHEN code IS NOT NULL THEN code WHEN seal_no IS NOT NULL THEN seal_no ELSE NULL END) AS seal_code, is_used, used_at, used_in_position FROM seals WHERE used_in_position = ? ORDER BY id DESC LIMIT 1`;
        return db.get(sql, [positionNo], callback);
      } else if (names.includes('used_in_load_id')) {
        // cannot match by textual positionNo to load_id; return undefined
        return callback(null, undefined);
      }
      return callback(null, undefined);
    });
  }
};

// Find a seal row by its code/seal_no value
SealModel.findByCode = function(codeValue, callback) {
  if (!codeValue) return callback(null, null);
  this._getColumns((err, names) => {
    if (err) return callback(err);
    const hasCode = names.includes('code');
    const hasSealNo = names.includes('seal_no');
    let sql = '';
    let params = [codeValue];
    if (hasCode) {
      sql = `SELECT id, code AS code, is_used, used_at, ${names.includes('used_in_position') ? 'used_in_position' : (names.includes('used_in_load_id') ? 'used_in_load_id AS used_in_position' : 'NULL AS used_in_position')} FROM seals WHERE code = ? LIMIT 1`;
    } else if (hasSealNo) {
      sql = `SELECT id, seal_no AS code, is_used, used_at, ${names.includes('used_in_position') ? 'used_in_position' : (names.includes('used_in_load_id') ? 'used_in_load_id AS used_in_position' : 'NULL AS used_in_position')} FROM seals WHERE seal_no = ? LIMIT 1`;
    } else {
      // fallback: search by id
      sql = `SELECT id, NULL AS code, is_used, used_at, NULL AS used_in_position FROM seals WHERE id = ? LIMIT 1`;
      params = [Number(codeValue) || 0];
    }
    db.get(sql, params, callback);
  });
};

module.exports = SealModel;



module.exports = SealModel;
