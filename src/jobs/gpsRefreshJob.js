const cron = require('node-cron');
const { validateEnv } = require('../config/env');
const gpsbuddyClient = require('../services/gpsbuddyClient');
const GpsModel = require('../models/gpsModel');

async function refreshOnce() {
  const cfg = validateEnv({ requireGps: true });
  const { vehicles, meta } = await gpsbuddyClient.fetchLiveVehicles(cfg.gpsbuddy);
  const persisted = GpsModel.upsertLastAndHistory(vehicles);
  return { meta, persisted };
}

function startGpsRefreshJob() {
  const cfg = validateEnv({ requireGps: false });
  if (!cfg.cron.gpsRefreshEnabled) {
    // eslint-disable-next-line no-console
    console.log('[gpsRefreshJob] GPS_REFRESH_CRON_ENABLED is false; job disabled');
    return { enabled: false };
  }

  // Credentials must exist if job is enabled.
  validateEnv({ requireGps: true });

  // Every 2 minutes
  const task = cron.schedule('*/2 * * * *', async () => {
    try {
      const r = await refreshOnce();
      // eslint-disable-next-line no-console
      console.log('[gpsRefreshJob] refreshed', r.persisted.updated, 'vehicles (history +', r.persisted.historyInserted + ')', 'via', r.meta.functionName);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[gpsRefreshJob] refresh error:', e && e.message ? e.message : e);
    }
  });

  // Retention cleanup daily at 03:10
  const cleanupTask = cron.schedule('10 3 * * *', () => {
    try {
      const deleted = GpsModel.deleteHistoryOlderThan(30);
      if (deleted) {
        // eslint-disable-next-line no-console
        console.log('[gpsRefreshJob] retention cleanup deleted rows:', deleted);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[gpsRefreshJob] cleanup error:', e && e.message ? e.message : e);
    }
  });

  // Start immediately
  task.start();
  cleanupTask.start();

  // Fire one refresh right away (do not wait for cron boundary)
  (async () => {
    try {
      const r = await refreshOnce();
      // eslint-disable-next-line no-console
      console.log('[gpsRefreshJob] startup refreshed', r.persisted.updated, 'vehicles (history +', r.persisted.historyInserted + ')', 'via', r.meta.functionName);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[gpsRefreshJob] startup refresh error:', e && e.message ? e.message : e);
    }
  })();

  return { enabled: true };
}

module.exports = { startGpsRefreshJob, refreshOnce };
