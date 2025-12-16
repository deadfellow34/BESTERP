
const db = require('../config/db');

module.exports = {
  getVehicleStatsById(truckId, yearPrefix, cb) {
    // Support both (truckId, cb) and (truckId, yearPrefix, cb) signatures
    if (typeof yearPrefix === 'function') {
      cb = yearPrefix;
      yearPrefix = null;
    }
    
    const sqlPlate = `SELECT plate FROM trucks WHERE id = ?`;
    db.get(sqlPlate, [truckId], (err, r) => {
      if (err) return cb(err);
      if (!r) return cb(new Error('Truck not found'));
      const plate = r.plate;
      
      // Build year filter
      const yearPattern = yearPrefix ? (yearPrefix + '/%') : null;
      const yearCondition = yearPattern ? ' AND position_no LIKE ?' : '';
      const yearParams = yearPattern ? [plate, yearPattern] : [plate];
      
      const sql = `
        SELECT
          COUNT(DISTINCT ld.position_no) as trip_count,
          COALESCE(SUM(pk.total_km), 0) as total_km,
          COALESCE(SUM(pk.loading_count), 0) as loading_count,
          COALESCE(SUM(pk.unloading_count), 0) as unloading_count,
          COALESCE(SUM(pk.europe_count), 0) as europe_count,
          COALESCE(SUM(ld.total_gross), 0) as total_weight_kg,
          COALESCE(SUM(ld.total_packages), 0) as total_packages
        FROM (
          SELECT position_no, SUM(COALESCE(gross_weight,0)) as total_gross, SUM(COALESCE(packages,0)) as total_packages
          FROM loads WHERE truck_plate = ?${yearCondition}
          GROUP BY position_no
        ) as ld
        LEFT JOIN position_km pk ON ld.position_no = pk.position_no
      `;
      db.get(sql, yearParams, (err2, row) => {
        if (err2) return cb(err2);
        
        const loadingCount = row ? Number(row.loading_count || 0) : 0;
        const unloadingCount = row ? Number(row.unloading_count || 0) : 0;
        const europeCount = row ? Number(row.europe_count || 0) : 0;
        const totalLoadUnload = loadingCount + unloadingCount + europeCount;
        const loadUnloadCost = totalLoadUnload * 25; // €25 per load/unload
        
        cb(null, {
          plate,
          trip_count: row ? Number(row.trip_count) : 0,
          total_km: row ? Number(row.total_km || 0) : 0,
          loading_count: loadingCount,
          unloading_count: unloadingCount,
          europe_count: europeCount,
          load_unload_cost: loadUnloadCost,
          total_weight_kg: row ? Number(row.total_weight_kg || 0) : 0,
          total_packages: row ? Number(row.total_packages || 0) : 0,
        });
      });
    });
  }
};
