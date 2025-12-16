const fs = require('fs').promises;
const path = require('path');

async function cleanupDir(dirPath, maxAgeMs) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    const files = await fs.readdir(dirPath);
    const now = Date.now();
    for (const f of files) {
      try {
        const fp = path.join(dirPath, f);
        const st = await fs.stat(fp);
        const age = now - st.mtimeMs;
        if (age >= maxAgeMs) {
          await fs.unlink(fp);
          console.log('[mail-attachments-cleanup] deleted', fp);
        }
      } catch (e) {
        console.warn('[mail-attachments-cleanup] skipping file', f, e.message);
      }
    }
  } catch (e) {
    console.error('[mail-attachments-cleanup] cleanup error:', e.message);
  }
}

/**
 * Schedule periodic cleanup of files in `dirPath`.
 * intervalMs: how often the job runs (ms)
 * maxAgeMs: delete files older than this (ms)
 */
function scheduleMailAttachmentsCleanup({ dirPath, intervalMs = 1000 * 60 * 60 * 24, maxAgeMs = 1000 * 60 * 60 * 24 } = {}) {
  if (!dirPath) throw new Error('dirPath required');
  // run immediately once
  cleanupDir(dirPath, maxAgeMs);
  // schedule
  setInterval(() => {
    cleanupDir(dirPath, maxAgeMs);
  }, intervalMs);
  console.log('[mail-attachments-cleanup] scheduled every', intervalMs, 'ms for dir', dirPath);
}

module.exports = { scheduleMailAttachmentsCleanup };
