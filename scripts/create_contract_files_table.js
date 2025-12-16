/**
 * Create contract_files table for multiple PDF support
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'bestfreight.db');
const db = new Database(dbPath);

console.log('[Migration] Creating contract_files table...');

try {
  // Drop and recreate contract_files table
  db.exec(`DROP TABLE IF EXISTS contract_files`);
  
  // Create contract_files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      description TEXT,
      version INTEGER DEFAULT 1,
      uploaded_at TEXT NOT NULL,
      uploaded_by INTEGER,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);
  console.log('[Migration] contract_files table created successfully');

  // Migrate existing contract files to the new table
  const contracts = db.prepare('SELECT id, file_name, file_path, created_at, created_by FROM contracts WHERE file_name IS NOT NULL').all();
  
  if (contracts.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO contract_files (contract_id, file_name, file_path, description, version, uploaded_at, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    let migratedCount = 0;
    for (const contract of contracts) {
      // Check if already migrated
      const existing = db.prepare('SELECT id FROM contract_files WHERE contract_id = ? AND file_path = ?').get(contract.id, contract.file_path);
      if (!existing) {
        insertStmt.run(
          contract.id,
          contract.file_name,
          contract.file_path,
          'Orijinal sözleşme dosyası',
          1,
          contract.created_at,
          contract.created_by
        );
        migratedCount++;
      }
    }
    console.log(`[Migration] Migrated ${migratedCount} existing contract files`);
  }

  console.log('[Migration] All done!');
} catch (err) {
  console.error('[Migration] Error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
