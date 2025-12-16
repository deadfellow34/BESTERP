const db = require('../src/config/db');

db.serialize(() => {
  console.log('Seeding drivers table from trucks and loads...');
  // create drivers table if missing (driverModel creates it on require, but ensure here too)
  db.run(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phone TEXT,
      visa_expiry TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Insert distinct driver names from trucks.driver_name
  db.all(`SELECT DISTINCT driver_name FROM trucks WHERE driver_name IS NOT NULL AND TRIM(driver_name) != ''`, [], (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    const names = rows.map(r => r.driver_name).filter(Boolean);
    const stmt = db.prepare('INSERT OR IGNORE INTO drivers (name) VALUES (?)');
    names.forEach(n => stmt.run(n));
    stmt.finalize((e) => {
      if (e) console.error('Seed error:', e.message);
      console.log('Drivers seeded from trucks.');
      process.exit(0);
    });
  });
});
