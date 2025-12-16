const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bestfreight.db');
const db = new sqlite3.Database(dbPath);

console.log('Veritabanına fatura_kime kolonu ekleniyor...');

db.run(`ALTER TABLE loads ADD COLUMN fatura_kime TEXT`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✓ fatura_kime kolonu zaten mevcut.');
    } else {
      console.error('Hata:', err.message);
    }
  } else {
    console.log('✓ fatura_kime kolonu başarıyla eklendi!');
  }
  
  db.close();
});
