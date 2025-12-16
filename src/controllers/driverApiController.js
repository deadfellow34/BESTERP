/**
 * Driver API Controller
 * 
 * Handles requests from the Android driver app.
 * 
 * The Android app sends:
 * 1. Login requests with driverId + PIN
 * 2. GPS location updates with lat, lng, speed, timestamp
 * 
 * This controller validates the requests and stores data in SQLite.
 */

const DriverLocationModel = require('../models/driverLocationModel');
const DriverMessageModel = require('../models/driverMessageModel');
const path = require('path');
const fs = require('fs');

const driverApiController = {
  /**
   * POST /api/driver/login
   * 
   * Authenticates a driver and returns an auth token.
   * The Android app stores this token and sends it with each location update.
   */
  login(req, res) {
    const { driverId, pin } = req.body;

    // Validate required fields
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN gerekli'
      });
    }

    // Authenticate driver
    DriverLocationModel.authenticateDriver(driverId, pin, (err, driver, errorMessage) => {
      if (err) {
        console.error('[DriverAPI] Login error:', err);
        return res.status(500).json({
          success: false,
          message: 'Sunucu hatası'
        });
      }

      if (!driver) {
        return res.status(401).json({
          success: false,
          message: errorMessage || 'Giriş başarısız'
        });
      }

      console.log(`[DriverAPI] Driver logged in: ${driver.name} (ID: ${driver.id})`);

      // Return success with auth token
      res.json({
        success: true,
        authToken: driver.authToken,
        driverName: driver.name,
        driverId: driver.id.toString(),
        message: 'Giriş başarılı'
      });
    });
  },

  /**
   * POST /api/driver/location
   * 
   * Receives GPS location data from the Android app.
   * Validates auth token and stores location in database.
   * 
   * Expected payload:
   * {
   *   "driverId": "123",
   *   "lat": 41.0123,
   *   "lng": 29.1234,
   *   "speed": 78.5,
   *   "timestamp": "2025-12-06T10:15:00Z",
   *   "authToken": "abc123..."
   * }
   */
  receiveLocation(req, res) {
    const { driverId, lat, lng, speed, timestamp, authToken } = req.body;

    // Validate required fields
    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli (authToken eksik)'
      });
    }

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Konum verisi eksik (lat, lng gerekli)'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err) {
        console.error('[DriverAPI] Token validation error:', err);
        return res.status(500).json({
          success: false,
          message: 'Sunucu hatası'
        });
      }

      if (!driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz veya süresi dolmuş token'
        });
      }

      // Prepare location data
      const locationData = {
        driver_id: driver.id,
        latitude: parseFloat(lat),
        longitude: parseFloat(lng),
        speed: parseFloat(speed) || 0,
        recorded_at: timestamp || new Date().toISOString()
      };

      // Validate coordinates
      if (isNaN(locationData.latitude) || isNaN(locationData.longitude)) {
        return res.status(400).json({
          success: false,
          message: 'Geçersiz koordinat değerleri'
        });
      }

      // Save location
      DriverLocationModel.saveLocation(locationData, (saveErr, result) => {
        if (saveErr) {
          console.error('[DriverAPI] Save location error:', saveErr);
          return res.status(500).json({
            success: false,
            message: 'Konum kaydedilemedi'
          });
        }

        console.log(`[DriverAPI] Location saved for ${driver.name}: ${lat}, ${lng} (speed: ${speed || 0})`);

        res.json({
          success: true,
          message: 'Konum kaydedildi',
          locationId: result.id
        });
      });
    });
  },

  /**
   * GET /api/driver/status
   * 
   * Returns current tracking status for the driver.
   * Used by the Android app to sync state.
   */
  getStatus(req, res) {
    const { authToken } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err) {
        console.error('[DriverAPI] Status check error:', err);
        return res.status(500).json({
          success: false,
          message: 'Sunucu hatası'
        });
      }

      if (!driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      DriverLocationModel.getDriverById(driver.id, (getErr, driverData) => {
        if (getErr) {
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        res.json({
          success: true,
          driverId: driver.id.toString(),
          driverName: driver.name,
          isTracking: driverData?.is_tracking === 1,
          lastLocationAt: driverData?.last_location_at
        });
      });
    });
  },

  /**
   * POST /api/driver/logout
   * 
   * Logs out the driver and sets is_tracking = 0
   */
  logout(req, res) {
    const { driverId, authToken } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    // Update is_tracking to 0
    DriverLocationModel.setDriverTracking(driverId, false, (err) => {
      if (err) {
        console.error('[DriverAPI] Logout error:', err);
        return res.status(500).json({
          success: false,
          message: 'Sunucu hatası'
        });
      }

      console.log(`[DriverAPI] Driver logged out: ID ${driverId}`);
      
      res.json({
        success: true,
        message: 'Çıkış yapıldı'
      });
    });
  },

  // ============================================
  // MESSAGING FUNCTIONS
  // ============================================

  /**
   * GET /api/driver/messages
   * 
   * Get messages for a driver.
   */
  getMessages(req, res) {
    const { driverId, authToken, since } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      // Get messages
      DriverMessageModel.getConversation(parseInt(driverId), 200, (msgErr, messages) => {
        if (msgErr) {
          console.error('[DriverAPI] Get messages error:', msgErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        // Filter by since if provided
        let filteredMessages = messages || [];
        if (since) {
          filteredMessages = filteredMessages.filter(m => new Date(m.created_at) > new Date(since));
        }

        res.json({
          success: true,
          messages: filteredMessages
        });
      });
    });
  },

  /**
   * POST /api/driver/messages
   * 
   * Send a message from driver to operator.
   */
  sendMessage(req, res) {
    const { driverId, authToken, message, image } = req.body;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    if (!message && !image) {
      return res.status(400).json({
        success: false,
        message: 'Mesaj veya resim gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      // Handle image if provided (base64)
      let imagePath = null;
      if (image) {
        try {
          const uploadDir = path.join(__dirname, '../../uploads/messages');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          const filename = `msg-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
          const filepath = path.join(uploadDir, filename);
          
          // Remove data URL prefix if present
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
          
          imagePath = `/uploads/messages/${filename}`;
        } catch (imgErr) {
          console.error('[DriverAPI] Image save error:', imgErr);
        }
      }

      const messageData = {
        driver_id: parseInt(driverId),
        sender_type: 'driver',
        sender_id: driver.id.toString(),
        sender_name: driver.name,
        message: message || null,
        image_path: imagePath
      };

      DriverMessageModel.sendMessage(messageData, (msgErr, result) => {
        if (msgErr) {
          console.error('[DriverAPI] Send message error:', msgErr);
          return res.status(500).json({
            success: false,
            message: 'Mesaj gönderilemedi'
          });
        }

        console.log(`[DriverAPI] Message sent from driver ${driver.name}`);

        // Emit socket event for real-time update to operator panel
        const io = req.app.get('io');
        console.log(`[DriverAPI] Socket.io available: ${!!io}`);
        if (io) {
          console.log(`[DriverAPI] Emitting driver_new_message to driver_messages_panel for driver ${driverId}`);
          // Notify driver messages panel (list view)
          io.to('driver_messages_panel').emit('driver_new_message', {
            driverId: parseInt(driverId),
            driverName: driver.name,
            message: result
          });
          
          // Notify specific chat room
          io.to(`driver_chat_${driverId}`).emit('driver_chat_message', result);
        }

        res.json({
          success: true,
          message: 'Mesaj gönderildi',
          data: result
        });
      });
    });
  },

  /**
   * POST /api/driver/messages/read
   * 
   * Mark messages as read by driver.
   */
  markMessagesRead(req, res) {
    const { driverId, authToken } = req.body;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      DriverMessageModel.markAsRead(parseInt(driverId), 'driver', (markErr, changes) => {
        if (markErr) {
          console.error('[DriverAPI] Mark read error:', markErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        res.json({
          success: true,
          message: 'Mesajlar okundu olarak işaretlendi',
          markedCount: changes
        });
      });
    });
  },

  /**
   * GET /api/driver/messages/unread
   * 
   * Get unread message count for a driver.
   */
  getUnreadCount(req, res) {
    const { driverId, authToken } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      DriverMessageModel.getUnreadCount(parseInt(driverId), 'driver', (countErr, count) => {
        if (countErr) {
          console.error('[DriverAPI] Unread count error:', countErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        res.json({
          success: true,
          unreadCount: count
        });
      });
    });
  },

  /**
   * GET /api/driver/active-position
   * 
   * Get the active position/load for the driver's truck.
   * Returns position details if found, or a message if no active position.
   */
  getActivePosition(req, res) {
    const { driverId, authToken } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Şoför ID gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      // Get active position for driver
      DriverLocationModel.getActivePosition(parseInt(driverId), (posErr, positionData) => {
        if (posErr) {
          console.error('[DriverAPI] Get active position error:', posErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        if (!positionData) {
          return res.json({
            success: true,
            hasPosition: false,
            message: 'Şoför bulunamadı'
          });
        }

        res.json({
          success: true,
          ...positionData
        });
      });
    });
  },

  /**
   * GET /api/driver/position-loads
   * 
   * Get all loads for a specific position.
   * Returns detailed load information for each load in the position.
   */
  getPositionLoads(req, res) {
    const { positionNo, authToken } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!positionNo) {
      return res.status(400).json({
        success: false,
        message: 'Pozisyon numarası gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      // Get all loads for position
      DriverLocationModel.getPositionLoads(positionNo, (loadsErr, loadsData) => {
        if (loadsErr) {
          console.error('[DriverAPI] Get position loads error:', loadsErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        res.json({
          success: true,
          ...loadsData
        });
      });
    });
  },

  /**
   * GET /api/driver/position-documents
   * 
   * Get documents for a specific position (Evraklar and T1/GMR).
   * Returns document list for viewing in the Android app.
   */
  getPositionDocuments(req, res) {
    const { positionNo, authToken } = req.query;

    if (!authToken) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme gerekli'
      });
    }

    if (!positionNo) {
      return res.status(400).json({
        success: false,
        message: 'Pozisyon numarası gerekli'
      });
    }

    // Validate auth token
    DriverLocationModel.validateAuthToken(authToken, (err, driver) => {
      if (err || !driver) {
        return res.status(401).json({
          success: false,
          message: 'Geçersiz token'
        });
      }

      // Get documents for position
      DriverLocationModel.getPositionDocuments(positionNo, (docsErr, docsData) => {
        if (docsErr) {
          console.error('[DriverAPI] Get position documents error:', docsErr);
          return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
          });
        }

        res.json({
          success: true,
          ...docsData
        });
      });
    });
  }
};

module.exports = driverApiController;
