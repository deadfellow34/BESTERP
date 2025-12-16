/**
 * Create contracts table migration script
 */
const db = require('../src/config/db');

const sql = `
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  created_by INTEGER,
  FOREIGN KEY (created_by) REFERENCES users(id)
)`;

const indexSql = `CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at)`;

try {
  db.exec(sql);
  console.log('✅ Contracts tablosu oluşturuldu!');
  
  db.exec(indexSql);
  console.log('✅ Index oluşturuldu!');
  
  process.exit(0);
} catch (err) {
  console.error('❌ Hata:', err.message);
  process.exit(1);
}
