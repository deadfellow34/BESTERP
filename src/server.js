require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const BetterSqlite3Store = require('./config/sessionStore')(session);
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const http = require('http');
const { Server } = require('socket.io');

const db = require('./config/db');
const { runMigrations } = require('./config/migrations');
const dateUtils = require('./utils/dateUtils');
const { getTCMBRates } = require('./services/ratesService');
const loadRoutes = require('./routes/loadRoutes');
const authRoutes = require('./routes/authRoutes');
const helpRoutes = require('./routes/helpRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const mailDataRoutes = require('./routes/mailDataRoutes');
const databaseRoutes = require('./routes/databaseRoutes');
const accountingRoutes = require('./routes/accountingRoutes');
const logsRoutes = require('./routes/logsRoutes');
const positionKmRoutes = require('./routes/positionKmRoutes');
const profitRoutes = require('./routes/profitRoutes');
// quoteRoutes removed; rate-calculator feature disabled
const fs = require('fs');
const { ensureAuth } = require('./middleware/authMiddleware');
// vizeCache removed — no longer used to periodically fetch Google Sheet
const { startPeriodicBackup } = require('./utils/dbBackup');
const vizebestRoutes = require('./routes/vizebestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cron = require('node-cron');
const VizeAlertService = require('./services/vizeAlertService');
const NotificationService = require('./services/notificationService');
const driverUploadRoutes = require('./routes/driverUploadRoutes');
const driverApiRoutes = require('./routes/driverApiRoutes');
const driverLocationRoutes = require('./routes/driverLocationRoutes');
const driverMessageRoutes = require('./routes/driverMessageRoutes');
const lucaRoutes = require('./routes/lucaRoutes');
const contractRoutes = require('./routes/contractRoutes');
const LucaInvoiceModel = require('./models/lucaInvoiceModel');
const gpsRoutes = require('./routes/gpsRoutes');
const { startGpsRefreshJob } = require('./jobs/gpsRefreshJob');
const { warnIfMissingAssets } = require('./config/env');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store io instance in app for access in routes/controllers
app.set('io', io);

// Initialize notification service with socket.io
NotificationService.init(io);

// ---------- PERFORMANCE: CACHE DEĞİŞKENLERİ ----------
let yearsCache = null;
let yearsCacheTime = 0;
const YEARS_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

// ---------- SOCKET.IO CHAT ----------
const initChatHandler = require('./socket/chatHandler');
initChatHandler(io);

// If the app is behind a reverse proxy (nginx, ELB, etc.), trust the proxy
// so `req.protocol` and `req.ip` reflect the original client request.
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;   // 3000 yerine 80
const HOST = '0.0.0.0';

// ---------- VIEW ENGINE ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- LAYOUT ----------
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ---------- MIDDLEWARE ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));

// ---------- SESSION (Persistent SQLite Store - better-sqlite3) ----------
const sessionsDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

const sessionStore = new BetterSqlite3Store({
  path: path.join(sessionsDir, 'sessions.db')
});

// Make session store accessible globally for admin operations
app.set('sessionStore', sessionStore);

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'bestfreight_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

// ---------- STATİK DOSYALAR ----------
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '1h',
  etag: true
}));
// Serve uploaded files. Ensure PDFs are presented inline and allow embedding
// (CSP frame-ancestors) so preview iframes/objects can render on EC2.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    try {
      // prefer inline display for PDFs so browsers can embed them
      if (/\.pdf$/i.test(filePath)) {
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Content-Type', 'application/pdf');
      }
      // suggest allowing same-origin framing via CSP (modern browsers)
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
      // remove legacy X-Frame-Options if present (some proxies may still add it)
      try { res.removeHeader && res.removeHeader('X-Frame-Options'); } catch (e) {}
    } catch (e) { /* ignore header errors */ }
  }
}));

// ---------- VIEW'LARA currentUser TAŞI ----------
app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.chatUsername = req.session.user ? req.session.user.username : 'Guest';
  res.locals.currentPath = req.path;
  // Date formatting utilities (DD.MM.YYYY standard)
  res.locals.formatDate = dateUtils.formatDate;
  res.locals.formatDateTime = dateUtils.formatDateTime;
  res.locals.formatDateForInput = dateUtils.formatDateForInput;
  res.locals.isoToDisplay = dateUtils.isoToDisplay;
  
  // TCMB Rates for navbar (cache'li - await ile bekle)
  try {
    res.locals.navbarRates = await getTCMBRates();
  } catch (e) {
    res.locals.navbarRates = { EUR: 0, GBP: 0, USD: 0 };
  }
  
  // Global year selector - CACHED (5 dakikada bir yenilenir)
  const now = Date.now();
  if (!yearsCache || (now - yearsCacheTime) > YEARS_CACHE_TTL) {
    try {
      const LoadModel = require('./models/loadModel');
      yearsCache = await new Promise((resolve, reject) => {
        LoadModel.getAvailableYears((err, years) => {
          if (err) reject(err);
          else resolve(years);
        });
      });
      yearsCacheTime = now;
    } catch (e) {
      yearsCache = [new Date().getFullYear()];
    }
  }
  
  res.locals.availableYears = yearsCache.length > 0 ? yearsCache : [new Date().getFullYear()];
  const yearParam = req.query.year;
  res.locals.year = yearParam ? parseInt(yearParam) : res.locals.availableYears[0];
  res.locals.selectedYear = res.locals.year;
  
  next();
});

// Auto-detect a PNG in src/public/img and expose it as `navbarLogo` for templates
(() => {
  try {
    const imgDir = path.join(__dirname, 'public', 'img');
    let logoRel = '/img/logo.png';
    if (fs.existsSync(imgDir)) {
      const files = fs.readdirSync(imgDir);
      const png = files.find(f => /\.(png|PNG)$/.test(f));
      if (png) logoRel = '/img/' + png;
    }
    app.use((req, res, next) => { res.locals.navbarLogo = logoRel; next(); });
  } catch (e) {
    app.use((req, res, next) => { res.locals.navbarLogo = '/img/logo.png'; next(); });
  }
})();

// If a user has the accounting_readonly role, restrict them to accounting pages only
app.use((req, res, next) => {
  const user = req.session && req.session.user;
  if (user && user.role === 'accounting_readonly') {
    const allowedPrefixes = ['/accounting', '/login', '/logout', '/'];
    const pathStartsAllowed = allowedPrefixes.some(pref => req.path === pref || req.path.startsWith(pref + '/') );
    if (!pathStartsAllowed) {
      return res.redirect('/accounting');
    }
  }
  next();
});

// If a user has the global `readonly` role, prevent mutating requests across the app
app.use((req, res, next) => {
  const user = req.session && req.session.user;
  // expose boolean to templates so views can hide edit/delete buttons
  res.locals.isReadOnly = !!(user && user.role === 'readonly');
  if (user && user.role === 'readonly') {
    // Allow only safe methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(403).json({ success: false, error: 'Yetkiniz yok: readonly kullanıcı yalnızca görüntüleyebilir.' });
      }
      return res.status(403).send('Yetkiniz yok: readonly kullanıcı yalnızca görüntüleyebilir.');
    }
  }
  return next();
});

// ---------- CHAT FILE UPLOAD ----------
const multer = require('multer');
const chatUploadDir = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(chatUploadDir)) {
  fs.mkdirSync(chatUploadDir, { recursive: true });
}

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'chat-' + uniqueSuffix + ext);
  }
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Desteklenmeyen dosya türü'));
  }
});

app.post('/api/upload/chat', ensureAuth, chatUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Dosya yüklenemedi' });
  }
  
  const fileUrl = '/uploads/chat/' + req.file.filename;
  res.json({
    success: true,
    url: fileUrl,
    name: req.file.originalname,
    type: req.file.mimetype
  });
});

// ---------- ROTALAR ----------
// /login ve /logout
app.use('/', authRoutes);

// /help - uygulama yardım sayfası
app.use('/help', helpRoutes);

// /changelog - uygulama değişiklik geçmişi
app.get('/changelog', ensureAuth, (req, res) => {
  res.render('changelog');
});

// /loads altındaki tüm YL1 rotaları
app.use('/loads', loadRoutes);

// /driver-upload - Şoför evrak yükleme (login gerektirmez)
app.use('/driver-upload', driverUploadRoutes);

app.use('/vehicles', vehicleRoutes);

// /gps - GPSBuddy integration
app.use('/gps', gpsRoutes.router);
app.use('/api/gps', gpsRoutes.apiRouter);

// /mail-data - Mail alıcıları yönetimi
app.use('/mail-data', mailDataRoutes);

// /notifications - Bildirim sistemi
app.use('/notifications', notificationRoutes);

// /admin - Admin panel (broadcast notifications)
app.use('/admin', adminRoutes);

// vizeCache feature removed per user request — no periodic sheet fetch

// Start periodic DB backups (every 12 hours) into project-level backups/ folder
try {
  const dbFile = path.join(__dirname, '..', 'bestfreight.db');
  const backupsDir = path.join(__dirname, '..', 'backups');
  startPeriodicBackup({ dbPath: dbFile, backupsDir, intervalMs: 12 * 60 * 60 * 1000 });
  console.log('Started periodic DB backups to', backupsDir);
} catch (e) {
  console.error('Failed to start periodic DB backups:', e && e.message);
}

// Vize takip page removed from routes; kept vize cache startup above if still needed

// Simple manual VizeBest data entry page
app.get('/vizebest', ensureAuth, (req, res) => {
  // pass server date so client can compare dates reliably against server time
  return res.render('vizebest', { serverDate: new Date().toISOString() });
});

// VizeBest API routes (load/save rows)
app.use('/vizebest', vizebestRoutes);

// /database - Veritabanı yönetimi
app.use('/database', databaseRoutes);

// /accounting - Muhasebe evrak yönetimi
app.use('/accounting', accountingRoutes);

// /logs - system logs
app.use('/logs', logsRoutes);

// /profit - Sefer Karlılığı (PROFIT) sayfası
app.use('/profit', profitRoutes);

// /api - position KM and other small APIs
app.use('/api', positionKmRoutes);

// /api/driver - Android driver app API (location tracking)
// These endpoints don't require session auth - they use authToken
app.use('/api/driver', driverApiRoutes);

// /driver-locations - Web panel for viewing driver GPS locations
app.use('/driver-locations', driverLocationRoutes);

// /driver-messages - Web panel for driver-operator messaging
app.use('/driver-messages', driverMessageRoutes);

// /luca - Luca e-Fatura integration (both /luca for page and /api/luca for API)
app.use('/luca', lucaRoutes);
app.use('/api/luca', lucaRoutes);

// /contracts - Sözleşmeler (PDF sözleşme yönetimi)
app.use('/contracts', contractRoutes);

// /uid-base - UID Database management page
app.get('/uid-base', ensureAuth, (req, res, next) => {
  const db = require('./config/db');
  
  // Fetch all loads with UID assigned, ordered by UID
  // Use COALESCE to get truck_plate/trailer_plate/driver_name from same position if current load is null
  const sql = `
    SELECT 
      l.id,
      l.uid,
      l.position_no,
      l.customer_name,
      l.consignee_name,
      l.loading_city,
      l.loading_country,
      l.unloading_city,
      l.unloading_country,
      l.packages,
      l.gross_weight,
      COALESCE(l.truck_plate, (
        SELECT l2.truck_plate FROM loads l2 
        WHERE l2.position_no = l.position_no 
          AND l2.truck_plate IS NOT NULL 
        LIMIT 1
      )) as truck_plate,
      COALESCE(l.trailer_plate, (
        SELECT l3.trailer_plate FROM loads l3 
        WHERE l3.position_no = l.position_no 
          AND l3.trailer_plate IS NOT NULL 
        LIMIT 1
      )) as trailer_plate,
      COALESCE(l.driver_name, (
        SELECT l4.driver_name FROM loads l4 
        WHERE l4.position_no = l.position_no 
          AND l4.driver_name IS NOT NULL AND l4.driver_name != ''
        LIMIT 1
      )) as driver_name,
      l.created_at
    FROM loads l
    WHERE l.uid IS NOT NULL AND l.uid != ''
    ORDER BY l.uid DESC
  `;
  
  db.all(sql, [], (err, loads) => {
    if (err) return next(err);
    
    // Format dates and prepare data
    const formattedLoads = (loads || []).map(load => {
      let createdFormatted = '';
      if (load.created_at) {
        try {
          const d = new Date(load.created_at);
          createdFormatted = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch(e) {
          createdFormatted = load.created_at;
        }
      }
      return {
        ...load,
        created_at_formatted: createdFormatted
      };
    });
    
    // Calculate unique position count
    const uniquePositions = new Set(formattedLoads.map(l => l.position_no).filter(Boolean)).size;
    
    res.render('uid-base', {
      title: 'UID Base',
      loads: formattedLoads,
      totalCount: formattedLoads.length,
      uniquePositionCount: uniquePositions
    });
  });
});

// Rate calculator (quote engine) removed

// Ana sayfa: login varsa /loads, yoksa /login
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/loads');
  }
  return res.redirect('/login');
});

// ---------- GLOBAL HATA YAKALAYICI ----------
app.use((err, req, res, next) => {
  console.error('Global hata:', err);
  res.status(500).send('Sunucu hatası');
});

// ---------- RUN MIGRATIONS & START SERVER ----------
(async () => {
  try {
    // Run database migrations before starting the server
    await runMigrations(db);
    console.log('[Startup] Database migrations completed.');
    
    // Ensure luca_invoices table exists
    LucaInvoiceModel.createTable((err) => {
      if (err) {
        console.error('[Startup] Luca table error:', err);
      } else {
        console.log('[Startup] Luca invoices table ready.');
      }
    });
  } catch (migrationErr) {
    console.error('[Startup] Migration error:', migrationErr);
    // Continue anyway - migrations are designed to be idempotent
  }

  // One-time startup warnings (non-fatal)
  try {
    warnIfMissingAssets();
  } catch (_) {
    // ignore
  }

  // Optional GPS refresh job
  try {
    startGpsRefreshJob();
  } catch (e) {
    console.error('[Startup] GPS refresh job not started:', e && e.message ? e.message : e);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  
  // ---------- VizeBest HAFTALIK UYARI CRON JOB ----------
  // Her Pazar GMT+3 saatiyle 09:00'da çalışır
  const alertEmail = process.env.VIZE_ALERT_EMAIL;
  if (alertEmail) {
    cron.schedule('0 9 * * 0', async () => {
      console.log('[VizeAlert] Günlük uyarı kontrolü başlıyor...');
      try {
        const result = await VizeAlertService.sendAlertEmail(alertEmail);
        console.log('[VizeAlert] Sonuç:', result);
      } catch (err) {
        console.error('[VizeAlert] Hata:', err.message);
      }
    }, {
      timezone: 'Europe/Istanbul'
    });
    console.log(`[VizeAlert] Günlük mail uyarısı aktif - Alıcı: ${alertEmail}`);
  } else {
    console.log('[VizeAlert] VIZE_ALERT_EMAIL tanımlı değil, günlük mail devre dışı.');
  }
  });
})();

// ---------- VizeAlert TEST/MANUAL ENDPOINT ----------
// Manuel olarak uyarı maili göndermek için: GET /vizebest/send-alert
app.get('/vizebest/send-alert', ensureAuth, async (req, res) => {
  const alertEmail = process.env.VIZE_ALERT_EMAIL;
  if (!alertEmail) {
    return res.json({ success: false, error: 'VIZE_ALERT_EMAIL .env dosyasında tanımlı değil.' });
  }
  try {
    const result = await VizeAlertService.sendAlertEmail(alertEmail);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Uyarı özetini görüntüle (mail göndermeden)
app.get('/vizebest/warnings', ensureAuth, async (req, res) => {
  try {
    const summary = await VizeAlertService.getWarningsSummary();
    res.json(summary);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
