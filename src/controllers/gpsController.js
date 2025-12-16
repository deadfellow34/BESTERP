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

const gpsController = {
  index(req, res) {
    return res.redirect('/gps/live');
  },

  livePage(req, res) {
    const vehicles = GpsModel.getLastAll();
    const lastUpdated = pickLastUpdated(vehicles);

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

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const history = GpsModel.getHistory(vehicleId, { sinceIso, limit: 2000 });

    return res.render('gps/vehicle', {
      pageTitle: `GPS - ${vehicle.plate || vehicle.vehicleid}`,
      vehicle,
      history,
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
};

module.exports = gpsController;
