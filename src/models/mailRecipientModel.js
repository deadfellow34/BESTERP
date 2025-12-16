const db = require('../config/db');

// ensure schema: add recipient_type column if missing
function ensureRecipientTypeColumn() {
  db.all(`PRAGMA table_info(mail_recipients)`, [], (err, rows) => {
    if (err) return console.error('PRAGMA table_info error', err);
    const has = (rows || []).some(r => r.name === 'recipient_type');
    if (!has) {
      db.run(`ALTER TABLE mail_recipients ADD COLUMN recipient_type TEXT DEFAULT 'to'`, (alterErr) => {
        if (alterErr) console.error('Failed to add recipient_type column:', alterErr);
        else console.log('Added recipient_type column to mail_recipients');
      });
    }
  });
}

ensureRecipientTypeColumn();

// ensure sender_company column exists (for sender-specific mappings)
function ensureSenderCompanyColumn() {
  db.all(`PRAGMA table_info(mail_recipients)`, [], (err, rows) => {
    if (err) return console.error('PRAGMA table_info error', err);
    const has = (rows || []).some(r => r.name === 'sender_company');
    if (!has) {
      db.run(`ALTER TABLE mail_recipients ADD COLUMN sender_company TEXT`, (alterErr) => {
        if (alterErr) console.error('Failed to add sender_company column:', alterErr);
        else console.log('Added sender_company column to mail_recipients');
      });
    }
  });
}

ensureSenderCompanyColumn();

const MailRecipientModel = {
  // Tüm mail alıcı kayıtlarını getir
  getAll(callback) {
    const sql = `
      SELECT id, alici_adi, email, is_active, created_at, recipient_type, sender_company 
      FROM mail_recipients 
      ORDER BY alici_adi ASC, created_at DESC
    `;
    
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Mail recipients getAll hatası:', err);
        return callback(err, null);
      }
      callback(null, rows);
    });
  },

  // Belirli bir alıcı adına ait aktif mail adreslerini getir
  getByAliciAdi(aliciAdi, callback) {
    // Legacy helper: return active emails for alici_adi (no sender filtering)
    const sql = `
      SELECT email 
      FROM mail_recipients 
      WHERE alici_adi = ? AND is_active = 1
    `;
    
    db.all(sql, [aliciAdi], (err, rows) => {
      if (err) {
        console.error('Mail recipients getByAliciAdi hatası:', err);
        return callback(err, null);
      }
      const emails = rows.map(row => row.email);
      callback(null, emails);
    });
  },

  // Get recipients for an alici_adi, preferring rows that match the given sender.
  // If sender-specific rows exist they are returned; otherwise fall back to generic rows (sender_company NULL or empty).
  getByAliciAdiForSender(aliciAdi, senderName, callback) {
    if (!aliciAdi) return callback(null, []);
    const trimmedSender = (senderName || '').toString().trim();

    // First try sender-specific rows
    const sqlSpecific = `SELECT id, email, is_active, recipient_type, sender_company FROM mail_recipients WHERE alici_adi = ? AND sender_company IS NOT NULL AND LOWER(sender_company) = LOWER(?) ORDER BY id`;
    db.all(sqlSpecific, [aliciAdi, trimmedSender], (err, specRows) => {
      if (err) {
        console.error('getByAliciAdiForSender specific query error:', err);
        return callback(err, null);
      }
      if (specRows && specRows.length) return callback(null, specRows);

      // Fallback to generic rows (no sender_company specified)
      const sqlGeneric = `SELECT id, email, is_active, recipient_type, sender_company FROM mail_recipients WHERE alici_adi = ? AND (sender_company IS NULL OR sender_company = '') ORDER BY id`;
      db.all(sqlGeneric, [aliciAdi], (gErr, genRows) => {
        if (gErr) {
          console.error('getByAliciAdiForSender generic query error:', gErr);
          return callback(gErr, null);
        }
        return callback(null, genRows || []);
      });
    });
  },

  // Return full rows including id, email, is_active, recipient_type
  getByAliciAdiFull(aliciAdi, callback) {
    const sql = `
      SELECT id, email, is_active, recipient_type, sender_company
      FROM mail_recipients
      WHERE alici_adi = ?
      ORDER BY id
    `;
    db.all(sql, [aliciAdi], (err, rows) => {
      if (err) {
        console.error('Mail recipients getByAliciAdiFull hatası:', err);
        return callback(err, null);
      }
      callback(null, rows || []);
    });
  },

  // Yeni mail alıcısı ekle
  create(aliciAdi, email, type = 'to', senderCompany = null, callback) {
    const sql = `
      INSERT INTO mail_recipients (alici_adi, email, is_active, created_at, recipient_type, sender_company)
      VALUES (?, ?, 1, datetime('now'), ?, ?)
    `;
    
    db.run(sql, [aliciAdi, email, type, senderCompany], function(err) {
      if (err) {
        console.error('Mail recipient oluşturma hatası:', err);
        return callback(err, null);
      }
      callback(null, { id: this.lastID, aliciAdi, email, recipient_type: type, sender_company: senderCompany });
    });
  },

  // Mail alıcısını sil
  delete(id, callback) {
    const sql = `DELETE FROM mail_recipients WHERE id = ?`;
    
    db.run(sql, [id], function(err) {
      if (err) {
        console.error('Mail recipient silme hatası:', err);
        return callback(err);
      }
      callback(null);
    });
  },

  // Delete all recipients for a given alici_adi
  deleteByAliciAdi(aliciAdi, callback) {
    const sql = `DELETE FROM mail_recipients WHERE alici_adi = ?`;
    db.run(sql, [aliciAdi], function(err) {
      if (err) {
        console.error('Mail recipients deleteByAliciAdi hatası:', err);
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  },

  // Mail alıcısını aktif/pasif yap
  toggleActive(id, callback) {
    const sql = `
      UPDATE mail_recipients 
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `;
    
    db.run(sql, [id], function(err) {
      if (err) {
        console.error('Mail recipient toggle hatası:', err);
        return callback(err);
      }
      callback(null);
    });
  }
};

module.exports = MailRecipientModel;
