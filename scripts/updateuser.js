// updateUserRole.js
const db = require('./src/config/db');

const args = process.argv.slice(2);
const username = args[0];
const newRole = args[1] || 'admin';

if (!username) {
  console.log('Kullanım: node updateUserRole.js <username> [role]');
  process.exit(1);
}

db.run(
  'UPDATE users SET role = ? WHERE username = ?',
  [newRole, username],
  function (err) {
    if (err) {
      console.error('Rol güncellenirken hata:', err.message);
      db.close(() => process.exit(1));
      return;
    }

    if (this.changes === 0) {
      console.log('Bu kullanıcı adına sahip bir kayıt bulunamadı:', username);
    } else {
      console.log(`Kullanıcının rolü güncellendi: ${username} → ${newRole}`);
    }

    db.close(() => process.exit(0));
  }
);
