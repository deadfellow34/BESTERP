// createUser.js (better-sqlite3)
const db = require('../src/config/db');

// Usage: node createUser.js <username> <password> [role]
const args = process.argv.slice(2);
const username = args[0] || 'aytug';
const password = args[1] || 'amkturan1';
const role = args[2] || 'admin';

if (!args.length) {
  console.log('No arguments provided — using defaults. To update a specific user run:');
  console.log('  node createUser.js aytug "amkturan1" admin');
}

try {
  // Önce bu kullanıcı var mı diye bakalım
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  if (row) {
    // Varsa: şifre ve rol güncelle
    const info = db
      .prepare('UPDATE users SET password = ?, role = ? WHERE id = ?')
      .run(password, role, row.id);

    if (info.changes > 0) {
      console.log('Kullanıcı güncellendi.');
      console.log('Kullanıcı adı:', username);
      console.log('Yeni şifre:', password);
      console.log('Rol:', role);
    } else {
      console.log('Kullanıcı bulundu ama güncelleme yapılmadı (changes=0).');
    }
  } else {
    // Yoksa: yeni kullanıcı ekle
    const info = db
      .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .run(username, password, role);

    console.log('Yeni kullanıcı eklendi. ID:', String(info.lastInsertRowid));
    console.log('Kullanıcı adı:', username);
    console.log('Şifre:', password);
    console.log('Rol:', role);
  }

  db.close();
  process.exit(0);
} catch (err) {
  console.error('Hata:', err && err.message ? err.message : err);
  try { db.close(); } catch (_) {}
  process.exit(1);
}
