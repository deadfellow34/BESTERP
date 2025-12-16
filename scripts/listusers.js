// listUsers.js
const db = require('./src/config/db');

db.all('SELECT id, username, password, role FROM users', [], (err, rows) => {
  if (err) {
    console.error('Kullanıcılar listelenirken hata:', err.message);
  } else {
    console.log('Kayıtlı kullanıcılar:');
    if (!rows || rows.length === 0) {
      console.log('(Hiç kullanıcı yok)');
    } else {
      rows.forEach((row) => {
        console.log(
          `ID: ${row.id}, username: "${row.username}", password: "${row.password}", role: ${row.role}`
        );
      });
    }
  }

  db.close(() => process.exit(0));
});
