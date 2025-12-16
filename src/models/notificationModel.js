/**
 * Notification Model
 * Handles database operations for the notification system
 */

const db = require('../config/db');

// Türkiye saati formatında tarih döndür
function getTurkeyDateTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).replace(' ', 'T');
}

const NotificationModel = {
  /**
   * Create a new notification
   * @param {Object} data - { username, type, title, message, link, data }
   */
  create(data, callback) {
    const sql = `
      INSERT INTO notifications (username, type, title, message, link, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `;
    const params = [
      data.username || null,
      data.type,
      data.title,
      data.message || null,
      data.link || null,
      data.data ? JSON.stringify(data.data) : null,
      getTurkeyDateTime()
    ];
    
    db.run(sql, params, function(err) {
      if (err) return callback(err);
      callback(null, { id: this.lastID });
    });
  },

  /**
   * Create notification for all users (broadcast)
   * @param {Object} data - { type, title, message, link, data }
   * @param {Array} excludeUsers - usernames to exclude
   */
  createForAll(data, excludeUsers = [], callback) {
    // Get all unique usernames from users table with their preferences
    const sql = `
      SELECT DISTINCT u.username, 
        COALESCE(np.new_position, 1) as new_position,
        COALESCE(np.position_completed, 1) as position_completed,
        COALESCE(np.position_deleted, 1) as position_deleted,
        COALESCE(np.documents_uploaded, 1) as documents_uploaded,
        COALESCE(np.expense_missing, 1) as expense_missing,
        COALESCE(np.chat_message, 1) as chat_message
      FROM users u
      LEFT JOIN notification_preferences np ON u.username = np.username
      WHERE u.username IS NOT NULL
    `;
    
    db.all(sql, [], (err, users) => {
      if (err) return callback(err);
      
      // Filter users based on their preferences for this notification type
      const prefKey = data.type.replace(/-/g, '_');
      const recipients = users
        .filter(u => !excludeUsers.includes(u.username))
        .filter(u => u[prefKey] !== 0) // Check if user wants this type of notification
        .map(u => u.username);
      
      if (recipients.length === 0) return callback(null, { count: 0 });
      
      const now = getTurkeyDateTime();
      const placeholders = recipients.map(() => '(?, ?, ?, ?, ?, ?, 0, ?)').join(', ');
      const params = [];
      recipients.forEach(username => {
        params.push(
          username,
          data.type,
          data.title,
          data.message || null,
          data.link || null,
          data.data ? JSON.stringify(data.data) : null,
          now
        );
      });
      
      const sql2 = `
        INSERT INTO notifications (username, type, title, message, link, data, is_read, created_at)
        VALUES ${placeholders}
      `;
      
      db.run(sql2, params, function(err2) {
        if (err2) return callback(err2);
        callback(null, { count: recipients.length });
      });
    });
  },

  /**
   * Get notifications for a user
   * @param {string} username
   * @param {Object} options - { limit, offset, unreadOnly }
   */
  getByUser(username, options = {}, callback) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const unreadFilter = options.unreadOnly ? 'AND is_read = 0' : '';
    
    const sql = `
      SELECT id, type, title, message, link, data, is_read, created_at, read_at
      FROM notifications
      WHERE username = ? ${unreadFilter}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    db.all(sql, [username, limit, offset], (err, rows) => {
      if (err) return callback(err);
      
      // Parse JSON data field
      const notifications = (rows || []).map(row => ({
        ...row,
        data: row.data ? JSON.parse(row.data) : null
      }));
      
      callback(null, notifications);
    });
  },

  /**
   * Get unread count for a user
   */
  getUnreadCount(username, callback) {
    const sql = 'SELECT COUNT(*) as count FROM notifications WHERE username = ? AND is_read = 0';
    db.get(sql, [username], (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.count : 0);
    });
  },

  /**
   * Mark notification as read
   */
  markAsRead(id, callback) {
    const sql = "UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ?";
    db.run(sql, [id], callback);
  },

  /**
   * Mark all notifications as read for a user
   */
  markAllAsRead(username, callback) {
    const sql = "UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE username = ? AND is_read = 0";
    db.run(sql, [username], function(err) {
      if (err) return callback(err);
      callback(null, { updated: this.changes });
    });
  },

  /**
   * Delete a notification
   */
  delete(id, callback) {
    db.run('DELETE FROM notifications WHERE id = ?', [id], callback);
  },

  /**
   * Delete old notifications (cleanup)
   * @param {number} daysOld - delete notifications older than this many days
   */
  deleteOld(daysOld = 30, callback) {
    const sql = `DELETE FROM notifications WHERE created_at < datetime('now', '-${daysOld} days')`;
    db.run(sql, [], function(err) {
      if (err) return callback(err);
      callback(null, { deleted: this.changes });
    });
  },

  // ========== PREFERENCES ==========

  /**
   * Get user preferences
   */
  getPreferences(username, callback) {
    const sql = 'SELECT * FROM notification_preferences WHERE username = ?';
    db.get(sql, [username], (err, row) => {
      if (err) return callback(err);
      
      // Return defaults if no preferences set
      if (!row) {
        return callback(null, {
          new_position: 1,
          position_completed: 1,
          position_deleted: 1,
          documents_uploaded: 1,
          expense_missing: 1,
          chat_message: 1,
          browser_push: 0
        });
      }
      
      callback(null, row);
    });
  },

  /**
   * Update user preferences
   */
  updatePreferences(username, prefs, callback) {
    const sql = `
      INSERT INTO notification_preferences (username, new_position, position_completed, position_deleted, documents_uploaded, expense_missing, chat_message, browser_push, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(username) DO UPDATE SET
        new_position = excluded.new_position,
        position_completed = excluded.position_completed,
        position_deleted = excluded.position_deleted,
        documents_uploaded = excluded.documents_uploaded,
        expense_missing = excluded.expense_missing,
        chat_message = excluded.chat_message,
        browser_push = excluded.browser_push,
        updated_at = datetime('now')
    `;
    
    const params = [
      username,
      prefs.new_position ? 1 : 0,
      prefs.position_completed ? 1 : 0,
      prefs.position_deleted ? 1 : 0,
      prefs.documents_uploaded ? 1 : 0,
      prefs.expense_missing ? 1 : 0,
      prefs.chat_message ? 1 : 0,
      prefs.browser_push ? 1 : 0
    ];
    
    db.run(sql, params, callback);
  }
};

module.exports = NotificationModel;
