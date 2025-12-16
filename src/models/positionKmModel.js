const db = require('../config/db');
const dateUtils = require('../utils/dateUtils');

const PositionKmModel = {
  ensureTable(callback) {
    const sql = `
      CREATE TABLE IF NOT EXISTS position_km (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_no TEXT UNIQUE,
        segments TEXT,
        total_km REAL,
        loading_count INTEGER,
        unloading_count INTEGER,
        exit_count INTEGER DEFAULT 0,
        europe_count INTEGER DEFAULT 0,
        herstal INTEGER DEFAULT 0,
        avrupa INTEGER DEFAULT 0,
        avrupa_data TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `;
    db.run(sql, [], (err) => {
      if (err) return callback(err);
      // Ensure herstal column exists on older DBs
      db.all("PRAGMA table_info('position_km')", [], (pErr, cols) => {
        if (pErr) return callback(null);
        const needed = ['herstal', 'exit_count', 'europe_count', 'avrupa', 'avrupa_data'];
        const missing = (needed || []).filter(n => !(cols || []).some(c => c.name === n));
        if (missing.length === 0) return callback(null);

        // Add missing columns sequentially
        (function addNext() {
          const col = missing.shift();
          if (!col) return callback(null);
          let alterSql = col === 'avrupa_data' 
            ? 'ALTER TABLE position_km ADD COLUMN avrupa_data TEXT' 
            : 'ALTER TABLE position_km ADD COLUMN ' + col + ' INTEGER DEFAULT 0';
          db.run(alterSql, [], (aErr) => {
            // ignore errors but continue
            addNext();
          });
        })();
      });
    });
  },

  getAll(callback) {
    const sql = `SELECT position_no, segments, total_km, loading_count, unloading_count, exit_count, europe_count, herstal, avrupa, avrupa_data, created_at, updated_at FROM position_km`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.warn('positionKmModel.getAll: query error, returning empty array.', err && err.message);
        return callback(null, []);
      }
      // ensure numbers
      const parsed = (rows || []).map(r => {
        let avrupaDataParsed = null;
        if (r.avrupa_data) {
          try { avrupaDataParsed = JSON.parse(r.avrupa_data); } catch(e) {}
        }
        return {
          position_no: r.position_no,
          segments: r.segments ? JSON.parse(r.segments) : [],
          total_km: r.total_km ? parseFloat(r.total_km) : 0,
          loading_count: r.loading_count ? parseInt(r.loading_count, 10) : 0,
          unloading_count: r.unloading_count ? parseInt(r.unloading_count, 10) : 0,
          exit_count: r.exit_count ? parseInt(r.exit_count, 10) : 0,
          europe_count: r.europe_count ? parseInt(r.europe_count, 10) : 0,
          herstal: r.herstal ? !!r.herstal : false,
          avrupa: r.avrupa ? !!r.avrupa : false,
          avrupa_data: avrupaDataParsed,
          created_at: r.created_at,
          updated_at: r.updated_at
        };
      });
      return callback(null, parsed);
    });
  },

  // upsert by position_no
  upsert(positionNo, data, callback) {
    this.ensureTable((err) => {
      if (err) return callback(err);

      const now = dateUtils.getNowGMT3().toISOString();
      const segmentsJson = JSON.stringify(data.segments || []);
      const totalKm = parseFloat(data.totalKm) || 0;
      const loadingCount = parseInt(data.loadingCount || 0, 10);
      const unloadingCount = parseInt(data.unloadingCount || 0, 10);
      const exitCount = parseInt(data.exitCount || data.exit_count || 0, 10);
      const europeCount = parseInt(data.europeCount || data.europe_count || 0, 10);
      const herstalFlag = data.herstal ? 1 : 0;
      const avrupaFlag = data.avrupa ? 1 : 0;
      const avrupaDataJson = data.avrupaData ? JSON.stringify(data.avrupaData) : null;

      const selectSql = `SELECT id FROM position_km WHERE position_no = ?`;
      db.get(selectSql, [positionNo], (selErr, row) => {
        if (selErr) return callback(selErr);
        if (row && row.id) {
          const upd = `UPDATE position_km SET segments = ?, total_km = ?, loading_count = ?, unloading_count = ?, exit_count = ?, europe_count = ?, herstal = ?, avrupa = ?, avrupa_data = ?, updated_at = ? WHERE position_no = ?`;
          db.run(upd, [segmentsJson, totalKm, loadingCount, unloadingCount, exitCount, europeCount, herstalFlag, avrupaFlag, avrupaDataJson, now, positionNo], function (uErr) {
            if (uErr) return callback(uErr);
            callback(null, { updated: true });
          });
        } else {
          const ins = `INSERT INTO position_km (position_no, segments, total_km, loading_count, unloading_count, exit_count, europe_count, herstal, avrupa, avrupa_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          db.run(ins, [positionNo, segmentsJson, totalKm, loadingCount, unloadingCount, exitCount, europeCount, herstalFlag, avrupaFlag, avrupaDataJson, now, now], function (iErr) {
            if (iErr) return callback(iErr);
            callback(null, { insertedId: this.lastID });
          });
        }
      });
    });
  }
};

// Ensure the table exists when the module is loaded to avoid "no such table" errors
PositionKmModel.ensureTable((err) => {
  if (err) {
    console.error('positionKmModel: failed to ensure table:', err && err.message);
  }
});

module.exports = PositionKmModel;
