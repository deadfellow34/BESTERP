const db = require('../src/config/db');

// Inserts a TRIMEX seal row if not already present.
// Works with either 'code' or 'seal_no' column.

db.serialize(() => {
  db.all("PRAGMA table_info('seals')", [], (err, cols) => {
    if (err) return console.error('Error reading seals schema:', err.message);
    const names = (cols || []).map(c => c.name);
    const hasCode = names.includes('code');
    const hasSealNo = names.includes('seal_no');

    if (!hasCode && !hasSealNo) {
      return console.error('seals table does not have code or seal_no column.');
    }

    const col = hasCode ? 'code' : 'seal_no';
    db.get(`SELECT id FROM seals WHERE ${col} = ? LIMIT 1`, ['TRIMEX'], (gErr, row) => {
      if (gErr) return console.error('Error querying seals:', gErr.message);
      if (row) {
        console.log('TRIMEX seal already exists (id=', row.id, ').');
        return process.exit(0);
      }

      const sql = `INSERT INTO seals (${col}, is_used) VALUES (?, 0)`;
      db.run(sql, ['TRIMEX'], function(insErr) {
        if (insErr) return console.error('Error inserting TRIMEX seal:', insErr.message);
        console.log('Inserted TRIMEX seal with id', this.lastID);
        process.exit(0);
      });
    });
  });
});
