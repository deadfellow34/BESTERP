const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bestfreight.db');
const positionNo = process.argv[2];
const totalKmArg = process.argv[3];

if (!positionNo) {
  console.error('Usage: node insert_position_km.js <position_no> [totalKm]');
  process.exit(1);
}

const totalKm = totalKmArg ? parseFloat(totalKmArg) : 0;
const now = new Date().toISOString();

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
});

const ensureSql = `
CREATE TABLE IF NOT EXISTS position_km (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_no TEXT UNIQUE,
  segments TEXT,
  total_km REAL,
  loading_count INTEGER,
  unloading_count INTEGER,
  created_at TEXT,
  updated_at TEXT
)
`;

db.serialize(() => {
  db.run(ensureSql, [], (e) => {
    if (e) return console.error('Failed to ensure table:', e.message);

    const select = `SELECT id FROM position_km WHERE position_no = ?`;
    db.get(select, [positionNo], (sErr, row) => {
      if (sErr) return console.error('Select error:', sErr.message);
      const segments = JSON.stringify([]);
      const loadingCount = 0;
      const unloadingCount = 0;
      if (row && row.id) {
        const upd = `UPDATE position_km SET segments = ?, total_km = ?, loading_count = ?, unloading_count = ?, updated_at = ? WHERE position_no = ?`;
        db.run(upd, [segments, totalKm, loadingCount, unloadingCount, now, positionNo], function (uErr) {
          if (uErr) return console.error('Update error:', uErr.message);
          console.log('Updated position_km for', positionNo);
          process.exit(0);
        });
      } else {
        const ins = `INSERT INTO position_km (position_no, segments, total_km, loading_count, unloading_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(ins, [positionNo, segments, totalKm, loadingCount, unloadingCount, now, now], function (iErr) {
          if (iErr) return console.error('Insert error:', iErr.message);
          console.log('Inserted position_km for', positionNo);
          process.exit(0);
        });
      }
    });
  });
});
