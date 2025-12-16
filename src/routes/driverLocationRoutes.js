/**
 * Driver Location Routes (Web Panel)
 * 
 * EJS views for viewing driver locations in the admin panel.
 * This is different from driverApiRoutes which is for the Android app.
 * 
 * These routes require session authentication (ensureAuth).
 */

const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/authMiddleware');
const DriverLocationModel = require('../models/driverLocationModel');
const DriverMessageModel = require('../models/driverMessageModel');
const db = require('../config/db');

/**
 * GET /driver-locations
 * 
 * Shows all drivers with their latest locations.
 * Main page for viewing driver positions.
 */
router.get('/', ensureAuth, (req, res, next) => {
  DriverLocationModel.getLatestLocations((err, locations) => {
    if (err) {
      console.error('[DriverLocations] Error fetching locations:', err);
      return next(err);
    }

    // Get unread message counts for each driver
    DriverMessageModel.getAllConversations((msgErr, conversations) => {
      // Create a map of driver_id -> unread_count
      const unreadCounts = {};
      if (!msgErr && conversations) {
        conversations.forEach(conv => {
          unreadCounts[conv.driver_id] = conv.unread_count || 0;
        });
      }

      res.render('driver-locations/index', {
        title: 'Şoför Konumları',
        locations: locations || [],
        unreadCounts: unreadCounts,
        currentUser: req.session.user
      });
    });
  });
});

/**
 * GET /driver-locations/management
 * 
 * Shows driver management page for PIN and truck assignment.
 */
router.get('/management', ensureAuth, (req, res, next) => {
  DriverLocationModel.getAllDriversForManagement((err, drivers) => {
    if (err) {
      console.error('[DriverLocations] Error fetching drivers:', err);
      return next(err);
    }

    DriverLocationModel.getAvailableTrucks((truckErr, trucks) => {
      if (truckErr) {
        console.error('[DriverLocations] Error fetching trucks:', truckErr);
        return next(truckErr);
      }

      res.render('driver-locations/management', {
        title: 'Şoför Yönetimi',
        drivers: drivers || [],
        trucks: trucks || [],
        currentUser: req.session.user
      });
    });
  });
});

/**
 * POST /driver-locations/:driverId/update-pin
 * 
 * Update a driver's PIN for Android app login.
 */
router.post('/:driverId/update-pin', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const { pin } = req.body;

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  if (!pin || pin.length < 4) {
    return res.status(400).json({ success: false, message: 'PIN en az 4 karakter olmalı' });
  }

  DriverLocationModel.updateDriverPin(driverId, pin, function(err) {
    if (err) {
      console.error('[DriverLocations] Update PIN error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: 'Şoför bulunamadı' });
    }

    console.log(`[DriverLocations] PIN updated for driver ${driverId}`);
    res.json({ success: true, message: 'PIN güncellendi' });
  });
});

/**
 * POST /driver-locations/:driverId/update-truck
 * 
 * Assign a truck to a driver.
 */
router.post('/:driverId/update-truck', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const { truckPlate } = req.body;

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  DriverLocationModel.updateDriverTruck(driverId, truckPlate, function(err) {
    if (err) {
      console.error('[DriverLocations] Update truck error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    console.log(`[DriverLocations] Truck ${truckPlate || 'removed'} for driver ${driverId}`);
    res.json({ success: true, message: truckPlate ? 'Plaka atandı' : 'Plaka kaldırıldı' });
  });
});

/**
 * POST /driver-locations/:driverId/reset-auth
 * 
 * Reset driver's auth token (force re-login on Android app).
 */
router.post('/:driverId/reset-auth', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  DriverLocationModel.resetDriverAuth(driverId, function(err) {
    if (err) {
      console.error('[DriverLocations] Reset auth error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    console.log(`[DriverLocations] Auth reset for driver ${driverId}`);
    res.json({ success: true, message: 'Oturum sıfırlandı, şoförün yeniden giriş yapması gerekecek' });
  });
});

/**
 * GET /driver-locations/:driverId/history
 * 
 * Shows location history for a specific driver.
 */
router.get('/:driverId/history', ensureAuth, (req, res, next) => {
  const driverId = parseInt(req.params.driverId);

  if (isNaN(driverId)) {
    return res.status(400).send('Geçersiz şoför ID');
  }

  // Get driver info
  DriverLocationModel.getDriverById(driverId, (driverErr, driver) => {
    if (driverErr) {
      console.error('[DriverLocations] Error fetching driver:', driverErr);
      return next(driverErr);
    }

    if (!driver) {
      return res.status(404).send('Şoför bulunamadı');
    }

    // Get driver name from drivers table
    db.get('SELECT name FROM drivers WHERE id = ?', [driverId], (nameErr, driverInfo) => {
      const driverName = driverInfo?.name || `Şoför #${driverId}`;

      // Get location history
      DriverLocationModel.getDriverHistory(driverId, 200, (historyErr, history) => {
        if (historyErr) {
          console.error('[DriverLocations] Error fetching history:', historyErr);
          return next(historyErr);
        }

        res.render('driver-locations/history', {
          title: `${driverName} - Konum Geçmişi`,
          driver: { ...driver, name: driverName },
          history: history || [],
          currentUser: req.session.user
        });
      });
    });
  });
});

/**
 * GET /driver-locations/api/latest
 * 
 * API endpoint for fetching latest locations (for AJAX refresh).
 * Returns JSON data for map updates.
 */
router.get('/api/latest', ensureAuth, (req, res) => {
  DriverLocationModel.getLatestLocations((err, locations) => {
    if (err) {
      console.error('[DriverLocations] API error:', err);
      return res.status(500).json({ error: 'Sunucu hatası' });
    }

    res.json({
      success: true,
      locations: locations || [],
      timestamp: new Date().toISOString()
    });
  });
});

/**
 * GET /driver-locations/api/:driverId/route
 * 
 * API endpoint for fetching route data for a specific date.
 * Used for route playback animation.
 * 
 * Query params:
 * - date: YYYY-MM-DD format (defaults to today)
 */
router.get('/api/:driverId/route', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const date = req.query.date || new Date().toISOString().split('T')[0];

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  // Get all locations for the specified date
  const sql = `
    SELECT 
      latitude, longitude, speed, recorded_at
    FROM driver_locations
    WHERE driver_id = ?
      AND date(recorded_at) = date(?)
    ORDER BY recorded_at ASC
  `;

  db.all(sql, [driverId, date], (err, locations) => {
    if (err) {
      console.error('[DriverLocations] Route API error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < locations.length; i++) {
      totalDistance += calculateDistance(
        locations[i-1].latitude, locations[i-1].longitude,
        locations[i].latitude, locations[i].longitude
      );
    }

    res.json({
      success: true,
      driverId,
      date,
      totalPoints: locations.length,
      totalDistanceKm: Math.round(totalDistance * 10) / 10,
      route: locations
    });
  });
});

/**
 * GET /driver-locations/api/:driverId/available-dates
 * 
 * Get list of dates that have location data for a driver.
 */
router.get('/api/:driverId/available-dates', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  const sql = `
    SELECT DISTINCT date(recorded_at) as date, COUNT(*) as point_count
    FROM driver_locations
    WHERE driver_id = ?
    GROUP BY date(recorded_at)
    ORDER BY date DESC
    LIMIT 30
  `;

  db.all(sql, [driverId], (err, dates) => {
    if (err) {
      console.error('[DriverLocations] Available dates error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    res.json({
      success: true,
      dates: dates || []
    });
  });
});

/**
 * Helper function to calculate distance between two GPS points (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * POST /driver-locations/:driverId/set-pin
 * 
 * Set or update a driver's PIN for Android app login.
 */
router.post('/:driverId/set-pin', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const { pin } = req.body;

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  if (!pin || pin.length < 4) {
    return res.status(400).json({ success: false, message: 'PIN en az 4 karakter olmalı' });
  }

  db.run('UPDATE drivers SET pin = ? WHERE id = ?', [pin, driverId], function(err) {
    if (err) {
      console.error('[DriverLocations] Set PIN error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: 'Şoför bulunamadı' });
    }

    res.json({ success: true, message: 'PIN güncellendi' });
  });
});

/**
 * GET /driver-locations/api/export
 * 
 * Export all driver locations to CSV format.
 */
router.get('/api/export', ensureAuth, (req, res) => {
  DriverLocationModel.getLatestLocations((err, locations) => {
    if (err) {
      console.error('[DriverLocations] Export error:', err);
      return res.status(500).json({ error: 'Sunucu hatası' });
    }

    // CSV header
    let csv = 'Şoför ID,Şoför Adı,Telefon,Plaka,Enlem,Boylam,Hız (km/h),Takip Durumu,Son Güncelleme\n';
    
    // Add rows
    locations.forEach(loc => {
      const trackingStatus = loc.is_tracking ? 'Aktif' : 'Kapalı';
      const recordedAt = loc.recorded_at ? new Date(loc.recorded_at).toLocaleString('tr-TR') : '-';
      csv += `${loc.driver_id},"${loc.driver_name || ''}","${loc.phone || ''}","${loc.truck_plate || ''}",${loc.latitude || ''},${loc.longitude || ''},${Math.round(loc.speed || 0)},${trackingStatus},"${recordedAt}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=sofor-konumlari-' + new Date().toISOString().split('T')[0] + '.csv');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8 support
  });
});

/**
 * POST /driver-locations/api/broadcast
 * 
 * Send a message to all drivers (broadcast).
 */
router.post('/api/broadcast', ensureAuth, (req, res) => {
  const { message } = req.body;
  const senderName = req.session.user?.username || 'Operasyon';

  if (!message || message.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Mesaj boş olamaz' });
  }

  // Get all drivers (not just active ones)
  console.log('[Broadcast] Fetching all drivers...');
  db.all(`SELECT id, name FROM drivers`, [], (err, drivers) => {
    console.log('[Broadcast] Query result - err:', err, 'drivers count:', drivers ? drivers.length : 'null');
    if (err) {
      console.error('[DriverLocations] Broadcast error:', err);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    if (!drivers || drivers.length === 0) {
      console.log('[Broadcast] No drivers found!');
      return res.json({ success: true, message: 'Şoför bulunamadı', sentCount: 0 });
    }

    console.log('[Broadcast] Sending to', drivers.length, 'drivers');
    
    let sentCount = 0;
    let errors = 0;

    drivers.forEach(driver => {
      DriverMessageModel.sendMessage({
        driver_id: driver.id,
        sender_type: 'operator',
        sender_id: req.session.user?.id || null,
        sender_name: senderName,
        message: message.trim(),
        image_path: null
      }, (msgErr) => {
        if (msgErr) {
          console.error('[Broadcast] Error sending to driver', driver.id, msgErr);
          errors++;
        } else {
          sentCount++;
        }

        // After all messages sent
        if (sentCount + errors === drivers.length) {
          // Emit socket event for real-time update
          const io = req.app.get('io');
          if (io) {
            drivers.forEach(driver => {
              io.to(`driver_${driver.id}`).emit('operator_new_message', {
                driverId: driver.id,
                message: message.trim(),
                senderName: senderName,
                timestamp: new Date().toISOString()
              });
            });
          }

          res.json({
            success: true,
            message: `${sentCount} şoföre mesaj gönderildi`,
            sentCount: sentCount,
            errorCount: errors
          });
        }
      });
    });
  });
});

/**
 * DELETE /driver-locations/api/delete-all-messages
 * 
 * Delete all driver messages from database.
 */
router.delete('/api/delete-all-messages', ensureAuth, (req, res) => {
  // First count how many messages exist
  db.get(`SELECT COUNT(*) as count FROM driver_messages`, [], (countErr, countResult) => {
    if (countErr) {
      console.error('[DriverLocations] Count messages error:', countErr);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    const messageCount = countResult?.count || 0;

    if (messageCount === 0) {
      return res.json({ success: true, message: 'Silinecek mesaj bulunamadı', deletedCount: 0 });
    }

    // Delete all messages
    db.run(`DELETE FROM driver_messages`, [], function(err) {
      if (err) {
        console.error('[DriverLocations] Delete messages error:', err);
        return res.status(500).json({ success: false, message: 'Silme işlemi başarısız' });
      }

      console.log(`[DriverLocations] ${messageCount} messages deleted by ${req.session.user?.username}`);
      res.json({
        success: true,
        message: `${messageCount} mesaj başarıyla silindi`,
        deletedCount: messageCount
      });
    });
  });
});

/**
 * DELETE /driver-locations/api/delete-all-locations
 * 
 * Delete all driver locations from database.
 */
router.delete('/api/delete-all-locations', ensureAuth, (req, res) => {
  const username = req.session.user?.username || 'unknown';
  
  // Count locations first
  db.get(`SELECT COUNT(*) as count FROM driver_locations`, [], (countErr, locResult) => {
    if (countErr) {
      console.error('[DriverLocations] Count locations error:', countErr);
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    const locCount = locResult?.count || 0;

    if (locCount === 0) {
      return res.json({ success: true, message: 'Silinecek konum verisi bulunamadı', deletedCount: 0 });
    }

    // Delete all locations
    db.run(`DELETE FROM driver_locations`, [], function(locDelErr) {
      if (locDelErr) {
        console.error('[DriverLocations] Delete locations error:', locDelErr);
        return res.status(500).json({ success: false, message: 'Konum silme işlemi başarısız' });
      }

      console.log(`[DriverLocations] DELETED ALL LOCATIONS by ${username}: ${locCount} location records`);
      res.json({
        success: true,
        message: `${locCount} konum kaydı silindi`,
        deletedCount: locCount
      });
    });
  });
});

module.exports = router;
