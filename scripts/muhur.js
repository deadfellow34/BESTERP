// backend/seedSeals.js
const db = require('./src/config/db');

// 678301–678800 arası CC-xxxxx mühürleri üret
const seals = [];
for (let i = 678301; i <= 678800; i++) {
  seals.push(`CC-${i}`);
}

db.serialize(() => {
  console.log('SQLite DB path:', db.filename || '(in-memory)');

  // 1) Eski tabloyu zorla sil
  db.run('DROP TABLE IF EXISTS seals', (err) => {
    if (err) {
      console.error('seals tablosu silinirken hata:', err);
      process.exit(1);
    }
    console.log('Eski seals tablosu (varsa) silindi.');

    // 2) Doğru şema ile yeniden oluştur
    db.run(
      `
      CREATE TABLE IF NOT EXISTS seals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        is_used INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        used_in_position TEXT
      )
    `,
      (err2) => {
        if (err2) {
          console.error('seals tablosu oluşturulurken hata:', err2);
          process.exit(1);
        }
        console.log('Yeni seals tablosu oluşturuldu.');

        // 3) Seed insert
        const stmt = db.prepare(
          'INSERT INTO seals (code, is_used) VALUES (?, 0)'
        );

        let inserted = 0;

        seals.forEach((code) => {
          stmt.run(String(code).trim(), (err3) => {
            if (err3) {
              // UNIQUE vs. olursa buraya düşer
              console.error(`Mühür eklenirken hata (${code}):`, err3.message);
            } else {
              inserted++;
            }
          });
        });

        stmt.finalize((err4) => {
          if (err4) {
            console.error('Mühür seed finalize hata:', err4);
            process.exit(1);
          }

          console.log('Seals seed tamamlandı. Toplam eklenen:', inserted);
          db.close();
        });
      }
    );
  });
});
