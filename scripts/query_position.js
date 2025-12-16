const db = require('../src/config/db');
const pos = process.argv[2];
if (!pos) {
  console.error('Usage: node scripts/query_position.js "<positionNo>"');
  process.exit(1);
}

function quit(code){
  // ensure DB has time to close
  setTimeout(()=>process.exit(code), 50);
}

db.serialize(() => {
  db.all('SELECT * FROM loads WHERE position_no = ?', [pos], (err, loads) => {
    if (err) {
      console.error('Error querying loads:', err.message);
      return quit(2);
    }

    db.all('SELECT * FROM documents WHERE position_no = ?', [pos], (err2, docs) => {
      if (err2) {
        console.error('Error querying documents:', err2.message);
        return quit(3);
      }

      const sealCodes = Array.from(new Set((loads || []).map(l => l.seal_code).filter(Boolean)));

      // inspect seals table schema first to avoid column errors
      db.all("PRAGMA table_info('seals')", [], (err3, cols) => {
        if (err3) {
          console.error('Error reading seals schema:', err3.message);
          return quit(4);
        }

        const colNames = (cols || []).map(c => c.name);
        if (sealCodes.length > 0 && colNames.includes('seal_no')) {
          const placeholders = sealCodes.map(() => '?').join(',');
          db.all(`SELECT * FROM seals WHERE seal_no IN (${placeholders})`, sealCodes, (err4, seals) => {
            if (err4) {
              console.error('Error querying seals:', err4.message);
              return quit(5);
            }
            console.log(JSON.stringify({ position: pos, loads, documents: docs, seals, seals_table_columns: colNames }, null, 2));
            quit(0);
          });
        } else {
          // either no seal codes referenced or seals table doesn't have seal_no
          console.log(JSON.stringify({ position: pos, loads, documents: docs, seals: [], seals_table_columns: colNames }, null, 2));
          quit(0);
        }
      });
    });
  });
});
