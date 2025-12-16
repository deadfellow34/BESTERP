/**
 * Driver Location Model
 * 
 * Handles GPS location data from the Android driver app.
 * 
 * The Android app sends location data to POST /api/driver/location
 * This model stores and retrieves that location data.
 * 
 * Table: driver_locations
 * - id: Primary key
 * - driver_id: Foreign key to drivers table
 * - latitude: GPS latitude
 * - longitude: GPS longitude
 * - speed: Speed in km/h (from GPS)
 * - recorded_at: Timestamp when location was recorded on device
 * - created_at: Timestamp when record was created in database
 */

const db = require('../config/db');
const crypto = require('crypto');

const DriverLocationModel = {
  /**
   * Save a new location record
   * @param {Object} locationData - { driver_id, latitude, longitude, speed, recorded_at }
   * @param {Function} callback - (err, result)
   */
  saveLocation(locationData, callback) {
    const { driver_id, latitude, longitude, speed, recorded_at } = locationData;
    
    const sql = `
      INSERT INTO driver_locations (driver_id, latitude, longitude, speed, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [driver_id, latitude, longitude, speed || 0, recorded_at], function(err) {
      if (err) return callback(err);
      
      // Also update driver's last_location_at and is_tracking
      db.run(
        `UPDATE drivers SET last_location_at = ?, is_tracking = 1 WHERE id = ?`,
        [recorded_at, driver_id],
        (updateErr) => {
          if (updateErr) console.error('[DriverLocation] Failed to update driver status:', updateErr.message);
        }
      );
      
      callback(null, { id: this.lastID });
    });
  },

  /**
   * Get the latest location for each driver with truck info
   * @param {Function} callback - (err, locations)
   */
  getLatestLocations(callback) {
    const sql = `
      SELECT 
        d.id as driver_id,
        d.name as driver_name,
        d.phone,
        d.truck_plate,
        d.pin,
        d.is_tracking,
        dl.latitude,
        dl.longitude,
        dl.speed,
        dl.recorded_at,
        dl.created_at
      FROM drivers d
      LEFT JOIN (
        SELECT driver_id, latitude, longitude, speed, recorded_at, created_at,
               ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY recorded_at DESC) as rn
        FROM driver_locations
      ) dl ON d.id = dl.driver_id AND dl.rn = 1
      ORDER BY dl.recorded_at DESC NULLS LAST, d.name
    `;
    
    db.all(sql, [], callback);
  },

  /**
   * Get all drivers with PIN info for management
   * @param {Function} callback - (err, drivers)
   */
  getAllDriversForManagement(callback) {
    const sql = `
      SELECT 
        d.id,
        d.name,
        d.phone,
        d.truck_plate,
        d.pin,
        d.is_tracking,
        d.last_location_at,
        d.auth_token,
        (SELECT COUNT(*) FROM driver_locations WHERE driver_id = d.id) as location_count
      FROM drivers d
      ORDER BY d.name
    `;
    
    db.all(sql, [], callback);
  },

  /**
   * Get all available trucks for assignment
   * @param {Function} callback - (err, trucks)
   */
  getAvailableTrucks(callback) {
    const sql = `
      SELECT plate, driver_name, active
      FROM trucks
      WHERE active = 1
      ORDER BY plate
    `;
    
    db.all(sql, [], callback);
  },

  /**
   * Update driver's PIN
   * @param {number} driverId - The driver ID
   * @param {string} pin - New PIN (4+ digits)
   * @param {Function} callback - (err)
   */
  updateDriverPin(driverId, pin, callback) {
    db.run('UPDATE drivers SET pin = ? WHERE id = ?', [pin, driverId], callback);
  },

  /**
   * Update driver's truck assignment
   * @param {number} driverId - The driver ID
   * @param {string} truckPlate - The truck plate to assign
   * @param {Function} callback - (err)
   */
  updateDriverTruck(driverId, truckPlate, callback) {
    db.run('UPDATE drivers SET truck_plate = ? WHERE id = ?', [truckPlate || null, driverId], callback);
  },

  /**
   * Reset driver's auth token (force re-login)
   * @param {number} driverId - The driver ID
   * @param {Function} callback - (err)
   */
  resetDriverAuth(driverId, callback) {
    db.run('UPDATE drivers SET auth_token = NULL WHERE id = ?', [driverId], callback);
  },

  /**
   * Get location history for a specific driver
   * @param {number} driverId - The driver ID
   * @param {number} limit - Max records to return (default 100)
   * @param {Function} callback - (err, locations)
   */
  getDriverHistory(driverId, limit = 100, callback) {
    const sql = `
      SELECT 
        id,
        latitude,
        longitude,
        speed,
        recorded_at,
        created_at
      FROM driver_locations
      WHERE driver_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `;
    
    db.all(sql, [driverId, limit], callback);
  },

  /**
   * Get locations for today for a specific driver
   * @param {number} driverId - The driver ID
   * @param {Function} callback - (err, locations)
   */
  getTodayLocations(driverId, callback) {
    const sql = `
      SELECT 
        id,
        latitude,
        longitude,
        speed,
        recorded_at,
        created_at
      FROM driver_locations
      WHERE driver_id = ?
        AND date(recorded_at) = date('now')
      ORDER BY recorded_at DESC
    `;
    
    db.all(sql, [driverId], callback);
  },

  /**
   * Authenticate driver by ID and PIN
   * @param {string} driverId - Driver ID (can be name or database ID)
   * @param {string} pin - Driver's PIN
   * @param {Function} callback - (err, driver)
   */
  authenticateDriver(driverId, pin, callback) {
    // Try to find driver by ID or name
    const sql = `
      SELECT id, name, phone, pin, auth_token
      FROM drivers
      WHERE id = ? OR UPPER(TRIM(name)) = UPPER(TRIM(?))
    `;
    
    db.get(sql, [driverId, driverId], (err, driver) => {
      if (err) return callback(err);
      if (!driver) return callback(null, null, 'Şoför bulunamadı');
      
      // PIN must be set for driver to login
      if (!driver.pin) {
        return callback(null, null, 'Bu şoför için PIN tanımlanmamış. Yöneticinize başvurun.');
      }
      
      // Check PIN matches
      if (driver.pin !== pin) {
        return callback(null, null, 'Yanlış PIN');
      }
      
      // Generate new auth token
      const authToken = crypto.randomBytes(32).toString('hex');
      
      // Update driver with new auth token
      db.run(`UPDATE drivers SET auth_token = ? WHERE id = ?`, [authToken, driver.id], (updateErr) => {
        if (updateErr) return callback(updateErr);
        
        callback(null, {
          id: driver.id,
          name: driver.name,
          authToken: authToken
        });
      });
    });
  },

  /**
   * Validate auth token
   * @param {string} authToken - The auth token to validate
   * @param {Function} callback - (err, driver)
   */
  validateAuthToken(authToken, callback) {
    const sql = `
      SELECT id, name, phone
      FROM drivers
      WHERE auth_token = ?
    `;
    
    db.get(sql, [authToken], callback);
  },

  /**
   * Get driver by ID
   * @param {number} driverId - The driver ID
   * @param {Function} callback - (err, driver)
   */
  getDriverById(driverId, callback) {
    const sql = `
      SELECT id, name, phone, is_tracking, last_location_at
      FROM drivers
      WHERE id = ?
    `;
    
    db.get(sql, [driverId], callback);
  },

  /**
   * Update driver tracking status
   * @param {number} driverId - The driver ID
   * @param {boolean} isTracking - Whether driver is currently tracking
   * @param {Function} callback - (err)
   */
  updateTrackingStatus(driverId, isTracking, callback) {
    const sql = `UPDATE drivers SET is_tracking = ? WHERE id = ?`;
    db.run(sql, [isTracking ? 1 : 0, driverId], callback);
  },

  /**
   * Get all drivers with their tracking status
   * @param {Function} callback - (err, drivers)
   */
  getAllDriversWithStatus(callback) {
    const sql = `
      SELECT 
        d.id,
        d.name,
        d.phone,
        d.is_tracking,
        d.last_location_at,
        (SELECT COUNT(*) FROM driver_locations WHERE driver_id = d.id) as total_locations
      FROM drivers d
      ORDER BY d.name
    `;
    
    db.all(sql, [], callback);
  },

  /**
   * Delete old location records (cleanup)
   * @param {number} daysOld - Delete records older than this many days
   * @param {Function} callback - (err, changes)
   */
  deleteOldLocations(daysOld = 30, callback) {
    const sql = `
      DELETE FROM driver_locations
      WHERE recorded_at < datetime('now', '-' || ? || ' days')
    `;
    
    db.run(sql, [daysOld], function(err) {
      if (err) return callback(err);
      callback(null, this.changes);
    });
  },

  /**
   * Set driver's tracking status
   * @param {number|string} driverId - Driver ID
   * @param {boolean} isTracking - true/false
   * @param {Function} callback - (err)
   */
  setDriverTracking(driverId, isTracking, callback) {
    const sql = `UPDATE drivers SET is_tracking = ? WHERE id = ?`;
    db.run(sql, [isTracking ? 1 : 0, driverId], callback);
  },

  /**
   * Get active position for a driver
   * Finds the most recent load assigned to this driver's truck
   * Returns SUMMARY info for dashboard (aggregated data)
   * @param {number} driverId - Driver ID
   * @param {Function} callback - (err, position)
   */
  getActivePosition(driverId, callback) {
    // First get the driver's truck plate
    const driverSql = `SELECT id, name, truck_plate FROM drivers WHERE id = ?`;
    
    db.get(driverSql, [driverId], (err, driver) => {
      if (err) return callback(err);
      if (!driver) return callback(null, null);
      
      // If driver has no truck assigned, return null
      if (!driver.truck_plate) {
        return callback(null, { hasPosition: false, message: 'Araç ataması yok' });
      }
      
      // Find the most recent position_no for this truck
      const positionSql = `
        SELECT position_no, trailer_plate
        FROM loads
        WHERE truck_plate = ?
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      db.get(positionSql, [driver.truck_plate], (posErr, posRow) => {
        if (posErr) return callback(posErr);
        
        if (!posRow) {
          return callback(null, { 
            hasPosition: false, 
            truckPlate: driver.truck_plate,
            message: 'Aktif pozisyon yok' 
          });
        }
        
        const positionNo = posRow.position_no;
        const trailerPlate = posRow.trailer_plate;
        
        // Get all loads for this position - aggregate data for summary
        const loadsSql = `
          SELECT 
            loading_city,
            unloading_country,
            unloading_city,
            packages,
            gross_weight
          FROM loads
          WHERE position_no = ?
        `;
        
        db.all(loadsSql, [positionNo], (loadsErr, loads) => {
          if (loadsErr) return callback(loadsErr);
          
          // Aggregate data
          let totalPackages = 0;
          let totalWeight = 0;
          const loadingCities = new Set();
          const destinations = []; // {gumruk, antrepo}
          
          loads.forEach(load => {
            totalPackages += load.packages || 0;
            totalWeight += load.gross_weight || 0;
            if (load.loading_city) loadingCities.add(load.loading_city);
            
            // Unique destinations
            const destKey = `${load.unloading_country || ''}-${load.unloading_city || ''}`;
            const existingDest = destinations.find(d => `${d.gumruk}-${d.antrepo}` === destKey);
            if (!existingDest && (load.unloading_country || load.unloading_city)) {
              destinations.push({
                gumruk: load.unloading_country || '',
                antrepo: load.unloading_city || ''
              });
            }
          });
          
          callback(null, {
            hasPosition: true,
            truckPlate: driver.truck_plate,
            position: {
              positionNo: positionNo,
              trailerPlate: trailerPlate,
              loadingCity: Array.from(loadingCities).join(', '),
              destinations: destinations,
              totalPackages: totalPackages,
              totalWeight: totalWeight,
              loadCount: loads.length
            }
          });
        });
      });
    });
  },

  /**
   * Get all loads for a position (detail view)
   * @param {string} positionNo - Position number
   * @param {Function} callback - (err, loads)
   */
  getPositionLoads(positionNo, callback) {
    const sql = `
      SELECT 
        id,
        position_no,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        unloading_country,
        unloading_city,
        packages,
        gross_weight,
        goods_description,
        trailer_plate,
        driver_name,
        seal_code
      FROM loads
      WHERE position_no = ?
      ORDER BY id
    `;
    
    db.all(sql, [positionNo], (err, loads) => {
      if (err) return callback(err);
      
      const formattedLoads = loads.map(load => ({
        id: load.id,
        customerName: load.customer_name,
        consigneeName: load.consignee_name,
        loadingCountry: load.loading_country,
        loadingCity: load.loading_city,
        unloadingCountry: load.unloading_country,
        unloadingCity: load.unloading_city,
        packages: load.packages,
        grossWeight: load.gross_weight,
        goodsDescription: load.goods_description,
        trailerPlate: load.trailer_plate,
        driverName: load.driver_name,
        sealCode: load.seal_code
      }));
      
      callback(null, {
        positionNo: positionNo,
        loads: formattedLoads,
        totalLoads: formattedLoads.length
      });
    });
  },

  /**
   * Get latest locations for multiple truck plates
   * @param {Array<string>} truckPlates - Array of truck plate numbers
   * @param {Function} callback - (err, locations) - locations is object { truckPlate: { lat, lng, recorded_at } }
   */
  getLocationsByTruckPlates(truckPlates, callback) {
    if (!truckPlates || truckPlates.length === 0) {
      return callback(null, {});
    }

    // Get drivers with these truck plates and their latest location
    const placeholders = truckPlates.map(() => '?').join(',');
    const sql = `
      SELECT 
        d.truck_plate,
        dl.latitude,
        dl.longitude,
        dl.recorded_at
      FROM drivers d
      INNER JOIN (
        SELECT driver_id, latitude, longitude, recorded_at,
               ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY recorded_at DESC) as rn
        FROM driver_locations
      ) dl ON d.id = dl.driver_id AND dl.rn = 1
      WHERE d.truck_plate IN (${placeholders})
    `;
    
    db.all(sql, truckPlates, (err, rows) => {
      if (err) return callback(err);
      
      const locations = {};
      if (rows && rows.length > 0) {
        rows.forEach(row => {
          locations[row.truck_plate] = {
            latitude: row.latitude,
            longitude: row.longitude,
            recorded_at: row.recorded_at
          };
        });
      }
      
      callback(null, locations);
    });
  },

  /**
   * Get documents for a position (Evraklar and T1/GMR categories)
   * For Android driver app
   * @param {string} positionNo - Position number
   * @param {Function} callback - (err, documents)
   */
  getPositionDocuments(positionNo, callback) {
    // Get Evraklar and T1/GMR categories - include driver uploads but not accounting docs
    const sql = `
      SELECT 
        id,
        filename,
        original_name,
        category,
        created_at
      FROM documents
      WHERE position_no = ?
        AND category IN ('Evraklar', 'T1/GMR')
        AND (type IS NULL OR trim(type) = '' OR type = 'driver_upload')
      ORDER BY 
        CASE WHEN category = 'T1/GMR' THEN 0 ELSE 1 END,
        created_at DESC
    `;
    
    db.all(sql, [positionNo], (err, rows) => {
      if (err) return callback(err);
      
      const documents = (rows || []).map(doc => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.original_name,
        category: doc.category,
        createdAt: doc.created_at
      }));
      
      callback(null, {
        positionNo,
        documents,
        totalDocuments: documents.length,
        t1GmrCount: documents.filter(d => d.category === 'T1/GMR').length,
        evraklarCount: documents.filter(d => d.category === 'Evraklar').length
      });
    });
  }
};

module.exports = DriverLocationModel;
