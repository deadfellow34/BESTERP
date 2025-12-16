const db = require("../src/config/db"); // sende yolu gerekirse düzelt

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map(r => r.name);

db.exec("PRAGMA foreign_keys=OFF; BEGIN;");

for (const t of tables) {
  db.exec(`DELETE FROM "${t}";`);
}

// Autoincrement sayaçları sıfırlansın istiyorsan:
db.exec(`DELETE FROM sqlite_sequence;`);

db.exec("COMMIT; PRAGMA foreign_keys=ON;");

console.log("DB temizlendi:", tables);
