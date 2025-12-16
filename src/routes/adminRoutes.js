/**
 * Admin Panel Routes
 * Handles admin panel access, PIN verification, notification broadcasting,
 * user management, and system settings
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureAuth } = require('../middleware/authMiddleware');
const AdminController = require('../controllers/adminController');

// Ensure uploads directory exists
const notificationsUploadDir = path.join(__dirname, '../../uploads/notifications');
try {
  if (!fs.existsSync(notificationsUploadDir)) {
    fs.mkdirSync(notificationsUploadDir, { recursive: true });
    console.log('[Admin] Created notifications upload directory:', notificationsUploadDir);
  }
} catch (err) {
  console.error('[Admin] Failed to create notifications upload directory:', err.message);
}

// Configure multer for file uploads with proper filename extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, notificationsUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'notification-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir'));
    }
  }
});

// Middleware: Ensure user is admin
function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).send('Yetkiniz yok: Admin yetkisi gerekli.');
}

// Middleware: Ensure admin panel is verified (PIN entered)
function ensureAdminPanelVerified(req, res, next) {
  if (req.session && req.session.isAdminPanelVerified === true) {
    return next();
  }
  return res.redirect('/admin/login');
}

// ============ AUTH ROUTES ============
// GET /admin/login - Show PIN login form
router.get('/login', ensureAuth, ensureAdmin, AdminController.showPinLogin);

// POST /admin/login - Verify PIN
router.post('/login', ensureAuth, ensureAdmin, AdminController.verifyPin);

// POST /admin/logout - Logout from admin panel (clear verification)
router.post('/logout', ensureAuth, ensureAdmin, AdminController.logoutPanel);

// ============ MAIN PANEL ============
// GET /admin - Main admin panel (requires PIN verification)
router.get('/', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.showPanel);

// ============ NOTIFICATION ROUTES ============
// POST /admin/notifications/broadcast - Send broadcast notification
router.post('/notifications/broadcast', ensureAuth, ensureAdmin, ensureAdminPanelVerified, upload.single('image'), AdminController.broadcastNotification);

// POST /admin/notifications/reminder - Send position reminder
router.post('/notifications/reminder', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.sendReminder);

// DELETE /admin/notifications/:id - Delete a notification
router.delete('/notifications/:id', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.deleteNotification);

// ============ USER MANAGEMENT ROUTES ============
// GET /admin/users - Get all users
router.get('/users', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.getUsers);

// POST /admin/users - Create new user
router.post('/users', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.createUser);

// PUT /admin/users/:id - Update user
router.put('/users/:id', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.updateUser);

// DELETE /admin/users/:id - Delete user
router.delete('/users/:id', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.deleteUser);

// POST /admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.resetPassword);

// POST /admin/users/:id/toggle-active - Toggle user active status
router.post('/users/:id/toggle-active', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.toggleUserActive);

// POST /admin/users/:id/force-logout - Force logout a user
router.post('/users/:id/force-logout', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.forceLogout);

// ============ SYSTEM SETTINGS ROUTES ============
// POST /admin/settings/maintenance - Toggle maintenance mode
router.post('/settings/maintenance', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.toggleMaintenance);

// POST /admin/settings/backup - Create manual backup
router.post('/settings/backup', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.createBackup);

// ============ LOGS & STATS ROUTES ============
// GET /admin/logs - Get activity logs
router.get('/logs', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.getLogs);

// GET /admin/stats - Get real-time stats
router.get('/stats', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.getStats);

// GET /admin/today-positions - Get today's positions
router.get('/today-positions', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.getTodayPositions);

// GET /admin/online-users - Get online users
router.get('/online-users', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.getOnlineUsers);

// POST /admin/broadcast/mail - Send bulk email
router.post('/broadcast/mail', ensureAuth, ensureAdmin, ensureAdminPanelVerified, AdminController.sendBulkMail);

// POST /admin/verify-logs-pin - Verify PIN for logs access (JSON API)
router.post('/verify-logs-pin', ensureAuth, (req, res) => {
  const { pin, setSession } = req.body;
  const adminPin = process.env.ADMIN_PANEL_PIN || '1234';
  if (pin === adminPin) {
    // If setSession flag is true, also mark admin panel as verified
    if (setSession) {
      req.session.isAdminPanelVerified = true;
    }
    return res.json({ success: true });
  }
  return res.json({ success: false, error: 'Yanlış şifre' });
});

module.exports = router;
