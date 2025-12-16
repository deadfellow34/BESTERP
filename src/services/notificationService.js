/**
 * Notification Service
 * Handles creating and broadcasting notifications
 */

const NotificationModel = require('../models/notificationModel');
const db = require('../config/db');

// Türkiye saati formatında tarih döndür
function getTurkeyDateTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).replace(' ', 'T');
}

// Store socket.io instance for real-time notifications
let io = null;

// Notification types
const NOTIFICATION_TYPES = {
  NEW_POSITION: 'new_position',
  POSITION_COMPLETED: 'position_completed',
  POSITION_DELETED: 'position_deleted',
  DOCUMENTS_UPLOADED: 'documents_uploaded',
  EXPENSE_MISSING: 'expense_missing',
  CHAT_MESSAGE: 'chat_message',
  CHAT_MENTION: 'chat_mention',
  SYSTEM: 'system'
};

// Type icons for UI
const TYPE_ICONS = {
  new_position: 'fa-plus-circle',
  position_completed: 'fa-check-circle',
  position_deleted: 'fa-trash',
  documents_uploaded: 'fa-file-upload',
  expense_missing: 'fa-exclamation-triangle',
  chat_message: 'fa-comment',
  chat_mention: 'fa-at',
  system: 'fa-bell'
};

// Type colors for UI
const TYPE_COLORS = {
  new_position: '#3b82f6',    // blue
  position_completed: '#10b981', // green
  position_deleted: '#ef4444',  // red
  documents_uploaded: '#8b5cf6', // purple
  expense_missing: '#f59e0b',   // orange/yellow
  chat_message: '#f59e0b',     // yellow
  chat_mention: '#ec4899',     // pink
  system: '#6366f1'            // indigo
};

const NotificationService = {
  /**
   * Initialize with socket.io instance
   */
  init(socketIo) {
    io = socketIo;
    console.log('[NotificationService] Initialized with Socket.io');
  },

  /**
   * Get notification type metadata
   */
  getTypeMeta(type) {
    return {
      icon: TYPE_ICONS[type] || 'fa-bell',
      color: TYPE_COLORS[type] || '#6366f1'
    };
  },

  /**
   * Send notification to a specific user
   */
  async notify(username, type, title, message, link = null, data = null) {
    return new Promise((resolve, reject) => {
      // Check user preferences first
      NotificationModel.getPreferences(username, (err, prefs) => {
        if (err) {
          console.error('[NotificationService] Error getting preferences:', err);
          // Continue anyway with defaults
        }
        
        // Check if user wants this notification type
        const prefKey = type.replace('-', '_');
        if (prefs && prefs[prefKey] === 0) {
          return resolve({ skipped: true, reason: 'user_preference' });
        }
        
        // Create notification in database
        NotificationModel.create({
          username,
          type,
          title,
          message,
          link,
          data
        }, (err2, result) => {
          if (err2) {
            console.error('[NotificationService] Error creating notification:', err2);
            return reject(err2);
          }
          
          // Send real-time notification via socket
          if (io) {
            const notification = {
              id: result.id,
              type,
              title,
              message,
              link,
              data,
              meta: this.getTypeMeta(type),
              created_at: getTurkeyDateTime()
            };
            
            // Emit to specific user room
            io.to(`user:${username}`).emit('notification', notification);
            
            // Also update unread count
            NotificationModel.getUnreadCount(username, (err3, count) => {
              if (!err3) {
                io.to(`user:${username}`).emit('notificationCount', count);
              }
            });
          }
          
          resolve(result);
        });
      });
    });
  },

  /**
   * Broadcast notification to all users
   */
  async broadcast(type, title, message, link = null, data = null, excludeUsers = []) {
    console.log(`[NotificationService] broadcast called: type=${type}, excludeUsers=${excludeUsers.join(',')}`);
    return new Promise((resolve, reject) => {
      NotificationModel.createForAll({
        type,
        title,
        message,
        link,
        data
      }, excludeUsers, (err, result) => {
        if (err) {
          console.error('[NotificationService] Error broadcasting:', err);
          return reject(err);
        }
        
        console.log(`[NotificationService] Broadcast success: ${result.count} users notified`);
        
        // Emit to all connected users (except excluded)
        if (io) {
          const notification = {
            type,
            title,
            message,
            link,
            data,
            meta: this.getTypeMeta(type),
            created_at: getTurkeyDateTime()
          };
          
          // Broadcast to all
          io.emit('notification', notification);
          
          // Each client will fetch their own count
          io.emit('notificationCountRefresh');
        }
        
        resolve(result);
      });
    });
  },

  // ========== SPECIFIC NOTIFICATION HELPERS ==========

  /**
   * Notify when new position is created
   */
  async notifyNewPosition(positionNo, createdBy) {
    const title = 'Yeni Pozisyon Oluşturuldu';
    const message = `${positionNo} numaralı pozisyon oluşturuldu\n👤 Oluşturan: ${createdBy}`;
    const link = `/loads/position/${encodeURIComponent(positionNo)}`;
    
    // Broadcast to all except creator
    return this.broadcast(
      NOTIFICATION_TYPES.NEW_POSITION,
      title,
      message,
      link,
      { positionNo, createdBy },
      [createdBy]
    );
  },

  /**
   * Notify when position is marked as completed
   */
  async notifyPositionCompleted(positionNo, completedBy) {
    const title = 'Pozisyon Tamamlandı';
    const message = `${positionNo} numaralı pozisyon tamamlandı olarak işaretlendi\n👤 İşaretleyen: ${completedBy}`;
    const link = `/loads/position/${encodeURIComponent(positionNo)}`;
    
    return this.broadcast(
      NOTIFICATION_TYPES.POSITION_COMPLETED,
      title,
      message,
      link,
      { positionNo, completedBy },
      [completedBy]
    );
  },

  /**
   * Notify when position is deleted
   */
  async notifyPositionDeleted(positionNo, deletedBy, loadCount) {
    const title = '🗑️ Pozisyon Silindi';
    const message = `${positionNo} numaralı pozisyon silindi\n📦 Yük sayısı: ${loadCount}\n👤 Silen: ${deletedBy}`;
    
    return this.broadcast(
      NOTIFICATION_TYPES.POSITION_DELETED,
      title,
      message,
      null, // link yok çünkü pozisyon silindi
      { positionNo, deletedBy, loadCount },
      [deletedBy]
    );
  },

  /**
   * Notify when position is marked as expense missing
   */
  async notifyExpenseMissing(positionNo, markedBy) {
    const title = '⚠️ Masrafı Eksik Pozisyon';
    const message = `${positionNo} pozisyonu masrafı eksik olarak işaretlendi\n👤 İşaretleyen: ${markedBy}`;
    const link = `/loads/position/${encodeURIComponent(positionNo)}`;
    
    return this.broadcast(
      NOTIFICATION_TYPES.EXPENSE_MISSING,
      title,
      message,
      link,
      { positionNo, markedBy },
      [markedBy]
    );
  },

  /**
   * Notify when all documents are uploaded for accounting
   */
  async notifyDocumentsComplete(positionNo, uploadedBy, lastFile = null, folderName = null) {
    const title = 'Muhasebe Evrakları Tamamlandı!';
    let message = `${positionNo} pozisyonu için tüm evraklar yüklendi`;
    
    // Detaylı bilgi ekle
    if (uploadedBy) {
      message += `\n👤 Yükleyen: ${uploadedBy}`;
    }
    if (lastFile) {
      message += `\n📄 Son dosya: ${lastFile}`;
    }
    if (folderName) {
      message += `\n📁 Klasör: ${folderName}`;
    }
    
    const link = `/accounting?position=${encodeURIComponent(positionNo)}`;
    
    return this.broadcast(
      NOTIFICATION_TYPES.DOCUMENTS_UPLOADED,
      title,
      message,
      link,
      { positionNo, uploadedBy, lastFile, folderName },
      [uploadedBy]
    );
  },

  /**
   * Notify specific user of chat message
   * Consolidates messages from same sender within 5 minutes
   */
  async notifyChatMessage(toUsername, fromUsername, messagePreview) {
    return new Promise((resolve, reject) => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      // Check for existing unread notification from same sender in last 5 minutes
      const checkSql = `
        SELECT id, message, data FROM notifications 
        WHERE username = ? AND type = 'chat_message' AND is_read = 0 
        AND created_at > ? AND json_extract(data, '$.from') = ?
        ORDER BY created_at DESC LIMIT 1
      `;
      
      db.get(checkSql, [toUsername, fiveMinutesAgo, fromUsername], (err, existing) => {
        if (err) {
          console.error('[NotificationService] Error checking existing notification:', err);
          // Fall back to creating new notification
        }
        
        const truncatedMsg = messagePreview.length > 50 
          ? messagePreview.substring(0, 50) + '...' 
          : messagePreview;
        
        if (existing) {
          // Update existing notification - append new message
          let existingData = {};
          try {
            existingData = existing.data ? JSON.parse(existing.data) : {};
          } catch (e) {}
          
          const messages = existingData.messages || [existing.message];
          messages.push(truncatedMsg);
          
          // Keep only last 10 messages
          if (messages.length > 10) {
            messages.shift();
          }
          
          const newMessage = messages.join('\n• ');
          const messageCount = messages.length;
          const newTitle = `${fromUsername} size ${messageCount} mesaj gönderdi`;
          
          existingData.messages = messages;
          existingData.count = messageCount;
          
          const updateSql = `
            UPDATE notifications 
            SET title = ?, message = ?, data = ?, created_at = ?
            WHERE id = ?
          `;
          
          db.run(updateSql, [newTitle, '• ' + newMessage, JSON.stringify(existingData), getTurkeyDateTime(), existing.id], (updateErr) => {
            if (updateErr) {
              console.error('[NotificationService] Error updating notification:', updateErr);
              return reject(updateErr);
            }
            
            // Emit updated notification via socket
            if (io) {
              const notification = {
                id: existing.id,
                type: NOTIFICATION_TYPES.CHAT_MESSAGE,
                title: newTitle,
                message: '• ' + newMessage,
                data: existingData,
                meta: this.getTypeMeta(NOTIFICATION_TYPES.CHAT_MESSAGE),
                created_at: getTurkeyDateTime(),
                updated: true
              };
              io.to(`user:${toUsername}`).emit('notification', notification);
              io.to(`user:${toUsername}`).emit('notificationCountRefresh');
            }
            
            resolve({ id: existing.id, updated: true });
          });
        } else {
          // Create new notification
          const title = `${fromUsername} size mesaj gönderdi`;
          
          this.notify(
            toUsername,
            NOTIFICATION_TYPES.CHAT_MESSAGE,
            title,
            '• ' + truncatedMsg,
            null,
            { from: fromUsername, messages: [truncatedMsg], count: 1 }
          ).then(resolve).catch(reject);
        }
      });
    });
  },

  /**
   * Notify user when mentioned in chat with @username
   */
  async notifyChatMention(toUsername, fromUsername, messagePreview) {
    const truncatedMsg = messagePreview.length > 60 
      ? messagePreview.substring(0, 60) + '...' 
      : messagePreview;
    
    const title = `📢 ${fromUsername} sizi etiketledi`;
    
    return this.notify(
      toUsername,
      NOTIFICATION_TYPES.CHAT_MENTION,
      title,
      truncatedMsg,
      null,
      { from: fromUsername, mention: true }
    );
  }
};

module.exports = NotificationService;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
