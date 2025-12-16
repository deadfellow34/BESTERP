const db = require('../config/db');
const LogModel = require('../models/logModel');

// List positions that have logs (grouped)
exports.index = (req, res) => {
  // Year filtering
  const year = req.query.year || new Date().getFullYear();
  const yearPrefix = String(year).slice(-2) + '/%';
  
  // Fetch distinct position_nos from logs (either entity='position' with entity_id as positionNo,
  // or entity='load' joined to loads)
  const sql = `
    SELECT l.position_no AS position_no, MAX(logs.created_at) AS last_log, COUNT(logs.id) AS cnt
    FROM logs
    LEFT JOIN loads l ON (
      (logs.entity = 'load' AND (logs.entity_id = l.id OR logs.entity_id_text = l.position_no))
      OR (logs.entity = 'position' AND logs.entity_id_text = l.position_no)
    )
    WHERE logs.entity IN ('load','position')
      AND l.position_no LIKE ?
    GROUP BY l.position_no
    ORDER BY last_log DESC
  `;

  db.all(sql, [yearPrefix], (err, rows) => {
    if (err) {
      console.error('Error fetching logs index:', err);
      return res.render('logs/index', { positions: [], year });
    }
    res.render('logs/index', { positions: rows || [], year });
  });
};

// Show logs for a position (positionNo)
exports.position = (req, res) => {
  const positionNo = req.params.positionNo;
  if (!positionNo) return res.status(400).send('Pozisyon belirtilmeli');

  // OPTIMIZED: Subquery yerine LEFT JOIN kullanıyoruz
  const sql = `
    SELECT logs.* FROM logs
    LEFT JOIN loads ON logs.entity = 'load' AND logs.entity_id = loads.id
    WHERE (logs.entity = 'position' AND (logs.entity_id = ? OR logs.entity_id_text = ?))
      OR (logs.entity = 'load' AND (loads.position_no = ? OR logs.entity_id_text = ?))
    ORDER BY logs.created_at DESC
  `;

  db.all(sql, [positionNo, positionNo, positionNo, positionNo], (err, rows) => {
    if (err) {
      console.error('Error fetching logs for position:', err);
      return res.status(500).send('DB error');
    }
    res.render('logs/position', { positionNo, logs: rows || [] });
  });
};

// POST /logs/clear -> delete all logs
exports.clearAll = (req, res) => {
  const sql = `DELETE FROM logs`;
  db.run(sql, [], function(err) {
    if (err) {
      console.error('Error clearing logs:', err);
      return res.status(500).send('Loglar temizlenirken hata oluştu');
    }
    // redirect back to logs index
    res.redirect('/logs');
  });
};

// GET /logs/search?q=... -> Arama sayfası
exports.search = (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) {
    return res.render('logs/search', { logs: [], query: '', stats: null });
  }
  
  LogModel.search(q, 200, (err, logs) => {
    if (err) {
      console.error('Error searching logs:', err);
      return res.render('logs/search', { logs: [], query: q, stats: null });
    }
    res.render('logs/search', { logs: logs || [], query: q, stats: null });
  });
};

// GET /logs/user/:username -> Kullanıcıya göre loglar
exports.byUser = (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).send('Kullanıcı adı belirtilmeli');
  
  LogModel.getByUsername(username, 500, (err, logs) => {
    if (err) {
      console.error('Error fetching user logs:', err);
      return res.render('logs/user', { logs: [], username });
    }
    res.render('logs/user', { logs: logs || [], username });
  });
};

// GET /logs/today -> Bugünün logları
exports.today = (req, res) => {
  LogModel.getToday((err, logs) => {
    if (err) {
      console.error('Error fetching today logs:', err);
      return res.render('logs/today', { logs: [] });
    }
    res.render('logs/today', { logs: logs || [] });
  });
};

// GET /logs/recent -> Son loglar
exports.recent = (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  LogModel.getRecent(limit, (err, logs) => {
    if (err) {
      console.error('Error fetching recent logs:', err);
      return res.render('logs/recent', { logs: [], limit });
    }
    res.render('logs/recent', { logs: logs || [], limit });
  });
};

// GET /logs/stats -> İstatistikler
exports.stats = (req, res) => {
  LogModel.getStats((err, stats) => {
    if (err) {
      console.error('Error fetching log stats:', err);
      return res.render('logs/stats', { stats: null, userStats: [] });
    }
    LogModel.getUserStats((err2, userStats) => {
      if (err2) {
        console.error('Error fetching user stats:', err2);
        return res.render('logs/stats', { stats, userStats: [] });
      }
      res.render('logs/stats', { stats, userStats: userStats || [] });
    });
  });
};

// GET /logs/date?start=...&end=... -> Tarih aralığı
exports.byDateRange = (req, res) => {
  const start = req.query.start || '';
  const end = req.query.end || '';
  
  if (!start || !end) {
    return res.render('logs/date', { logs: [], start: '', end: '' });
  }
  
  LogModel.getByDateRange(start, end, (err, logs) => {
    if (err) {
      console.error('Error fetching date range logs:', err);
      return res.render('logs/date', { logs: [], start, end });
    }
    res.render('logs/date', { logs: logs || [], start, end });
  });
};

// API: GET /logs/api/stats -> JSON stats
exports.apiStats = (req, res) => {
  LogModel.getStats((err, stats) => {
    if (err) return res.json({ error: err.message });
    res.json(stats);
  });
};

// ============ PIN AUTHENTICATION ============
// GET /logs/login - Show logs PIN form
exports.showPinLogin = (req, res) => {
  // If already verified, redirect to logs
  if (req.session.isLogsVerified) {
    return res.redirect('/logs');
  }
  res.render('logs/pin-login', { 
    pageTitle: 'Kayıtlar - Giriş',
    error: null 
  });
};

// POST /logs/login - Verify logs PIN
exports.verifyPin = (req, res) => {
  const { pin } = req.body;
  const adminPin = process.env.ADMIN_PANEL_PIN || '1234'; // Same PIN as admin panel

  if (pin === adminPin) {
    req.session.isLogsVerified = true;
    return res.redirect('/logs');
  }

  res.render('logs/pin-login', {
    pageTitle: 'Kayıtlar - Giriş',
    error: 'Yanlış PIN. Lütfen tekrar deneyin.'
  });
};

// POST /logs/logout - Clear logs verification
exports.logoutLogs = (req, res) => {
  req.session.isLogsVerified = false;
  res.redirect('/loads');
};

module.exports = exports;
