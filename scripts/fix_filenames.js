// Veritabanındaki bozuk Türkçe karakter isimlerini düzelt
const db = require('./src/config/db');

// Latin-1 -> UTF-8 dönüşümü
function fixEncoding(str) {
  if (!str) return str;
  try {
    // Eğer bozuk karakterler varsa düzelt
    if (str.includes('Ã') || str.includes('Ä') || str.includes('Ö') || str.includes('Ü')) {
      return Buffer.from(str, 'latin1').toString('utf8');
    }
    return str;
  } catch (e) {
    return str;
  }
}

console.log('Bozuk dosya adları aranıyor...');

db.all('SELECT id, original_name FROM documents', [], (err, rows) => {
  if (err) {
    console.error('Hata:', err);
    process.exit(1);
  }
  
  let fixCount = 0;
  let pending = 0;
  
  rows.forEach(row => {
    const fixed = fixEncoding(row.original_name);
    if (fixed !== row.original_name) {
      pending++;
      console.log(`[${row.id}] "${row.original_name}" -> "${fixed}"`);
      
      db.run('UPDATE documents SET original_name = ? WHERE id = ?', [fixed, row.id], (err) => {
        if (err) {
          console.error(`Güncelleme hatası (${row.id}):`, err);
        } else {
          fixCount++;
        }
        pending--;
        
        if (pending === 0) {
          console.log(`\n${fixCount} kayıt düzeltildi.`);
          process.exit(0);
        }
      });
    }
  });
  
  if (pending === 0) {
    console.log('Düzeltilecek kayıt bulunamadı.');
    process.exit(0);
  }
});
