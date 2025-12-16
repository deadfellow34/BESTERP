const db = require('../config/db');

// Ensure table exists
const initSql = `
  CREATE TABLE IF NOT EXISTS named (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    load_id INTEGER,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

db.run(initSql, (err) => {
  if (err) console.error('Failed to ensure named table:', err.message);
});

const NamedModel = {
  createForLoad(loadId, name, callback) {
    const sql = `INSERT INTO named (load_id, name) VALUES (?, ?)`;
    // insert the raw value (allow empty string) so empty naming is preserved
    db.run(sql, [loadId, name], function(err) {
      if (err) return callback(err);
      callback(null, this.lastID);
    });
  },

  // get latest name for a given load
  getLatestForLoad(loadId, callback) {
    const sql = `SELECT name FROM named WHERE load_id = ? ORDER BY id DESC LIMIT 1`;
    db.get(sql, [loadId], callback);
  }
};

module.exports = NamedModel;
