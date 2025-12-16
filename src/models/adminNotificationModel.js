/**
 * Admin Notifications Model
 * Stores broadcast notifications sent by admins
 */
const db = require('../config/db');

// Ensure table exists
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      message TEXT NOT NULL,
      position_code TEXT,
      notification_type TEXT DEFAULT 'info',
      image_path TEXT,
      created_by_user_id INTEGER,
      created_by_username TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
  
  // Create index for faster queries
  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at ON admin_notifications(created_at DESC)').run();
  } catch (e) {}
} catch (err) {
  console.error('[AdminNotificationModel] Table creation error:', err.message);
}

const AdminNotificationModel = {
  /**
   * Get all notifications with pagination
   */
  getAll(limit = 50, offset = 0, callback) {
    const sql = `
      SELECT id, title, message, position_code, notification_type, image_path, created_by_username, created_at
      FROM admin_notifications
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [limit, offset], callback);
  },

  /**
   * Get recent notifications (for admin panel display)
   */
  getRecent(limit = 20, callback) {
    const sql = `
      SELECT id, title, message, position_code, notification_type, image_path, created_by_username, created_at
      FROM admin_notifications
      ORDER BY created_at DESC
      LIMIT ?
    `;
    db.all(sql, [limit], callback);
  },

  /**
   * Create a new notification
   */
  create(data, callback) {
    const sql = `
      INSERT INTO admin_notifications (title, message, position_code, notification_type, image_path, created_by_user_id, created_by_username)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.title || null,
        data.message,
        data.position_code || null,
        data.notification_type || 'info',
        data.image_path || null,
        data.created_by_user_id || null,
        data.created_by_username || null
      ],
      function(err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      }
    );
  },

  /**
   * Get notification by ID
   */
  getById(id, callback) {
    const sql = `
      SELECT id, title, message, position_code, notification_type, created_by_username, created_at
      FROM admin_notifications
      WHERE id = ?
    `;
    db.get(sql, [id], callback);
  },

  /**
   * Delete notification by ID
   */
  delete(id, callback) {
    const sql = `DELETE FROM admin_notifications WHERE id = ?`;
    db.run(sql, [id], callback);
  },

  /**
   * Get notification count
   */
  getCount(callback) {
    const sql = `SELECT COUNT(*) as count FROM admin_notifications`;
    db.get(sql, [], (err, row) => {
      if (err) return callback(err);
      callback(null, row ? row.count : 0);
    });
  }
};

module.exports = AdminNotificationModel;
