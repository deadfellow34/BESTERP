const db = require('../config/db');
const bcrypt = require('bcrypt');

const authController = {
  // GET /login
  showLogin(req, res) {
    // Zaten giriş yapmışsa yeniden login ekranı göstermeyelim
    if (req.session && req.session.user) {
      return res.redirect('/loads');
    }

    res.render('auth/login', {
      error: null,
      lastUsername: '',
      activePage: 'login',
      pageTitle: 'Giriş - BEST Freight YL1',
    });
  },

  // POST /login
  async login(req, res) {
    const { username, password } = req.body;

    const renderError = (message) => {
      return res.render('auth/login', {
        error: message,
        lastUsername: username || '',
        activePage: 'login',
        pageTitle: 'Giriş - BEST Freight YL1',
      });
    };

    if (!username || !password) {
      return renderError('Kullanıcı adı ve şifre zorunludur.');
    }

    const sql = 'SELECT id, username, password, role, is_active FROM users WHERE username = ?';

    db.get(sql, [username], async (err, user) => {
      if (err) {
        console.error('Login sırasında DB hatası:', err);
        return renderError('Sunucu hatası. Lütfen biraz sonra tekrar deneyin.');
      }

      if (!user) {
        return renderError('Kullanıcı adı veya şifre hatalı.');
      }

      // Check password - support both plain text (legacy) and bcrypt hashed passwords
      let passwordValid = false;
      
      // Check if password is bcrypt hashed (starts with $2a$, $2b$, or $2y$)
      if (user.password && user.password.startsWith('$2')) {
        // bcrypt hashed password
        try {
          passwordValid = await bcrypt.compare(password, user.password);
        } catch (bcryptErr) {
          console.error('bcrypt compare error:', bcryptErr);
          passwordValid = false;
        }
      } else {
        // Plain text password (legacy)
        passwordValid = user.password === password;
      }

      if (!passwordValid) {
        return renderError('Kullanıcı adı veya şifre hatalı.');
      }

      // Check if user is active
      if (user.is_active === 0) {
        return renderError('Bu hesap devre dışı bırakılmış. Yönetici ile iletişime geçin.');
      }

      // Update last_login
      db.run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id], (updateErr) => {
        if (updateErr) console.error('last_login update error:', updateErr);
      });

      // Oturum aç
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };

      return res.redirect('/loads');
    });
  },

  // GET /logout
  logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Oturum sonlandırılırken hata:', err);
      }
      return res.redirect('/login');
    });
  },
};

module.exports = authController;
