const fs = require('fs');
const path = require('path');

/**
 * Start periodic backup of SQLite DB file.
 * @param {Object} options
 * @param {string} options.dbPath - absolute path to the DB file
 * @param {string} options.backupsDir - absolute path to backups directory
 * @param {number} options.intervalMs - interval in milliseconds
 * @returns {Object} { stop: Function }
 */
function startPeriodicBackup({ dbPath, backupsDir, intervalMs }) {
  if (!dbPath) throw new Error('dbPath required');
  if (!backupsDir) throw new Error('backupsDir required');
  if (!intervalMs) intervalMs = 1000 * 60 * 60 * 3; // default 3 hours

  // Ensure backupsDir exists
  try {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create backups dir', backupsDir, e.message);
  }

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

  async function doBackup() {
    try {
      if (!fs.existsSync(dbPath)) {
        console.warn('DB file not found for backup at', dbPath);
        return;
      }
      const ts = formatTs(new Date());
      const base = path.basename(dbPath);
      const target = path.join(backupsDir, `${base}.backup_${ts}`);
      fs.copyFileSync(dbPath, target);
      console.log('DB backup created:', target);
      // Optionally prune older backups - keep last N (not implemented here)
    } catch (e) {
      console.error('DB backup failed:', e.message);
    }
  }

  // Run once immediately
  doBackup();

  const tid = setInterval(doBackup, intervalMs);

  return {
    stop() {
      clearInterval(tid);
    }
  };
}

module.exports = { startPeriodicBackup };
