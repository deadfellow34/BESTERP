// Basit giriş kontrolü middleware
function ensureAuth(req, res, next) {
  if (req.session && req.session.user) {
    // İstersek view'lara da taşıyabiliriz
    res.locals.currentUser = req.session.user;
    return next();
  }
  return res.redirect('/login');
}

// Prevent users with read-only accounting role from performing mutating actions
function ensureAccountingModify(req, res, next) {
  const user = req.session && req.session.user;
  if (user && user.role && user.role === 'accounting_readonly') {
    // If request expects JSON (AJAX), return JSON error; otherwise redirect back with message
    if (req.xhr || req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
      return res.status(403).json({ success: false, error: 'Yetkiniz yok: Bu kullanıcı yalnızca görüntüleyebilir.' });
    }
    return res.status(403).send('Yetkiniz yok: Bu kullanıcı yalnızca görüntüleyebilir.');
  }
  return next();
}

module.exports = { ensureAuth, ensureAccountingModify };
