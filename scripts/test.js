// createUser.js
const db = require('./src/config/db');

// Burayı istediğin gibi değiştirebilirsin
// Using the exact values you asked for (case preserved).
// Usage: node createUser.js <username> <password> [role]
// If you provide arguments they will be used; otherwise the defaults below are used.
const args = process.argv.slice(2);
const username = args[0] || 'busra';
const password = args[1] || 'dengergen123';
const role = args[2] || 'admin';

if (!args.length) {
  console.log('No arguments provided — using defaults. To update a specific user run:');
  console.log('  node createUser.js busra "dengergen123"');
}

// Önce bu kullanıcı var mı diye bakalım
db.get(
  'SELECT id FROM users WHERE username = ?',
  [username],
  (err, row) => {
    if (err) {
      console.error('Kullanıcı kontrolünde hata:', err.message);
      db.close(() => process.exit(1));
      return;
    }

    if (row) {
      // Varsa: şifresini ve rolünü GÜNCELLEYELİM
      db.run(
        'UPDATE users SET password = ?, role = ? WHERE id = ?',
        [password, role, row.id],
        function (err2) {
          if (err2) {
            console.error('Kullanıcı güncellenirken hata:', err2.message);
          } else {
            console.log('Kullanıcı güncellendi.');
            console.log('Kullanıcı adı:', username);
            console.log('Yeni şifre:', password);
            console.log('Rol:', role);
          }
          db.close(() => process.exit(0));
        }
      );
    } else {
      // Yoksa: yeni kullanıcı EKLEYELİM
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, password, role],
        function (err3) {
          if (err3) {
            console.error('Kullanıcı eklenirken hata:', err3.message);
          } else {
            console.log('Yeni kullanıcı eklendi. ID:', this.lastID);
            console.log('Kullanıcı adı:', username);
            console.log('Şifre:', password);
            console.log('Rol:', role);
          }
          db.close(() => process.exit(0));
        }
      );
    }
  }
);
