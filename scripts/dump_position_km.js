const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'bestfreight.db');
const positionArg = process.argv[2];

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
});

const sqlAll = `SELECT position_no, segments, total_km, loading_count, unloading_count, created_at, updated_at FROM position_km`;
const sqlOne = `SELECT position_no, segments, total_km, loading_count, unloading_count, created_at, updated_at FROM position_km WHERE position_no = ?`;

function parseRow(r) {
  return {
    position_no: r.position_no,
    segments: r.segments ? JSON.parse(r.segments) : [],
    total_km: r.total_km !== null ? Number(r.total_km) : null,
    loading_count: r.loading_count !== null ? Number(r.loading_count) : 0,
    unloading_count: r.unloading_count !== null ? Number(r.unloading_count) : 0,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

if (positionArg) {
  db.get(sqlOne, [positionArg], (err, row) => {
    if (err) return console.error('Query error:', err.message);
    if (!row) {
      console.log('No row for position:', positionArg);
      process.exit(0);
    }
    console.log(JSON.stringify(parseRow(row), null, 2));
    process.exit(0);
  });
} else {
  db.all(sqlAll, [], (err, rows) => {
    if (err) return console.error('Query error:', err.message);
    console.log(JSON.stringify((rows || []).map(parseRow), null, 2));
    process.exit(0);
  });
}
