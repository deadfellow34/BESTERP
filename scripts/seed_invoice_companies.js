const db = require('./src/config/db');

const invoiceCompanies = [
  'TURKTRANSPORT',
  'ALIŞAN',
  'MARS',
  'ANGLOTURKISH',
  'BARSAN'
];

console.log('Fatura firmaları ekleniyor...');

db.serialize(() => {
  const stmt = db.prepare('INSERT OR IGNORE INTO invoice_companies (name) VALUES (?)');
  
  invoiceCompanies.forEach(company => {
    stmt.run(company, (err) => {
      if (err) {
        console.error(`❌ ${company} eklenirken hata:`, err.message);
      } else {
        console.log(`✅ ${company} eklendi`);
      }
    });
  });
  
  stmt.finalize(() => {
    console.log('\n✨ Fatura firmaları seed işlemi tamamlandı!');
    db.close();
  });
});
