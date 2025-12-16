/**
 * Notification Routes
 * API endpoints for notification system
 */

const express = require('express');
const router = express.Router();
const NotificationModel = require('../models/notificationModel');
const NotificationService = require('../services/notificationService');
const AdminNotificationModel = require('../models/adminNotificationModel');
const { ensureAuth } = require('../middleware/authMiddleware');
const db = require('../config/db');

// All routes require authentication
router.use(ensureAuth);

/**
 * GET /notifications
 * Get user's notifications
 */
router.get('/', (req, res) => {
  const username = req.session.user.username;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const unreadOnly = req.query.unread === 'true';
  
  NotificationModel.getByUser(username, { limit, offset, unreadOnly }, (err, notifications) => {
    if (err) {
      console.error('[Notifications] Error fetching:', err);
      return res.status(500).json({ success: false, error: 'Bildirimler yüklenemedi' });
    }
    
    // Add metadata to each notification
    const enriched = notifications.map(n => ({
      ...n,
      meta: NotificationService.getTypeMeta(n.type)
    }));
    
    res.json({ success: true, notifications: enriched });
  });
});
 
/**
 * GET /notifications/admin-broadcasts
 * Fetch recent admin broadcast notifications for offline users
 */
router.get('/admin-broadcasts', (req, res) => {
  const requestedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 40)
    : 10;

  AdminNotificationModel.getRecent(limit, (err, notifications) => {
    if (err) {
      console.error('[AdminBroadcast] Error fetching broadcasts:', err);
      return res.status(500).json({ success: false, error: 'Bildirimler yüklenemedi' });
    }

    // Normalize field names to match socket.io payload format
    const normalized = (notifications || []).map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      position_code: n.position_code,
      notification_type: n.notification_type,
      image_path: n.image_path,
      created_by: n.created_by_username,
      created_at: n.created_at
    }));

    res.json({ success: true, notifications: normalized });
  });
});

/**
 * GET /notifications/count
 * Get unread notification count
 */
router.get('/count', (req, res) => {
  const username = req.session.user.username;
  
  NotificationModel.getUnreadCount(username, (err, count) => {
    if (err) {
      console.error('[Notifications] Error getting count:', err);
      return res.status(500).json({ success: false, error: 'Sayı alınamadı' });
    }
    
    res.json({ success: true, count });
  });
});

/**
 * POST /notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', (req, res) => {
  const id = req.params.id;
  
  NotificationModel.markAsRead(id, (err) => {
    if (err) {
      console.error('[Notifications] Error marking read:', err);
      return res.status(500).json({ success: false, error: 'İşaretlenemedi' });
    }
    
    res.json({ success: true });
  });
});

/**
 * POST /notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', (req, res) => {
  const username = req.session.user.username;
  
  NotificationModel.markAllAsRead(username, (err, result) => {
    if (err) {
      console.error('[Notifications] Error marking all read:', err);
      return res.status(500).json({ success: false, error: 'İşaretlenemedi' });
    }
    
    res.json({ success: true, updated: result.updated });
  });
});

/**
 * DELETE /notifications/clear-all
 * Clear all notifications for current user
 */
router.delete('/clear-all', (req, res) => {
  const username = req.session.user.username;
  
  db.run('DELETE FROM notifications WHERE username = ?', [username], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  
  NotificationModel.delete(id, (err) => {
    if (err) {
      console.error('[Notifications] Error deleting:', err);
      return res.status(500).json({ success: false, error: 'Silinemedi' });
    }
    
    res.json({ success: true });
  });
});

/**
 * GET /notifications/preferences
 * Get user notification preferences
 */
router.get('/preferences', (req, res) => {
  const username = req.session.user.username;
  
  NotificationModel.getPreferences(username, (err, prefs) => {
    if (err) {
      console.error('[Notifications] Error getting preferences:', err);
      return res.status(500).json({ success: false, error: 'Tercihler yüklenemedi' });
    }
    
    res.json({ success: true, preferences: prefs });
  });
});

/**
 * POST /notifications/preferences
 * Update user notification preferences
 */
router.post('/preferences', (req, res) => {
  const username = req.session.user.username;
  const prefs = req.body;
  
  NotificationModel.updatePreferences(username, prefs, (err) => {
    if (err) {
      console.error('[Notifications] Error updating preferences:', err);
      return res.status(500).json({ success: false, error: 'Tercihler kaydedilemedi' });
    }
    
    res.json({ success: true });
  });
});

/**
 * POST /notifications/test
 * Create a test notification (for debugging)
 */
router.post('/test', (req, res) => {
  const username = req.session.user.username;
  const now = new Date().toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' });
  
  NotificationModel.create({
    username,
    type: 'system',
    title: 'Test Bildirimi',
    message: 'Bu bir test bildirimidir - ' + now,
    link: '/loads'
  }, (err, result) => {
    if (err) {
      console.error('[Notifications] Test create error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    console.log('[Notifications] Test notification created:', result);
    res.json({ success: true, id: result.id });
  });
});

module.exports = router;
