const db = require('better-sqlite3')('./bestfreight.db');

console.log('=== MIGRATIONS ===');
const migrations = db.prepare('SELECT * FROM _migrations ORDER BY version DESC').all();
migrations.forEach(m => console.log(`Version ${m.version}: ${m.applied_at}`));

console.log('\n=== DRIVER_UPLOAD_TOKENS TABLE ===');
const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='driver_upload_tokens'").all();
console.log(table.length > 0 ? 'TABLO VAR ✓' : 'TABLO YOK ✗');

if (table.length > 0) {
    console.log('\n=== TABLE STRUCTURE ===');
    const info = db.prepare("PRAGMA table_info(driver_upload_tokens)").all();
    info.forEach(col => console.log(`  ${col.name} (${col.type})`));
}

db.close();
