// Database migration: loads tablosuna status kolonu ekle
const db = require('./src/config/db');

db.serialize(() => {
  // status kolonu ekle (default: 'active', diğer değer: 'completed')
  db.run(`
    ALTER TABLE loads ADD COLUMN status TEXT DEFAULT 'active'
  `, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✓ status kolonu zaten mevcut');
      } else {
        console.error('Hata:', err.message);
      }
    } else {
      console.log('✓ status kolonu başarıyla eklendi');
    }
    
    db.close(() => {
      console.log('Database bağlantısı kapatıldı');
      process.exit();
    });
  });
});
