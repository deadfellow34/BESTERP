/**
 * Admin Panel Controller
 * Handles admin panel authentication, notification broadcasting,
 * system dashboard, user management, and settings
 */
const AdminNotificationModel = require('../models/adminNotificationModel');
const LoadModel = require('../models/loadModel');
const db = require('../config/db');
const bcrypt = require('bcrypt');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Helper: Get Turkey datetime
function getTurkeyDateTime() {
  const now = new Date();
  const options = { timeZone: 'Europe/Istanbul' };
  return now.toLocaleString('sv-SE', options).replace(' ', 'T');
}

// Helper: Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper: Format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}g ${hours}s ${minutes}d`;
  if (hours > 0) return `${hours}s ${minutes}d`;
  return `${minutes}d`;
}

const AdminController = {
  /**
   * GET /admin/login - Show admin panel PIN form
   */
  showPinLogin(req, res) {
    // If already verified, redirect to admin panel
    if (req.session.isAdminPanelVerified) {
      return res.redirect('/admin');
    }
    res.render('admin/pin-login', { 
      pageTitle: 'Admin Panel - Giriş',
      error: null 
    });
  },

  /**
   * POST /admin/login - Verify admin panel PIN
   */
  verifyPin(req, res) {
    const { pin } = req.body;
    const adminPin = process.env.ADMIN_PANEL_PIN || '1234'; // Default for dev

    if (pin === adminPin) {
      req.session.isAdminPanelVerified = true;
      return res.redirect('/admin');
    }

    res.render('admin/pin-login', {
      pageTitle: 'Admin Panel - Giriş',
      error: 'Yanlış PIN. Lütfen tekrar deneyin.'
    });
  },

  /**
   * POST /admin/logout - Clear admin panel verification
   */
  logoutPanel(req, res) {
    req.session.isAdminPanelVerified = false;
    res.redirect('/loads');
  },

  /**
   * GET /admin - Main admin panel page with dashboard
   */
  showPanel(req, res, next) {
    try {
      // Get system stats
      const systemStats = {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        usedMemory: formatBytes(os.totalmem() - os.freemem()),
        memoryUsage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
        cpuCount: os.cpus().length,
        uptime: formatUptime(os.uptime()),
        nodeVersion: process.version,
        processUptime: formatUptime(process.uptime())
      };

      // Get database stats
      const dbStats = {
        todayPositions: 0,
        totalPositions: 0,
        totalUsers: 0
      };

      // Today's positions
      const today = new Date().toISOString().split('T')[0];
      const todayResult = db.prepare(`SELECT COUNT(*) as count FROM loads WHERE date(created_at) = ?`).get(today);
      dbStats.todayPositions = todayResult?.count || 0;

      // Total positions
      const totalResult = db.prepare(`SELECT COUNT(DISTINCT position_no) as count FROM loads`).get();
      dbStats.totalPositions = totalResult?.count || 0;

      // Total users
      const usersResult = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
      dbStats.totalUsers = usersResult?.count || 0;

      // Deleted positions history
      const formatToTurkey = (value) => {
        if (!value) return '—';
        const candidate = String(value).trim();
        const normalized = candidate.includes('T') ? candidate : `${candidate.replace(' ', 'T')}Z`;
        const date = new Date(normalized);
        if (isNaN(date.getTime())) return candidate;
        return date.toLocaleString('tr-TR', {
          timeZone: 'Europe/Istanbul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      };
      let deletedPositions = [];
      try {
        const rows = db.prepare(`
          SELECT entity_id_text as position_no, action, username, created_at
          FROM logs
          WHERE entity = 'position' AND action LIKE '%Silindi%'
          ORDER BY datetime(created_at) DESC
        `).all();
        deletedPositions = (rows || []).map(row => ({
          position_no: row.position_no || '—',
          action: row.action || 'Silindi',
          deleted_by: row.username || 'Sistem',
          deleted_at: formatToTurkey(row.created_at)
        }));
      } catch (e) {
        console.error('[Admin] Deleted positions load error:', e);
      }

      // Get all users for user management (only use columns that definitely exist)
      const users = db.prepare(`SELECT id, username, role, is_active, last_login FROM users ORDER BY username`).all();

      // Get recent notifications
      AdminNotificationModel.getRecent(20, (err, notifications) => {
        if (err) return next(err);

        // Get recent positions for dropdown
        LoadModel.getRecentPositions(50, (posErr, positions) => {
          
          // Get recent activity logs
          let recentLogs = [];
          try {
            recentLogs = db.prepare(`
              SELECT * FROM logs 
              ORDER BY timestamp DESC 
              LIMIT 50
            `).all();
          } catch (e) {
            // logs table might not exist
          }

          // Check maintenance mode
          const maintenanceMode = req.app.get('maintenanceMode') || false;

          // Get online users from socket
          const io = req.app.get('io');
          let onlineUsers = [];
          if (io && io.sockets) {
            // This will be updated via socket event
          }

          res.render('admin/panel', {
            pageTitle: 'Admin Panel',
            notifications: notifications || [],
            positions: positions || [],
            users: users || [],
            systemStats,
            dbStats,
            recentLogs,
            deletedPositions,
            maintenanceMode,
            success: req.query.success || null,
            error: req.query.error || null,
            activeTab: req.query.tab || 'dashboard'
          });
        });
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/notifications/broadcast - Send broadcast notification
   */
  broadcastNotification(req, res, next) {
    const { title, message, position_code, notification_type } = req.body;

    // Debug: Log file upload info
    if (req.file) {
      console.log('[Admin] File uploaded:', req.file.filename, 'Path:', req.file.path);
    } else {
      console.log('[Admin] No file uploaded');
    }

    if (!message || message.trim() === '') {
      return res.redirect('/admin?error=' + encodeURIComponent('Mesaj boş olamaz'));
    }

    const user = req.session.user;
    const notificationData = {
      title: title ? title.trim() : null,
      message: message.trim(),
      position_code: position_code ? position_code.trim() : null,
      notification_type: notification_type || 'info',
      created_by_user_id: user.id || null,
      created_by_username: user.username,
      image_path: req.file ? `/uploads/notifications/${req.file.filename}` : null
    };

    // Save to database
    AdminNotificationModel.create(notificationData, (err, notificationId) => {
      if (err) {
        console.error('[Admin] Notification save error:', err);
        return res.redirect('/admin?error=' + encodeURIComponent('Bildirim kaydedilemedi'));
      }

      // Emit to all connected clients via Socket.io
      const io = req.app.get('io');
      if (io) {
        const payload = {
          id: notificationId,
          title: notificationData.title,
          message: notificationData.message,
          position_code: notificationData.position_code,
          notification_type: notificationData.notification_type,
          image_path: notificationData.image_path,
          created_by: notificationData.created_by_username,
          created_at: getTurkeyDateTime()
        };

        io.emit('admin_notification', payload);
        console.log('[Admin] Broadcast sent:', payload.title || 'No title', '- to all connected clients');
      }

      res.redirect('/admin?success=' + encodeURIComponent('Bildirim başarıyla gönderildi'));
    });
  },

  /**
   * POST /admin/notifications/reminder - Send position reminder
   */
  sendReminder(req, res, next) {
    const { position_code } = req.body;

    if (!position_code || position_code.trim() === '') {
      return res.redirect('/admin?error=' + encodeURIComponent('Pozisyon seçilmedi'));
    }

    const user = req.session.user;
    const posCode = position_code.trim();
    
    const notificationData = {
      title: '📋 Pozisyon Kontrolü',
      message: `Lütfen ${posCode} pozisyonunu kontrol edin.`,
      position_code: posCode,
      notification_type: 'reminder',
      created_by_user_id: user.id || null,
      created_by_username: user.username
    };

    // Save to database
    AdminNotificationModel.create(notificationData, (err, notificationId) => {
      if (err) {
        console.error('[Admin] Reminder save error:', err);
        return res.redirect('/admin?error=' + encodeURIComponent('Hatırlatma kaydedilemedi'));
      }

      // Emit to all connected clients via Socket.io
      const io = req.app.get('io');
      if (io) {
        const payload = {
          id: notificationId,
          title: notificationData.title,
          message: notificationData.message,
          position_code: notificationData.position_code,
          notification_type: notificationData.notification_type,
          created_by: notificationData.created_by_username,
          created_at: getTurkeyDateTime()
        };

        io.emit('admin_notification', payload);
        console.log('[Admin] Reminder sent for position:', posCode);
      }

      res.redirect('/admin?success=' + encodeURIComponent('Hatırlatma gönderildi: ' + posCode));
    });
  },

  /**
   * DELETE /admin/notifications/:id - Delete a notification
   */
  deleteNotification(req, res, next) {
    const { id } = req.params;

    AdminNotificationModel.delete(id, (err) => {
      if (err) {
        console.error('[Admin] Notification delete error:', err);
        return res.redirect('/admin?error=' + encodeURIComponent('Bildirim silinemedi'));
      }

      res.redirect('/admin?success=' + encodeURIComponent('Bildirim silindi'));
    });
  },

  // ============ USER MANAGEMENT ============

  /**
   * GET /admin/users - Get all users (API)
   */
  getUsers(req, res) {
    try {
      const users = db.prepare(`
        SELECT id, username, role, is_active, last_login 
        FROM users 
        ORDER BY username
      `).all();
      res.json({ success: true, users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * POST /admin/users - Create new user
   */
  async createUser(req, res) {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre gerekli' });
    }

    try {
      // Check if user exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return res.status(400).json({ success: false, error: 'Bu kullanıcı adı zaten mevcut' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = db.prepare(`
        INSERT INTO users (username, password, role, is_active) 
        VALUES (?, ?, ?, 1)
      `).run(username, hashedPassword, role || 'user');

      console.log('[Admin] User created:', username, 'by', req.session.user.username);
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * PUT /admin/users/:id - Update user
   */
  async updateUser(req, res) {
    const { id } = req.params;
    const { username, password, role, is_active } = req.body;
    
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
      }

      // Build update query
      let updates = [];
      let params = [];

      if (username && username !== user.username) {
        updates.push('username = ?');
        params.push(username);
      }
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push('password = ?');
        params.push(hashedPassword);
      }
      if (role) {
        updates.push('role = ?');
        params.push(role);
      }
      if (typeof is_active !== 'undefined') {
        updates.push('is_active = ?');
        params.push(is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.json({ success: true, message: 'Değişiklik yok' });
      }

      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      console.log('[Admin] User updated:', id, 'by', req.session.user.username);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * DELETE /admin/users/:id - Delete user
   */
  deleteUser(req, res) {
    const { id } = req.params;
    
    try {
      // Don't allow deleting self
      if (parseInt(id) === req.session.user.id) {
        return res.status(400).json({ success: false, error: 'Kendinizi silemezsiniz' });
      }

      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
      }

      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      console.log('[Admin] User deleted:', user.username, 'by', req.session.user.username);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * POST /admin/users/:id/reset-password - Reset user password
   */
  async resetPassword(req, res) {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'Şifre en az 4 karakter olmalı' });
    }

    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id);

      // Invalidate all sessions for this user (force logout)
      const sessionStore = req.app.get('sessionStore');
      if (sessionStore && sessionStore.destroyByUserId) {
        sessionStore.destroyByUserId(parseInt(id), (err, count) => {
          if (err) console.error('[Admin] Session destroy error:', err);
        });
      }

      console.log('[Admin] Password reset for:', user.username, 'by', req.session.user.username);
      res.json({ success: true, message: 'Şifre sıfırlandı' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * POST /admin/users/:id/toggle-active - Toggle user active status
   */
  toggleUserActive(req, res) {
    const { id } = req.params;
    
    try {
      if (parseInt(id) === req.session.user.id) {
        return res.status(400).json({ success: false, error: 'Kendinizi deaktif edemezsiniz' });
      }

      const user = db.prepare('SELECT username, is_active FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
      }

      const newStatus = user.is_active ? 0 : 1;
      db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

      // If user is being deactivated, invalidate all their sessions (force logout)
      if (newStatus === 0) {
        const sessionStore = req.app.get('sessionStore');
        if (sessionStore && sessionStore.destroyByUserId) {
          sessionStore.destroyByUserId(parseInt(id), (err, count) => {
            if (err) console.error('[Admin] Session destroy error:', err);
          });
        }
      }

      console.log('[Admin] User', user.username, newStatus ? 'activated' : 'deactivated', 'by', req.session.user.username);
      res.json({ success: true, is_active: newStatus });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * POST /admin/users/:id/force-logout - Force logout a user
   */
  forceLogout(req, res) {
    const { id } = req.params;
    
    try {
      if (parseInt(id) === req.session.user.id) {
        return res.status(400).json({ success: false, error: 'Kendinizi logout edemezsiniz' });
      }

      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
      }

      // Invalidate all sessions for this user
      const sessionStore = req.app.get('sessionStore');
      if (sessionStore && sessionStore.destroyByUserId) {
        sessionStore.destroyByUserId(parseInt(id), (err, count) => {
          if (err) {
            console.error('[Admin] Session destroy error:', err);
            return res.status(500).json({ success: false, error: 'Oturum sonlandırılamadı' });
          }
          console.log('[Admin] Force logout for:', user.username, 'by', req.session.user.username, '- destroyed', count, 'session(s)');
          res.json({ success: true, message: `${user.username} oturumu sonlandırıldı`, destroyed: count });
        });
      } else {
        res.status(500).json({ success: false, error: 'Session store bulunamadı' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  // ============ SYSTEM SETTINGS ============

  /**
   * POST /admin/settings/maintenance - Toggle maintenance mode
   */
  toggleMaintenance(req, res) {
    const currentMode = req.app.get('maintenanceMode') || false;
    const newMode = !currentMode;
    req.app.set('maintenanceMode', newMode);

    // Notify all users via socket - maintenance mode and admin notification
    const io = req.app.get('io');
    if (io) {
      io.emit('maintenance_mode', { enabled: newMode });
      
      // Also send as admin notification so users see it
      const notificationData = {
        title: newMode ? '⚠️ Bakım Modu Açıldı' : '✅ Bakım Modu Kapatıldı',
        message: newMode 
          ? 'Sistem bakım moduna alındı. Bazı işlevler geçici olarak devre dışı olabilir.' 
          : 'Sistem normal çalışma moduna döndü.',
        type: newMode ? 'warning' : 'success',
        timestamp: new Date().toISOString(),
        from: 'system'
      };
      io.emit('admin_notification', notificationData);
    }

    console.log('[Admin] Maintenance mode:', newMode ? 'ENABLED' : 'DISABLED', 'by', req.session.user.username);
    res.json({ success: true, maintenanceMode: newMode });
  },

  /**
   * POST /admin/settings/backup - Create manual database backup
   */
  createBackup(req, res) {
    try {
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
      const backupPath = path.join(backupDir, `bestfreight.db.manual_${timestamp}`);
      
      // Use better-sqlite3's backup
      db.backup(backupPath);

      console.log('[Admin] Manual backup created:', backupPath, 'by', req.session.user.username);
      res.json({ success: true, path: backupPath, message: 'Yedek oluşturuldu' });
    } catch (err) {
      console.error('[Admin] Backup error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * GET /admin/logs - Get activity logs (API)
   */
  getLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const username = req.query.username;

      let sql = 'SELECT * FROM logs';
      let params = [];

      if (username) {
        sql += ' WHERE username = ?';
        params.push(username);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const logs = db.prepare(sql).all(...params);
      const total = db.prepare('SELECT COUNT(*) as count FROM logs').get();

      res.json({ success: true, logs, total: total?.count || 0 });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * GET /admin/stats - Get real-time stats (API for dashboard refresh)
   */
  getStats(req, res) {
    try {
      const systemStats = {
        freeMemory: formatBytes(os.freemem()),
        usedMemory: formatBytes(os.totalmem() - os.freemem()),
        memoryUsage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
        processUptime: formatUptime(process.uptime())
      };

      const today = new Date().toISOString().split('T')[0];
      const dbStats = {
        todayPositions: db.prepare(`SELECT COUNT(*) as count FROM loads WHERE date(created_at) = ?`).get(today)?.count || 0,
        totalPositions: db.prepare(`SELECT COUNT(*) as count FROM loads`).get()?.count || 0
      };

      res.json({ success: true, systemStats, dbStats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * GET /admin/today-positions - Get recent positions list (covers all entries)
   */
  getTodayPositions(req, res) {
    const formatIstanbulTime = (value) => {
      if (!value) return null;
      const sanitized = String(value).trim().replace(' ', 'T');
      const isoString = sanitized.endsWith('Z') ? sanitized : `${sanitized}Z`;
      try {
        return new Date(isoString).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Istanbul'
        });
      } catch {
        return null;
      }
    };

    const formatIstanbulDate = (value) => {
      if (!value) return null;
      const sanitized = String(value).trim().replace(' ', 'T');
      const isoString = sanitized.endsWith('Z') ? sanitized : `${sanitized}Z`;
      try {
        return new Date(isoString).toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Europe/Istanbul'
        });
      } catch {
        return null;
      }
    };

    try {
      const positions = db.prepare(`
        SELECT id,
               position_no,
               customer_name AS sender,
               consignee_name AS receiver,
               loading_address AS loading_point,
               unloading_address AS unloading_point,
               trailer_plate,
               truck_plate,
               driver_name,
               status,
               created_at,
               created_by
        FROM loads
        ORDER BY created_at DESC
      `).all();

      const groupedMeta = new Map();

      const getTime = (value) => {
        const date = value ? new Date(value) : null;
        return date && !isNaN(date.getTime()) ? date.getTime() : 0;
      };

      const shouldReplace = (existing, candidate) => {
        if (!existing) return true;
        if (!existing.truck_plate && candidate.truck_plate) return true;
        if (!existing.trailer_plate && candidate.trailer_plate) return true;
        if (!existing.driver_name && candidate.driver_name) return true;
        const existingTime = getTime(existing.created_at);
        const candidateTime = getTime(candidate.created_at);
        return candidateTime > existingTime;
      };

      for (const position of positions) {
        const key = position.position_no || position.id;
        const meta = groupedMeta.get(key) || {
          position: null,
          senders: new Set(),
          receivers: new Set(),
          count: 0
        };

        meta.count += 1;
        if (position.sender) meta.senders.add(position.sender.trim());
        if (position.receiver) meta.receivers.add(position.receiver.trim());

        if (shouldReplace(meta.position, position)) {
          meta.position = position;
        }

        groupedMeta.set(key, meta);
      }

      const normalized = Array.from(groupedMeta.values())
        .map((meta) => ({
          ...meta.position,
          senders: Array.from(meta.senders).filter(Boolean),
          receivers: Array.from(meta.receivers).filter(Boolean),
          isGrouped: meta.count > 1
        }))
        .filter(p => p && p.position_no)
        .map((p) => ({
          ...p,
          display_time: formatIstanbulTime(p.created_at),
          display_date: formatIstanbulDate(p.created_at)
        }))
        .sort((a, b) => {
          const aTime = getTime(a.created_at);
          const bTime = getTime(b.created_at);
          return bTime - aTime;
        });

      res.json({ success: true, positions: normalized, count: normalized.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * POST /admin/broadcast/mail - Send bulk email
   */
  async sendBulkMail(req, res) {
    const { subject, body, recipients } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ success: false, error: 'Konu ve içerik gerekli' });
    }

    try {
      // Get mail transporter from app
      const transporter = req.app.get('mailTransporter');
      if (!transporter) {
        return res.status(500).json({ success: false, error: 'Mail sistemi yapılandırılmamış' });
      }

      // If no recipients specified, get all user emails (if we had emails in DB)
      // For now, just log the attempt
      console.log('[Admin] Bulk mail request:', subject, 'by', req.session.user.username);

      res.json({ success: true, message: 'Mail gönderim isteği alındı' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },

/**
 * GET /admin/online-users - Get online users from socket
 */
getOnlineUsers(req, res) {
  try {
    const chatHandler = require('../socket/chatHandler');
    const users = chatHandler.getOnlineUsers ? chatHandler.getOnlineUsers() : [];
    
    res.json({ 
      success: true, 
      users: users,
      count: users.length
    });
  } catch (err) {
    console.error('[Admin] Get online users error:', err);
    res.json({ success: true, users: [], count: 0 });
  }
}
};module.exports = AdminController;
