const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bestfreight.db');
const db = new sqlite3.Database(dbPath);

console.log('Fatura kime değerleri kontrol ediliyor...\n');

db.all(`SELECT id, position_no, customer_name, fatura_kime FROM loads ORDER BY id DESC LIMIT 10`, (err, rows) => {
  if (err) {
    console.error('Hata:', err.message);
  } else {
    console.table(rows);
  }
  db.close();
});
