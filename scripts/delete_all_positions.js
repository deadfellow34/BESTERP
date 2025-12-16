const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const scriptsDir = __dirname; // backend/scripts
const dbPath = path.join(scriptsDir, '..', 'bestfreight.db');
const uploadsRoot = path.join(scriptsDir, '..', 'uploads', 'accounting');

if (!fs.existsSync(dbPath)) {
  console.error('DB not found at', dbPath);
  process.exit(1);
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

function openDb() {
  return new sqlite3.Database(dbPath);
}

function all(db, sql, params=[]) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

function run(db, sql, params=[]) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
}

(async function main() {
  console.log('This script will DELETE ALL positions (all loads grouped by position_no) from the DB:');
  console.log(' DB :', dbPath);
  console.log(' Uploads root (will attempt to remove files referenced in documents):', uploadsRoot);
  const answer = (process.argv.includes('--yes') || process.argv.includes('-y')) ? 'yes' : (await prompt('Type YES to confirm permanent deletion of ALL positions: '));
  if (!(answer === 'YES' || answer === 'yes')) {
    console.log('Aborted by user. No changes made.');
    process.exit(0);
  }

  // Backup DB (formatted timestamp: DD-MM-YYYY_hh-mm-ss-ms)
  function formatTs(d = new Date()) {
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    const ms = pad(d.getMilliseconds(), 3);
    return `${day}-${month}-${year}_${hh}-${mm}-${ss}-${ms}`;
  }

  const backupPath = dbPath + '.bak_' + formatTs(new Date());
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log('Backup created at', backupPath);
  } catch (e) {
    console.error('Failed to create DB backup:', e.message);
    process.exit(1);
  }

  const db = openDb();

  try {
    const positions = await all(db, 'SELECT DISTINCT position_no FROM loads WHERE position_no IS NOT NULL');
    if (!positions || positions.length === 0) {
      console.log('No positions found. Nothing to delete.');
      db.close();
      process.exit(0);
    }

    console.log('Found', positions.length, 'positions. Deleting them one by one...');

    for (const r of positions) {
      const pos = r.position_no;
      console.log('\n=== Deleting position:', pos, '===');

      // Load documents for this position
      const docs = await all(db, 'SELECT * FROM documents WHERE position_no = ?', [pos]);

      // Delete files on disk referenced by documents
      for (const doc of docs || []) {
        const candidates = [];
        if (doc.type) candidates.push(path.join(uploadsRoot, doc.type, doc.filename));
        candidates.push(path.join(uploadsRoot, doc.filename));

        // Try to remove any matching file
        for (const p of candidates) {
          try {
            if (fs.existsSync(p)) {
              fs.unlinkSync(p);
              console.log('Deleted file:', p);
              break;
            }
          } catch (e) {
            console.warn('Could not delete file', p, e.message);
          }
        }
      }

      // Wrap deletion for this position in a transaction
      await run(db, 'BEGIN TRANSACTION');
      try {
        // Remove document rows
        await run(db, 'DELETE FROM documents WHERE position_no = ?', [pos]);

        // Remove position expenses
        await run(db, 'DELETE FROM position_expenses WHERE position_no = ?', [pos]);

        // Remove position_km (if present)
        await run(db, 'DELETE FROM position_km WHERE position_no = ?', [pos]);

        // Finally remove loads
        await run(db, 'DELETE FROM loads WHERE position_no = ?', [pos]);

        // Optionally remove logs that reference this position (entity = 'position' and entity_id matches)
        await run(db, "DELETE FROM logs WHERE entity = 'position' AND entity_id = ?", [pos]);

        await run(db, 'COMMIT');
        console.log('Position deleted:', pos);
      } catch (innerErr) {
        console.error('Error deleting position', pos, '- rolling back:', innerErr.message);
        try { await run(db, 'ROLLBACK'); } catch (e) { console.error('Rollback error:', e.message); }
      }
    }

    console.log('\nAll positions processed.');
    db.close();
    console.log('Done. If anything looks wrong you can restore from backup:', backupPath);
  } catch (err) {
    console.error('Fatal error:', err.message);
    try { db.close(); } catch(e){}
    process.exit(1);
  }
})();
