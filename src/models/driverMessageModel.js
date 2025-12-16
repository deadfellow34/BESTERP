/**
 * Driver Message Model
 * 
 * Handles messaging between drivers (Android app) and operators (web panel).
 * 
 * Features:
 * - Send messages from operator to driver
 * - Send messages from driver to operator
 * - Attach images (delivery photos, documents)
 * - Mark messages as read
 * - Get conversation history
 */

const db = require('../config/db');

const DriverMessageModel = {
  /**
   * Send a message
   * @param {Object} messageData - { driver_id, sender_type, sender_id, sender_name, message, image_path }
   * @param {Function} callback - (err, result)
   */
  sendMessage(messageData, callback) {
    const { driver_id, sender_type, sender_id, sender_name, message, image_path } = messageData;
    
    const sql = `
      INSERT INTO driver_messages (driver_id, sender_type, sender_id, sender_name, message, image_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [driver_id, sender_type, sender_id, sender_name, message, image_path], function(err) {
      if (err) return callback(err);
      
      callback(null, {
        id: this.lastID,
        driver_id,
        sender_type,
        sender_name,
        message,
        image_path,
        created_at: new Date().toISOString()
      });
    });
  },

  /**
   * Get conversation for a specific driver
   * @param {number} driverId - Driver ID
   * @param {number} limit - Max messages to return
   * @param {Function} callback - (err, messages)
   */
  getConversation(driverId, limit = 100, callback) {
    const sql = `
      SELECT 
        id,
        driver_id,
        sender_type,
        sender_id,
        sender_name,
        message,
        image_path,
        is_read,
        created_at
      FROM driver_messages
      WHERE driver_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    
    db.all(sql, [driverId, limit], (err, messages) => {
      if (err) return callback(err);
      // Return in chronological order (oldest first)
      callback(null, (messages || []).reverse());
    });
  },

  /**
   * Get unread message count for a driver
   * @param {number} driverId - Driver ID
   * @param {string} forType - 'driver' or 'operator'
   * @param {Function} callback - (err, count)
   */
  getUnreadCount(driverId, forType, callback) {
    // If forType is 'driver', count unread messages FROM operator
    // If forType is 'operator', count unread messages FROM driver
    const senderType = forType === 'driver' ? 'operator' : 'driver';
    
    const sql = `
      SELECT COUNT(*) as count
      FROM driver_messages
      WHERE driver_id = ? AND sender_type = ? AND is_read = 0
    `;
    
    db.get(sql, [driverId, senderType], (err, row) => {
      if (err) return callback(err);
      callback(null, row?.count || 0);
    });
  },

  /**
   * Mark messages as read
   * @param {number} driverId - Driver ID
   * @param {string} readerType - 'driver' or 'operator'
   * @param {Function} callback - (err)
   */
  markAsRead(driverId, readerType, callback) {
    // Mark messages from the OTHER side as read
    const senderType = readerType === 'driver' ? 'operator' : 'driver';
    
    const sql = `
      UPDATE driver_messages
      SET is_read = 1
      WHERE driver_id = ? AND sender_type = ? AND is_read = 0
    `;
    
    db.run(sql, [driverId, senderType], callback);
  },

  /**
   * Get all drivers with their last message and unread count
   * @param {Function} callback - (err, conversations)
   */
  getAllConversations(callback) {
    const sql = `
      SELECT 
        d.id as driver_id,
        d.name as driver_name,
        d.phone,
        d.is_tracking,
        (
          SELECT message FROM driver_messages dm 
          WHERE dm.driver_id = d.id 
          ORDER BY dm.created_at DESC LIMIT 1
        ) as last_message,
        (
          SELECT created_at FROM driver_messages dm 
          WHERE dm.driver_id = d.id 
          ORDER BY dm.created_at DESC LIMIT 1
        ) as last_message_at,
        (
          SELECT sender_type FROM driver_messages dm 
          WHERE dm.driver_id = d.id 
          ORDER BY dm.created_at DESC LIMIT 1
        ) as last_sender_type,
        (
          SELECT COUNT(*) FROM driver_messages dm 
          WHERE dm.driver_id = d.id AND dm.sender_type = 'driver' AND dm.is_read = 0
        ) as unread_count,
        (
          SELECT COUNT(*) FROM driver_messages dm 
          WHERE dm.driver_id = d.id
        ) as total_messages
      FROM drivers d
      WHERE d.pin IS NOT NULL
      ORDER BY last_message_at DESC NULLS LAST, d.name
    `;
    
    db.all(sql, [], callback);
  },

  /**
   * Get message by ID
   * @param {number} messageId - Message ID
   * @param {Function} callback - (err, message)
   */
  getMessageById(messageId, callback) {
    const sql = `SELECT * FROM driver_messages WHERE id = ?`;
    db.get(sql, [messageId], callback);
  },

  /**
   * Delete a message
   * @param {number} messageId - Message ID
   * @param {Function} callback - (err)
   */
  deleteMessage(messageId, callback) {
    const sql = `DELETE FROM driver_messages WHERE id = ?`;
    db.run(sql, [messageId], callback);
  },

  /**
   * Get recent messages for dashboard/notification
   * @param {number} limit - Max messages
   * @param {Function} callback - (err, messages)
   */
  getRecentMessages(limit = 10, callback) {
    const sql = `
      SELECT 
        dm.*,
        d.name as driver_name
      FROM driver_messages dm
      JOIN drivers d ON dm.driver_id = d.id
      ORDER BY dm.created_at DESC
      LIMIT ?
    `;
    
    db.all(sql, [limit], callback);
  }
};

module.exports = DriverMessageModel;
