// backend/seedTrailers.js
const db = require('./src/config/db');

const plates = [
  '34 AKB 370',
  '34 AKB 371',
  '34 AKB 372',
  '34 AKB 373',
  '34 AKB 374',
  '34 AKB 375',
  '34 AKB 376',
  '34 AKB 377',
  '34 AKB 378',
  '34 AKB 379',
  '34 AKB 380',
  '34 AKB 381',
  '34 AKB 382',
  '34 AKB 383',
  '34 AKB 384',
  '34 AKB 385',
  '34 AKB 386',
  '34 AKB 387',
  '34 AKB 388',
  '34 AKB 389',
  '34 AKB 390',
  '34 AKB 391',
  '34 AKB 392',
  '34 AKB 393',
  '34 AKB 394',
  '34 AKB 395',
  '34 AKB 396',
  '34 AKB 397',
  '34 AKB 398',
  '34 AKB 399',
  '34 AKB 470',
  '34 AKB 471',
  '34 AKB 472',
  '34 AKB 473', // listende iki kere var, UNIQUE yüzünden bir kere eklenir
  '34 AKB 474',
  '34 AKB 475',
  '34 AKB 476',
  '34 AKB 477',
  '34 AKB 478',
  '34 AKB 479',
  '34 AKB 480',
  '34 AKB 481',
  '34 AKB 482',
  '34 AKB 483',
  '34 AKB 484',
  '34 AKB 485',
  '34 AKB 486',
  '34 AKB 487',
  '34 AKB 488',
  '34 AKB 489',
  '34 ALR 219 KRONE',
];

db.serialize(() => {
  console.log('SQLite DB path:', db.filename || '(in-memory)');

  db.run(
    `
    CREATE TABLE IF NOT EXISTS trailers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    )
  `,
    (err) => {
      if (err) {
        console.error('trailers tablosu oluşturulurken hata:', err);
        process.exit(1);
      }

      const stmt = db.prepare(
        'INSERT OR IGNORE INTO trailers (plate, active) VALUES (?, 1)'
      );

      plates.forEach((p) => {
        stmt.run(p.trim());
      });

      stmt.finalize((err2) => {
        if (err2) {
          console.error('Dorse plakaları seed edilirken hata:', err2);
          process.exit(1);
        }

        console.log('Trailers seed tamamlandı.');
        db.close();
      });
    }
  );
});
