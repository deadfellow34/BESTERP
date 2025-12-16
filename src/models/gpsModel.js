const db = require('../config/db');

function nowIso() {
  return new Date().toISOString();
}

function coalesceText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolIntOrNull(v) {
  if (v == null) return null;
  return v ? 1 : 0;
}

const GpsModel = {
  getLastAll() {
    const sql = `
      SELECT
        vehicleid,
        plate,
        drivername,
        latitude,
        longitude,
        velocity,
        address,
        location,
        direction,
        time_indicator,
        drivetime,
        worktime,
        idletime,
        stoptime,
        totaldistance,
        start_km,
        flags,
        communication,
        colorcode,
        updated_at
      FROM gps_vehicle_last
      ORDER BY plate COLLATE NOCASE ASC
    `;
    return db.allSync(sql, []);
  },

  getLastByVehicleId(vehicleId) {
    const sql = `
      SELECT
        vehicleid,
        plate,
        drivername,
        latitude,
        longitude,
        velocity,
        address,
        location,
        direction,
        time_indicator,
        drivetime,
        worktime,
        idletime,
        stoptime,
        totaldistance,
        start_km,
        flags,
        communication,
        colorcode,
        updated_at
      FROM gps_vehicle_last
      WHERE vehicleid = ?
      LIMIT 1
    `;
    return db.getSync(sql, [Number(vehicleId)]);
  },

  /**
   * Get vehicles by plate names - OPTIMIZED with pre-indexed Map
   * @param {string[]} plates - Array of plate strings to search
   * @returns {Object} - Map of plate -> vehicle data
   */
  getByPlates(plates) {
    if (!Array.isArray(plates) || plates.length === 0) return {};
    
    // Get all vehicles once - single SQL query
    const sql = `
      SELECT plate, latitude, longitude, address, location, velocity, time_indicator, drivername
      FROM gps_vehicle_last
      WHERE plate IS NOT NULL
    `;
    const allVehicles = db.allSync(sql, []);
    
    // Pre-build index Map for O(1) lookup - normalize all plates
    const vehicleMap = new Map();
    for (const v of allVehicles) {
      const norm = (v.plate || '').replace(/\s+/g, '').toUpperCase();
      vehicleMap.set(norm, v);
    }
    
    // Match requested plates
    const result = {};
    for (const plate of plates) {
      if (!plate) continue;
      const orig = plate.toString();
      const norm = orig.replace(/\s+/g, '').toUpperCase();
      
      // Direct O(1) lookup
      const match = vehicleMap.get(norm);
      if (match) {
        result[orig] = {
          plate: match.plate,
          latitude: match.latitude,
          longitude: match.longitude,
          address: match.address,
          location: match.location,
          velocity: match.velocity,
          time_indicator: match.time_indicator,
          drivername: match.drivername
        };
      }
    }
    
    return result;
  },

  getVehicleList() {
    const sql = `
      SELECT vehicleid, plate
      FROM gps_vehicle_last
      WHERE plate IS NOT NULL
      ORDER BY plate COLLATE NOCASE ASC
    `;
    return db.allSync(sql, []);
  },

  getHistory(vehicleId, options = {}) {
    const limit = options.limit != null ? Number(options.limit) : 1000;
    const sinceIso = options.sinceIso || null;

    if (sinceIso) {
      const sql = `
        SELECT
          id,
          vehicleid,
          plate,
          latitude,
          longitude,
          velocity,
          time_indicator,
          address,
          drivetime,
          worktime,
          idletime,
          stoptime,
          totaldistance,
          start_km,
          created_at
        FROM gps_vehicle_history
        WHERE vehicleid = ?
          AND time_indicator >= ?
        ORDER BY time_indicator ASC
        LIMIT ?
      `;
      return db.allSync(sql, [Number(vehicleId), sinceIso, limit]);
    }

    const sql = `
      SELECT
        id,
        vehicleid,
        plate,
        latitude,
        longitude,
        velocity,
        time_indicator,
        address,
        drivetime,
        worktime,
        idletime,
        stoptime,
        totaldistance,
        start_km,
        created_at
      FROM gps_vehicle_history
      WHERE vehicleid = ?
      ORDER BY time_indicator DESC
      LIMIT ?
    `;

    const rows = db.allSync(sql, [Number(vehicleId), limit]);
    return rows.reverse();
  },

  upsertLastAndHistory(vehicles) {
    const rows = Array.isArray(vehicles) ? vehicles : [];
    if (!rows.length) return { updated: 0, historyInserted: 0 };

    const updatedAt = nowIso();

    const upsertLastStmt = db.prepare(`
      INSERT INTO gps_vehicle_last (
        vehicleid,
        plate,
        drivername,
        latitude,
        longitude,
        velocity,
        address,
        location,
        direction,
        time_indicator,
        drivetime,
        worktime,
        idletime,
        stoptime,
        totaldistance,
        start_km,
        flags,
        communication,
        colorcode,
        updated_at
      ) VALUES (
        @vehicleid,
        @plate,
        @drivername,
        @latitude,
        @longitude,
        @velocity,
        @address,
        @location,
        @direction,
        @time_indicator,
        @drivetime,
        @worktime,
        @idletime,
        @stoptime,
        @totaldistance,
        @start_km,
        @flags,
        @communication,
        @colorcode,
        @updated_at
      )
      ON CONFLICT(vehicleid) DO UPDATE SET
        plate=excluded.plate,
        drivername=excluded.drivername,
        latitude=excluded.latitude,
        longitude=excluded.longitude,
        velocity=excluded.velocity,
        address=excluded.address,
        location=excluded.location,
        direction=excluded.direction,
        time_indicator=excluded.time_indicator,
        drivetime=excluded.drivetime,
        worktime=excluded.worktime,
        idletime=excluded.idletime,
        stoptime=excluded.stoptime,
        totaldistance=excluded.totaldistance,
        start_km=excluded.start_km,
        flags=excluded.flags,
        communication=excluded.communication,
        colorcode=excluded.colorcode,
        updated_at=excluded.updated_at
    `);

    const insertHistoryStmt = db.prepare(`
      INSERT OR IGNORE INTO gps_vehicle_history (
        vehicleid,
        plate,
        latitude,
        longitude,
        velocity,
        time_indicator,
        address,
        drivetime,
        worktime,
        idletime,
        stoptime,
        totaldistance,
        start_km,
        created_at
      ) VALUES (
        @vehicleid,
        @plate,
        @latitude,
        @longitude,
        @velocity,
        @time_indicator,
        @address,
        @drivetime,
        @worktime,
        @idletime,
        @stoptime,
        @totaldistance,
        @start_km,
        @created_at
      )
    `);

    const tx = db.transaction((items) => {
      let updated = 0;
      let historyInserted = 0;

      for (const v of items) {
        const record = {
          vehicleid: Number(v.vehicleid),
          plate: coalesceText(v.plate),
          drivername: coalesceText(v.drivername),
          latitude: numOrNull(v.latitude),
          longitude: numOrNull(v.longitude),
          velocity: numOrNull(v.velocity),
          address: coalesceText(v.address),
          location: coalesceText(v.location),
          direction: numOrNull(v.direction),
          time_indicator: coalesceText(v.time_indicator),
          drivetime: numOrNull(v.drivetime),
          worktime: numOrNull(v.worktime),
          idletime: numOrNull(v.idletime),
          stoptime: numOrNull(v.stoptime),
          totaldistance: numOrNull(v.totaldistance),
          start_km: numOrNull(v.start_km),
          flags: numOrNull(v.flags),
          communication: boolIntOrNull(v.communication),
          colorcode: coalesceText(v.colorcode),
          updated_at: updatedAt,
        };

        upsertLastStmt.run(record);
        updated += 1;

        // history: only if time_indicator exists
        if (record.time_indicator) {
          const hist = {
            vehicleid: record.vehicleid,
            plate: record.plate,
            latitude: record.latitude,
            longitude: record.longitude,
            velocity: record.velocity,
            time_indicator: record.time_indicator,
            address: record.address,
            drivetime: record.drivetime,
            worktime: record.worktime,
            idletime: record.idletime,
            stoptime: record.stoptime,
            totaldistance: record.totaldistance,
            start_km: record.start_km,
            created_at: updatedAt,
          };
          const res = insertHistoryStmt.run(hist);
          if (res && res.changes) historyInserted += res.changes;
        }
      }

      return { updated, historyInserted };
    });

    return tx(rows);
  },

  deleteHistoryOlderThan(days = 30) {
    const safeDays = Number(days);
    if (!Number.isFinite(safeDays) || safeDays <= 0) return 0;

    // Compare ISO strings in UTC.
    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    const stmt = db.prepare(`DELETE FROM gps_vehicle_history WHERE time_indicator IS NOT NULL AND time_indicator < ?`);
    const res = stmt.run(cutoff);
    return res.changes || 0;
  },
};

module.exports = GpsModel;
