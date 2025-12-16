const os = require('os');
const { validateEnv } = require('../config/env');
const gpsbuddyClient = require('../services/gpsbuddyClient');
const GpsModel = require('../models/gpsModel');
const LogModel = require('../models/logModel');

function secondsToHHMM(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function pickLastUpdated(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  let best = null;
  for (const v of list) {
    if (v && v.updated_at) {
      if (!best || String(v.updated_at) > String(best)) best = v.updated_at;
    }
  }
  return best;
}

async function refreshFromApiAndPersist() {
  const cfg = validateEnv({ requireGps: true });
  const { vehicles, meta } = await gpsbuddyClient.fetchLiveVehicles(cfg.gpsbuddy);
  const result = GpsModel.upsertLastAndHistory(vehicles);
  return {
    vehicles: GpsModel.getLastAll(),
    meta,
    persisted: result,
  };
}

function safeLogRefresh(req, info) {
  try {
    const user = req.session && req.session.user;
    LogModel.create(
      {
        username: user ? user.username : null,
        role: user ? user.role : null,
        entity: 'gps',
        entity_id: null,
        entity_id_text: null,
        action: 'refresh',
        field: null,
        old_value: null,
        new_value: info,
        machine_name: os.hostname(),
      },
      () => {}
    );
  } catch (_) {
    // ignore logging failures
  }
}

/**
 * Add daily drivetime/worktime/idletime/stoptime to vehicles by calculating
 * difference from today's first record
 */
function addDailyTimesToVehicles(vehicles) {
  const todayStart = GpsModel.getTodayStartValues();
  
  for (const v of vehicles) {
    const start = todayStart.get(v.vehicleid);
    if (start) {
      // Daily = Current - Start of today
      v.dailyDrivetime = Math.max(0, (v.drivetime || 0) - start.drivetime);
      v.dailyWorktime = Math.max(0, (v.worktime || 0) - start.worktime);
      v.dailyIdletime = Math.max(0, (v.idletime || 0) - start.idletime);
      v.dailyStoptime = Math.max(0, (v.stoptime || 0) - start.stoptime);
    } else {
      // No history for today, use current values (vehicle just started today)
      v.dailyDrivetime = v.drivetime || 0;
      v.dailyWorktime = v.worktime || 0;
      v.dailyIdletime = v.idletime || 0;
      v.dailyStoptime = v.stoptime || 0;
    }
  }
  
  return vehicles;
}

const gpsController = {
  index(req, res) {
    return res.redirect('/gps/live');
  },

  livePage(req, res) {
    const vehicles = GpsModel.getLastAll();
    const lastUpdated = pickLastUpdated(vehicles);

    // Add daily values to vehicles
    addDailyTimesToVehicles(vehicles);

    return res.render('gps/live', {
      pageTitle: 'GPS - Canlı Takip',
      vehicles,
      lastUpdated,
      apiError: null,
    });
  },

  vehiclePage(req, res) {
    const vehicleId = req.params.vehicleId;
    const vehicle = GpsModel.getLastByVehicleId(vehicleId);

    if (!vehicle) {
      return res.status(404).render('error', {
        message: 'Araç bulunamadı',
      });
    }

    const page = req.query.page != null ? Number(req.query.page) : 1;
    const pageSize = 50;

    // Date range from query params (YYYY-MM-DD format)
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    let sinceIso = null;
    let untilIso = null;

    if (startDate) {
      // Start of day in Turkey time (approx: subtract 3 hours from UTC)
      sinceIso = new Date(startDate + 'T00:00:00+03:00').toISOString();
    } else {
      // Default: last 24 hours
      sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    if (endDate) {
      // End of day in Turkey time
      untilIso = new Date(endDate + 'T23:59:59+03:00').toISOString();
    }

    const paged = GpsModel.getHistoryPage(vehicleId, { sinceIso, untilIso, page, pageSize });
    const history = paged.rows;
    const totalRows = paged.total;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(Math.max(1, paged.page), totalPages);

    return res.render('gps/vehicle', {
      pageTitle: `GPS - ${vehicle.plate || vehicle.vehicleid}`,
      vehicle,
      history,
      pagination: {
        page: currentPage,
        pageSize,
        totalRows,
        totalPages,
      },
      dateFilter: {
        startDate: startDate || '',
        endDate: endDate || '',
      },
      fmt: { secondsToHHMM },
    });
  },

  tachographPage(req, res) {
    const vehicles = GpsModel.getVehicleList();
    const selectedVehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : (vehicles[0] ? vehicles[0].vehicleid : null);

    const vehicle = selectedVehicleId ? GpsModel.getLastByVehicleId(selectedVehicleId) : null;

    const range = (req.query.range || '24h').toString();
    const sinceIso = range === '7d'
      ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const history = selectedVehicleId ? GpsModel.getHistory(selectedVehicleId, { sinceIso, limit: 5000 }) : [];

    // Warnings (approx.)
    const drivetime = vehicle && vehicle.drivetime != null ? Number(vehicle.drivetime) : null;
    const warnings = [];
    if (Number.isFinite(drivetime)) {
      if (drivetime > 9 * 3600) warnings.push('Günlük sürüş limiti (9s+)');
      else if (drivetime > 4.5 * 3600) warnings.push('Mola gerekli (4.5s+)');
    }

    return res.render('gps/tachograph', {
      pageTitle: 'GPS - Takograf / Hız Analizi',
      vehicles,
      vehicle,
      history,
      range,
      warnings,
      fmt: { secondsToHHMM },
    });
  },

  async apiLive(req, res) {
    const user = req.session && req.session.user;
    if (user && (user.role === 'readonly' || user.role === 'accounting_readonly')) {
      const vehicles = GpsModel.getLastAll();
      addDailyTimesToVehicles(vehicles);
      return res.status(200).json({
        ok: true,
        vehicles,
        meta: {
          readonly: true,
          lastUpdated: pickLastUpdated(vehicles),
        },
      });
    }

    // Try API refresh first; fall back to cache
    try {
      const result = await refreshFromApiAndPersist();
      safeLogRefresh(req, `updated=${result.persisted.updated} historyInserted=${result.persisted.historyInserted}`);

      // Add daily values to vehicles
      addDailyTimesToVehicles(result.vehicles);

      return res.json({
        ok: true,
        vehicles: result.vehicles,
        meta: {
          ...result.meta,
          persisted: result.persisted,
          lastUpdated: pickLastUpdated(result.vehicles),
        },
      });
    } catch (e) {
      const vehicles = GpsModel.getLastAll();
      safeLogRefresh(req, `api_failed cache_count=${vehicles.length} err=${e && e.message}`);

      // Add daily values to vehicles
      addDailyTimesToVehicles(vehicles);

      return res.status(200).json({
        ok: false,
        error: e && e.message ? e.message : 'GPS API erişilemedi',
        vehicles,
        meta: {
          lastUpdated: pickLastUpdated(vehicles),
        },
      });
    }
  },

  async apiRefresh(req, res) {
    console.log('[GPS] apiRefresh called');
    try {
      const result = await refreshFromApiAndPersist();
      console.log('[GPS] refresh success, vehicles:', result.vehicles.length);
      safeLogRefresh(req, `manual updated=${result.persisted.updated} historyInserted=${result.persisted.historyInserted}`);

      // Add daily values to vehicles
      addDailyTimesToVehicles(result.vehicles);

      return res.json({
        ok: true,
        vehicles: result.vehicles,
        meta: {
          ...result.meta,
          persisted: result.persisted,
          lastUpdated: pickLastUpdated(result.vehicles),
        },
      });
    } catch (e) {
      console.error('[GPS] refresh failed:', e.message);
      const vehicles = GpsModel.getLastAll();
      safeLogRefresh(req, `manual_failed cache_count=${vehicles.length} err=${e && e.message}`);

      // Add daily values to vehicles
      addDailyTimesToVehicles(vehicles);

      // Match apiLive behavior: return cache + error with 200 so UI can still render.
      return res.status(200).json({
        ok: false,
        error: e && e.message ? e.message : 'GPS refresh başarısız',
        code: e && e.code ? e.code : null,
        vehicles,
        meta: {
          lastUpdated: pickLastUpdated(vehicles),
        },
      });
    }
  },

  /**
   * API: Drive/Stop report for a vehicle in a date range
   * Returns segments with type (Drive/Stop), start/end times, locations, duration, distance
   */
  apiDriveStopReport(req, res) {
    const vehicleId = req.params.vehicleId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, error: 'startDate ve endDate gerekli' });
    }

    const sinceIso = new Date(startDate + 'T00:00:00+03:00').toISOString();
    const untilIso = new Date(endDate + 'T23:59:59+03:00').toISOString();

    // Get all history for the date range (no pagination, up to 10000 rows)
    const history = GpsModel.getHistory(vehicleId, { sinceIso, untilIso, limit: 10000 });

    if (!history || history.length === 0) {
      return res.json({ ok: true, segments: [], summary: { totalDrive: 0, totalStop: 0, totalDistance: 0 } });
    }

    // Build Drive/Stop segments
    // A vehicle is "driving" if velocity > 0, "stopped" if velocity === 0
    const segments = [];
    let currentSegment = null;
    const STOP_THRESHOLD = 1; // km/h - below this is considered stopped

    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      const velocity = h.velocity != null ? Number(h.velocity) : 0;
      const isDriving = velocity >= STOP_THRESHOLD;
      const type = isDriving ? 'Drive' : 'Stop';

      if (!currentSegment) {
        // Start first segment
        currentSegment = {
          type,
          startTime: h.time_indicator,
          startLocation: h.address || h.location || '',
          startLat: h.latitude,
          startLng: h.longitude,
          startKm: h.totaldistance,
          endTime: h.time_indicator,
          endLocation: h.address || h.location || '',
          endLat: h.latitude,
          endLng: h.longitude,
          endKm: h.totaldistance,
        };
      } else if (currentSegment.type === type) {
        // Continue same segment
        currentSegment.endTime = h.time_indicator;
        currentSegment.endLocation = h.address || h.location || '';
        currentSegment.endLat = h.latitude;
        currentSegment.endLng = h.longitude;
        currentSegment.endKm = h.totaldistance;
      } else {
        // Type changed - close current segment and start new one
        segments.push(currentSegment);
        currentSegment = {
          type,
          startTime: h.time_indicator,
          startLocation: h.address || h.location || '',
          startLat: h.latitude,
          startLng: h.longitude,
          startKm: h.totaldistance,
          endTime: h.time_indicator,
          endLocation: h.address || h.location || '',
          endLat: h.latitude,
          endLng: h.longitude,
          endKm: h.totaldistance,
        };
      }
    }

    // Push last segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    // Calculate duration and distance for each segment
    let totalDriveSeconds = 0;
    let totalStopSeconds = 0;
    let totalDistance = 0;

    for (const seg of segments) {
      const start = new Date(seg.startTime).getTime();
      const end = new Date(seg.endTime).getTime();
      const durationMs = end - start;
      const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));

      // Format duration as "Xh Ym"
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      seg.duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      seg.durationSeconds = durationSeconds;

      // Calculate distance using Haversine formula from coordinates
      const startLat = seg.startLat != null ? Number(seg.startLat) : null;
      const startLng = seg.startLng != null ? Number(seg.startLng) : null;
      const endLat = seg.endLat != null ? Number(seg.endLat) : null;
      const endLng = seg.endLng != null ? Number(seg.endLng) : null;

      let distance = 0;
      if (startLat && startLng && endLat && endLng) {
        // Haversine formula
        const R = 6371; // Earth's radius in km
        const dLat = (endLat - startLat) * Math.PI / 180;
        const dLng = (endLng - startLng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = R * c * 1.2; // multiply by 1.2 for approximate road distance
      }
      seg.distance = distance > 0.1 ? Math.round(distance * 10) / 10 : 0;

      if (seg.type === 'Drive') {
        totalDriveSeconds += durationSeconds;
        totalDistance += seg.distance;
      } else {
        totalStopSeconds += durationSeconds;
      }
    }

    // Format totals
    const formatDuration = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    };

    return res.json({
      ok: true,
      segments,
      summary: {
        totalDrive: formatDuration(totalDriveSeconds),
        totalDriveSeconds,
        totalStop: formatDuration(totalStopSeconds),
        totalStopSeconds,
        totalDistance: Math.round(totalDistance * 10) / 10,
      },
    });
  },
};

module.exports = gpsController;
