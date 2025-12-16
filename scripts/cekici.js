const db = require('./src/config/db');

const plates = [
  '34 AKA 910',
  '34 AKA 911',
  '34 AKA 912',
  '34 AKA 913',
  '34 AKA 914',
  '34 AKA 915',
  '34 AKA 916',
  '34 AKA 917',
  '34 AKA 918',
  '34 AKA 919',
  '34 AKA 920',
  '34 AKA 921',
  '34 AKA 922',
  '34 AKA 923',
  '34 AKA 924',
  '34 AKA 951',
  '34 AKA 952',
  '34 AKA 953',
  '34 AKA 954',
  '34 AKA 955',
  '34 AKA 956',
  '34 AKA 957',
  '34 AKA 958',
  '34 AKA 959',
  '34 AKA 960',
  '34 AKA 961',
  '34 AKA 962',
  '34 AKA 963',
  '34 AKA 964',
  '34 AKA 965',
  '34 AKA 966',
  '34 AKA 967',
  '34 AKA 968',
  '34 AKA 969',
  '34 AKA 970',
  '34 AKA 971',
  '34 AKA 972',
  '34 AKA 973',
  '34 AKA 975',
  '34 AKA 976',
  '34 KIB 326',
  '34 KIB 327',
  '34 KIB 328',
  '34 KIB 329',
  '34 KIB 330',
  '34 KIB 333',
  '34 KIB 379',
  '34 KIB 380',
  '34 KIB 381',
  '34 KIB 384',
];

db.serialize(() => {
  console.log('SQLite DB path:', db.filename || '(in-memory)');

  db.run(
    `
    CREATE TABLE IF NOT EXISTS trucks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    )
  `,
    (err) => {
      if (err) {
        console.error('trucks tablosu oluşturulurken hata:', err);
        process.exit(1);
      }

      const stmt = db.prepare(
        'INSERT OR IGNORE INTO trucks (plate, active) VALUES (?, 1)'
      );

      plates.forEach((p) => {
        stmt.run(p.trim());
      });

      stmt.finalize((err2) => {
        if (err2) {
          console.error('Plakalar seed edilirken hata:', err2);
          process.exit(1);
        }

        console.log('Trucks seed tamamlandı.');
        db.close();
      });
    }
  );
});
