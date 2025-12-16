// Usage:
// node scripts/import_vizebest.js <sourceDb> <targetDb> [--skip-existing=true|false]
// Example:
// node scripts/import_vizebest.js C:\Users\Aytug\Desktop\255\bestfreight.db C:\path\to\live\bestfreight.db

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function usage() {
  console.log('Usage: node scripts/import_vizebest.js <sourceDb> <targetDb> [--skip-existing=true|false]');
  process.exit(1);
}

if (process.argv.length < 4) usage();

const srcPath = path.resolve(process.argv[2]);
const destPath = path.resolve(process.argv[3]);
let skipExisting = true;
for (let i = 4; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--skip-existing=')) skipExisting = String(a.split('=')[1]).toLowerCase() !== 'false';
}

console.log('Source DB:', srcPath);
console.log('Target DB:', destPath);
console.log('skipExisting:', skipExisting);

function openDb(p) {
  return new sqlite3.Database(p);
}

function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async function() {
  const srcDb = openDb(srcPath);
  const destDb = openDb(destPath);

  try {
    // Ensure target table exists (same schema as in src/config/db.js)
    const createSql = `CREATE TABLE IF NOT EXISTS vizebest_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      dob TEXT,
      hire TEXT,
      ukvisa TEXT,
      schengen TEXT,
      visa_country TEXT,
      license_exp TEXT,
      insurance_exp TEXT,
      src3 TEXT,
      src5 TEXT,
      psycho TEXT,
      tacho TEXT,
      passport_exp TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`;
    await runAsync(destDb, createSql);

    // Read rows from source
    const rows = await allAsync(srcDb, 'SELECT name,dob,hire,ukvisa,schengen,visa_country as visaCountry,license_exp,insurance_exp,src3,src5,psycho,tacho,passport_exp,notes,created_at FROM vizebest_entries');
    console.log('Found', rows.length, 'rows in source DB');

    const insertSql = `INSERT INTO vizebest_entries (name,dob,hire,ukvisa,schengen,visa_country,license_exp,insurance_exp,src3,src5,psycho,tacho,passport_exp,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    let inserted = 0;
    for (const r of rows) {
      // Optionally skip if an identical record exists in destination
      if (skipExisting) {
        // Define a reasonable uniqueness check: name + dob + hire (may be empty) + ukvisa
        const exists = await allAsync(destDb, 'SELECT id FROM vizebest_entries WHERE name = ? AND dob = ? AND hire = ? AND ukvisa = ? LIMIT 1', [r.name, r.dob, r.hire, r.ukvisa]);
        if (exists && exists.length) {
          // skip
          continue;
        }
      }

      // Insert row into destination (preserve created_at if present)
      await runAsync(destDb, insertSql, [r.name || null, r.dob || null, r.hire || null, r.ukvisa || null, r.schengen || null, r.visaCountry || null, r.license_exp || null, r.insurance_exp || null, r.src3 || null, r.src5 || null, r.psycho || null, r.tacho || null, r.passport_exp || null, r.notes || null, r.created_at || null]);
      inserted++;
    }

    console.log('Inserted', inserted, 'rows into target DB');
  } catch (err) {
    console.error('Error during import:', err);
  } finally {
    srcDb.close();
    destDb.close();
  }
})();
