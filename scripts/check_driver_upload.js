const db = require('better-sqlite3')('./bestfreight.db');

console.log('=== DRIVER UPLOAD SİSTEMİ KONTROL ===\n');

// 1. Tablo kontrolü
const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='driver_upload_tokens'").get();
console.log('1. driver_upload_tokens tablosu:', table ? '✅ VAR' : '❌ YOK');

// 2. Tablo yapısı
if (table) {
  const cols = db.prepare('PRAGMA table_info(driver_upload_tokens)').all();
  console.log('   Kolonlar:', cols.map(c => c.name).join(', '));
}

// 3. Mevcut tokenlar
const tokens = db.prepare('SELECT * FROM driver_upload_tokens').all();
console.log('\n2. Mevcut tokenlar:', tokens.length, 'adet');
tokens.forEach(t => {
  const expired = new Date(t.expires_at) < new Date();
  console.log('   -', t.position_no, '| expires:', t.expires_at, expired ? '(EXPIRED)' : '(active)');
});

db.close();
console.log('\n=== KONTROL TAMAMLANDI ===');
