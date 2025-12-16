const cron = require('node-cron');
const { validateEnv } = require('../config/env');
const gpsbuddyClient = require('../services/gpsbuddyClient');
const GpsModel = require('../models/gpsModel');
const chatHandler = require('../socket/chatHandler');

// Track recently alerted vehicles to avoid spam (vehicleId -> lastAlertTime)
const recentSpeedAlerts = new Map();
// Track max speed per vehicle in last 5 minutes (vehicleId -> { maxSpeed, plate, driver, location, timestamp })
const maxSpeedTracker = new Map();

const SPEED_ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown per vehicle
const MAX_SPEED_WINDOW = 5 * 60 * 1000; // 5 minutes window for max speed tracking
const SPEED_LIMIT = 94; // km/h

async function refreshOnce() {
  const cfg = validateEnv({ requireGps: true });
  const { vehicles, meta } = await gpsbuddyClient.fetchLiveVehicles(cfg.gpsbuddy);
  const persisted = GpsModel.upsertLastAndHistory(vehicles);
  
  // Check for speed limit violations and send alerts
  checkSpeedViolations(vehicles);
  
  return { meta, persisted };
}

/**
 * Fetch vehicles and check speed only (no history save) - for frequent speed checks
 */
async function checkSpeedOnly() {
  const cfg = validateEnv({ requireGps: true });
  const { vehicles } = await gpsbuddyClient.fetchLiveVehicles(cfg.gpsbuddy);
  
  // Only check speed violations, don't save to history
  checkSpeedViolations(vehicles);
  
  return vehicles.length;
}

/**
 * Check vehicles for speed violations and send alerts to driver-alerts channel
 * Tracks max speed in last 5 minutes and shows that in the alert
 */
function checkSpeedViolations(vehicles) {
  const now = Date.now();
  
  // Debug: Log how many vehicles we're checking
  const speeders = vehicles.filter(v => Number(v.velocity || 0) >= SPEED_LIMIT);
  console.log(`[gpsRefreshJob] Speed check: ${vehicles.length} vehicles, ${speeders.length} above ${SPEED_LIMIT} km/h`);
  if (speeders.length > 0) {
    console.log('[gpsRefreshJob] Speeders:', speeders.map(v => `${v.plate}:${v.velocity}km/h`).join(', '));
  }
  
  // First pass: Update max speed tracker for all vehicles
  for (const v of vehicles) {
    const velocity = v.velocity != null ? Number(v.velocity) : 0;
    const vehicleId = v.vehicleid;
    
    if (velocity >= SPEED_LIMIT) {
      const existing = maxSpeedTracker.get(vehicleId);
      
      // Update if no record, record is old, or new speed is higher
      if (!existing || (now - existing.timestamp) > MAX_SPEED_WINDOW || velocity > existing.maxSpeed) {
        maxSpeedTracker.set(vehicleId, {
          maxSpeed: velocity,
          plate: v.plate || 'Bilinmiyor',
          driver: v.drivername || 'Bilinmiyor',
          location: v.address || v.location || 'Bilinmiyor',
          timestamp: now
        });
      }
    }
  }
  
  // Second pass: Send alerts for vehicles exceeding speed limit
  for (const v of vehicles) {
    const velocity = v.velocity != null ? Number(v.velocity) : 0;
    
    if (velocity >= SPEED_LIMIT) {
      const vehicleId = v.vehicleid;
      const lastAlert = recentSpeedAlerts.get(vehicleId);
      
      // Only alert if not recently alerted (cooldown)
      if (!lastAlert || (now - lastAlert) > SPEED_ALERT_COOLDOWN) {
        recentSpeedAlerts.set(vehicleId, now);
        
        // Get max speed data from tracker
        const maxData = maxSpeedTracker.get(vehicleId);
        const maxSpeed = maxData ? maxData.maxSpeed : velocity;
        
        // Format time in Turkey timezone
        const timeStr = new Date().toLocaleString('tr-TR', { 
          timeZone: 'Europe/Istanbul',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const plate = v.plate || 'Bilinmiyor';
        const driver = v.drivername || 'Bilinmiyor';
        const location = v.address || v.location || 'Bilinmiyor';
        
        // Show current speed and max speed in last 5 min
        let alertText = `⚠️ HIZ AŞIMI: ${plate} - ${velocity} km/h`;
        if (maxSpeed > velocity) {
          alertText += ` (Son 5dk max: ${maxSpeed} km/h)`;
        }
        alertText += ` | Şoför: ${driver} | Konum: ${location} | Saat: ${timeStr}`;
        
        // Send to driver-alerts channel
        console.log('[gpsRefreshJob] Attempting to send alert for:', plate, velocity, 'km/h');
        console.log('[gpsRefreshJob] chatHandler.sendChannelMessage exists:', typeof chatHandler.sendChannelMessage);
        
        if (typeof chatHandler.sendChannelMessage === 'function') {
          chatHandler.sendChannelMessage('driver-alerts', alertText, {
            type: 'speed_violation',
            vehicleId,
            plate,
            velocity,
            maxSpeed,
            driver,
            location,
            timestamp: new Date().toISOString()
          });
          
          console.log('[gpsRefreshJob] Speed alert sent:', plate, velocity, 'km/h (max:', maxSpeed, 'km/h)');
        } else {
          console.log('[gpsRefreshJob] ERROR: chatHandler.sendChannelMessage is not a function!');
        }
      }
    }
  }
  
  // Clean up old entries from maps
  for (const [vehicleId, lastAlert] of recentSpeedAlerts.entries()) {
    if ((now - lastAlert) > SPEED_ALERT_COOLDOWN * 2) {
      recentSpeedAlerts.delete(vehicleId);
    }
  }
  
  for (const [vehicleId, data] of maxSpeedTracker.entries()) {
    if ((now - data.timestamp) > MAX_SPEED_WINDOW) {
      maxSpeedTracker.delete(vehicleId);
    }
  }
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

  // Every 5 minutes (prevents excessive history rows)
  const task = cron.schedule('*/5 * * * *', async () => {
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

  // Speed check every 10 seconds (separate from history save)
  const speedCheckInterval = setInterval(async () => {
    try {
      const count = await checkSpeedOnly();
      // Only log if there are speeders (to reduce noise)
      // console.log('[gpsRefreshJob] speed check:', count, 'vehicles');
    } catch (e) {
      console.error('[gpsRefreshJob] speed check error:', e && e.message ? e.message : e);
    }
  }, 10 * 1000); // 10 seconds

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
