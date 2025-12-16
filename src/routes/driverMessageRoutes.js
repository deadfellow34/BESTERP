/**
 * Driver Messages Routes
 * 
 * Web panel routes for driver-operator messaging.
 * Includes views and API endpoints for:
 * - Viewing all conversations
 * - Chat interface for each driver
 * - Sending messages
 * - Image uploads
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureAuth } = require('../middleware/authMiddleware');
const DriverMessageModel = require('../models/driverMessageModel');
const db = require('../config/db');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/messages');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'msg-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Sadece resim dosyaları yüklenebilir!'));
  }
});

/**
 * GET /driver-messages
 * 
 * Shows all driver conversations.
 */
router.get('/', ensureAuth, (req, res, next) => {
  DriverMessageModel.getAllConversations((err, conversations) => {
    if (err) {
      console.error('[DriverMessages] Error fetching conversations:', err);
      return next(err);
    }

    res.render('driver-messages/index', {
      title: 'Şoför Mesajları',
      conversations: conversations || [],
      currentUser: req.session.user
    });
  });
});

/**
 * GET /driver-messages/:driverId
 * 
 * Shows chat interface for a specific driver.
 */
router.get('/:driverId', ensureAuth, (req, res, next) => {
  const driverId = parseInt(req.params.driverId);

  if (isNaN(driverId)) {
    return res.status(400).send('Geçersiz şoför ID');
  }

  // Get driver info
  db.get('SELECT id, name, phone, is_tracking FROM drivers WHERE id = ?', [driverId], (driverErr, driver) => {
    if (driverErr) {
      console.error('[DriverMessages] Error fetching driver:', driverErr);
      return next(driverErr);
    }

    if (!driver) {
      return res.status(404).send('Şoför bulunamadı');
    }

    // Get conversation
    DriverMessageModel.getConversation(driverId, 200, (msgErr, messages) => {
      if (msgErr) {
        console.error('[DriverMessages] Error fetching messages:', msgErr);
        return next(msgErr);
      }

      // Mark messages from driver as read
      DriverMessageModel.markAsRead(driverId, 'operator', () => {});

      res.render('driver-messages/chat', {
        title: `${driver.name} - Mesajlar`,
        driver,
        messages: messages || [],
        currentUser: req.session.user
      });
    });
  });
});

/**
 * POST /driver-messages/:driverId/send
 * 
 * Send a message from operator to driver.
 */
router.post('/:driverId/send', ensureAuth, upload.single('image'), (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const { message } = req.body;
  const image_path = req.file ? `/uploads/messages/${req.file.filename}` : null;

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  if (!message && !image_path) {
    return res.status(400).json({ success: false, message: 'Mesaj veya resim gerekli' });
  }

  const messageData = {
    driver_id: driverId,
    sender_type: 'operator',
    sender_id: req.session.user?.username || 'operator',
    sender_name: req.session.user?.username || 'Operasyon',
    message: message || null,
    image_path
  };

  DriverMessageModel.sendMessage(messageData, (err, result) => {
    if (err) {
      console.error('[DriverMessages] Send error:', err);
      return res.status(500).json({ success: false, message: 'Mesaj gönderilemedi' });
    }

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      // Notify Android app (if connected via socket)
      io.to(`driver_${driverId}`).emit('new_message', result);
      
      // Notify driver messages panel (list view) - for badge updates
      io.to('driver_messages_panel').emit('operator_sent_message', {
        driverId: driverId,
        message: result
      });
      
      // Notify specific chat room (other operators viewing same chat)
      io.to(`driver_chat_${driverId}`).emit('operator_chat_message', result);
    }

    console.log(`[DriverMessages] Message sent to driver ${driverId} by ${messageData.sender_name}`);
    res.json({ success: true, message: 'Mesaj gönderildi', data: result });
  });
});

/**
 * GET /driver-messages/api/conversations
 * 
 * API endpoint for getting all conversations with unread counts.
 */
router.get('/api/conversations', ensureAuth, (req, res) => {
  DriverMessageModel.getAllConversations((err, conversations) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
    }

    res.json({
      success: true,
      conversations: conversations || []
    });
  });
});

/**
 * GET /driver-messages/api/:driverId/messages
 * 
 * API endpoint for getting messages (for AJAX polling or socket fallback).
 */
router.get('/api/:driverId/messages', ensureAuth, (req, res) => {
  const driverId = parseInt(req.params.driverId);
  const since = req.query.since; // Optional: only get messages after this timestamp

  if (isNaN(driverId)) {
    return res.status(400).json({ success: false, message: 'Geçersiz şoför ID' });
  }

  DriverMessageModel.getConversation(driverId, 200, (err, messages) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Sunucu hatası' });
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

module.exports = router;
