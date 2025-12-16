// backend/src/controllers/databaseController.js
const db = require('../config/db');
const CompanyModel = require('../models/companyModel');
const SealModel = require('../models/sealModel');

const databaseController = {
  // GET /database → Veritabanı yönetim sayfası
  showDatabasePage(req, res, next) {
    // Inspect table columns to include optional fields if present
    db.all("PRAGMA table_info('companies')", [], (pErr, cols) => {
      if (pErr) return next(pErr);
      const colNames = (cols || []).map(c => c.name);
      const includeCreatedAt = colNames.includes('created_at');
      const includeCreatedBy = colNames.includes('created_by');

      // build select list safely depending on available columns
      const selectCols = ['id','name','type'];
      if (includeCreatedAt) selectCols.push('created_at');
      if (includeCreatedBy) selectCols.push('created_by');

      // UNION ile hem aktif hem silinmiş şirketleri çek
      const unionSql = `
        SELECT id, name, type, created_at, created_by, NULL as deleted_at, NULL as deleted_by, 0 as is_deleted, created_at as created_or_deleted_at FROM companies
        UNION ALL
        SELECT original_id as id, name, type, NULL as created_at, NULL as created_by, deleted_at, deleted_by, 1 as is_deleted, deleted_at as created_or_deleted_at FROM deleted_companies
        ORDER BY created_or_deleted_at DESC, id DESC
      `;
      db.all(unionSql, [], (err, companies) => {
        if (err) return next(err);

        // Format created_at/deleted_at for readability, mark silinenler
        companies = (companies || []).map(c => {
          const copy = Object.assign({}, c);
          if (copy.is_deleted) {
            if (copy.deleted_at) {
              try {
                const d = new Date(copy.deleted_at);
                copy._created_at_formatted = isNaN(d.getTime()) ? copy.deleted_at : d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
              } catch (e) { copy._created_at_formatted = copy.deleted_at; }
            } else {
              copy._created_at_formatted = null;
            }
            copy._created_by = copy.deleted_by || null;
          } else {
            if (includeCreatedAt && copy.created_at) {
              try {
                const d = new Date(copy.created_at);
                copy._created_at_formatted = isNaN(d.getTime()) ? copy.created_at : d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
              } catch (e) {
                copy._created_at_formatted = copy.created_at;
              }
            } else {
              copy._created_at_formatted = null;
            }
            copy._created_by = includeCreatedBy ? (copy.created_by || null) : null;
          }
          return copy;
        });

        // Şirketleri kategorilere ayır
        // Use only active (not archived/deleted) companies for the top lists
        const activeCompanies = (companies || []).filter(c => !c.is_deleted);
        const customers = activeCompanies.filter(c => (c.type === 'sender' || c.type === 'both'));
        const consignees = activeCompanies.filter(c => (c.type === 'receiver' || c.type === 'both'));
        const invoiceCompanies = activeCompanies.filter(c => (c.type === 'invoice' || c.type === 'both'));

        // Aktif ve silinmişleri ayırmak için deletedItems yine ayrı çekilecek
        SealModel.getAll((sErr, seals) => {
          if (sErr) return next(sErr);
          const success = (req.query && req.query.success) ? req.query.success : null;
          const error = (req.query && req.query.error) ? req.query.error : null;
          const createSql = `CREATE TABLE IF NOT EXISTS deleted_companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_id INTEGER,
            name TEXT,
            type TEXT,
            deleted_by TEXT,
            deleted_at TEXT
          )`;
          db.run(createSql, [], (cErr) => {
            if (cErr) return next(cErr);
            const delSql = `SELECT id, original_id, name, type, deleted_by, deleted_at FROM deleted_companies ORDER BY deleted_at DESC, id DESC LIMIT 50`;
            db.all(delSql, [], (dErr, deletedRows) => {
              if (dErr) return next(dErr);
              const formattedDeleted = (deletedRows || []).map(r => {
                const copy = Object.assign({}, r);
                if (copy.deleted_at) {
                  try {
                    const d = new Date(copy.deleted_at);
                    copy._deleted_at_formatted = isNaN(d.getTime()) ? copy.deleted_at : d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  } catch (e) { copy._deleted_at_formatted = copy.deleted_at; }
                } else {
                  copy._deleted_at_formatted = null;
                }
                return copy;
              });
              // Try to read trucks list; if table missing, fallback to empty list
              db.all("SELECT id, plate, driver_name FROM trucks ORDER BY plate COLLATE NOCASE", [], (tErr, trucks) => {
                const safeTrucks = Array.isArray(trucks) ? (trucks.map(t => ({ id: t.id, plate: t.plate, driver_name: t.driver_name }))) : [];
                // If table doesn't exist, tErr will be set — ignore and continue with empty list
                res.render('database/index', {
                  customers,
                  consignees,
                  invoiceCompanies,
                  allCompanies: companies,
                  seals: seals || [],
                  trucks: safeTrucks,
                  deletedItems: formattedDeleted,
                  success,
                  error
                });
              });
            });
          });
        });
      });
    });
  },

  // POST /database/add-company → Şirket ekle
  addCompany(req, res, next) {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.redirect('/database');
    }
    // Ekleyen kullanıcı ve tarih
    const createdBy = req.session && req.session.user ? req.session.user.username : null;
    const createdAt = new Date().toISOString();
    const data = {
      name: name.trim(),
      type: type,
      created_by: createdBy,
      created_at: createdAt
    };
    CompanyModel.create(data, (err) => {
      if (err) {
        const q = err && err.message && err.message.toLowerCase().includes('unique') ? '?error=' + encodeURIComponent('Bu şirket zaten mevcut.') : '';
        return res.redirect('/database' + q);
      }
      res.redirect('/database?success=' + encodeURIComponent('Şirket eklendi.'));
    });
  },

  // POST /database/add-seal → add a seal row
  addSeal(req, res, next) {
    const val = (req.body.seal || req.body.code || req.body.seal_no || '').toString().trim();
    if (!val) {
      return res.redirect('/database');
    }

    const tryInsert = (col, cb) => {
      const sql = `INSERT INTO seals (${col}) VALUES (?)`;
      db.run(sql, [val], function (err) {
        cb(err, this && this.lastID);
      });
    };

    tryInsert('code', (err, id) => {
      if (!err) return res.redirect('/database?success=' + encodeURIComponent('Mühür eklendi.'));
      if (err.message && err.message.toLowerCase().includes('no such column')) {
        tryInsert('seal_no', (err2, id2) => {
          if (err2) return next(err2);
          return res.redirect('/database?success=' + encodeURIComponent('Mühür eklendi.'));
        });
      } else if (err.message && err.message.toLowerCase().includes('unique')) {
        return res.redirect('/database?error=' + encodeURIComponent('Bu mühür zaten mevcut.'));
      } else {
        return next(err);
      }
    });
  },

  // POST /database/add-truck-driver → add or update a truck driver by plate
  addTruckDriver(req, res, next) {
    const plateRaw = (req.body.plate || '').toString().trim();
    const driver = (req.body.driver_name || req.body.driver || '').toString().trim();
    if (!plateRaw) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(400).json({ ok:false, message: 'Plaka gerekli' });
      return res.redirect('/database');
    }
    const plate = plateRaw.toUpperCase();

    const sqlGet = 'SELECT id FROM trucks WHERE plate = ? LIMIT 1';
    db.get(sqlGet, [plate], (gErr, row) => {
      if (gErr) return next(gErr);
      if (row) {
        const sqlUpd = 'UPDATE trucks SET driver_name = ? WHERE plate = ?';
        db.run(sqlUpd, [driver, plate], function (uErr) {
          if (uErr) return next(uErr);
          if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true, message: 'Şoför bilgisi güncellendi.' });
          return res.redirect('/database?success=' + encodeURIComponent('Şoför güncellendi.'));
        });
      } else {
        const sqlIns = 'INSERT INTO trucks (plate, driver_name) VALUES (?, ?)';
        db.run(sqlIns, [plate, driver], function (iErr) {
          if (iErr) {
            return next(iErr);
          }
          if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true, message: 'Çekici eklendi.' });
          return res.redirect('/database?success=' + encodeURIComponent('Çekici eklendi.'));
        });
      }
    });
  },

  // POST /database/delete-truck/:id → delete a truck by id
  deleteTruck(req, res, next) {
    const id = req.params.id;
    if (!id) {
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(400).json({ ok: false, message: 'ID gerekli' });
      return res.redirect('/database');
    }
    const sql = `DELETE FROM trucks WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) {
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.status(500).json({ ok: false, message: 'Silme hatası' });
        return next(err);
      }
      if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true, message: 'Çekici silindi.' });
      return res.redirect('/database?success=' + encodeURIComponent('Çekici silindi.'));
    });
  },

  // POST /database/delete-seal/:id → delete a seal by id
  deleteSeal(req, res, next) {
    const id = req.params.id;
    if (!id) return res.redirect('/database');
    const sql = `DELETE FROM seals WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) return next(err);
      return res.redirect('/database?success=' + encodeURIComponent('Mühür silindi.'));
    });
  },

  // POST /database/unmark-seal/:id → mark a used seal as unused again
  unmarkSeal(req, res, next) {
    const id = req.params.id;
    if (!id) return res.redirect('/database');

    // read the seal row to determine which column holds the code
    const sql = `SELECT * FROM seals WHERE id = ? LIMIT 1`;
    db.get(sql, [id], (err, row) => {
      if (err) return next(err);
      if (!row) return res.redirect('/database');

      const codeVal = (row.code && row.code.toString()) || (row.seal_no && row.seal_no.toString()) || row.id;
      // Use SealModel to perform the appropriate unmark logic
      SealModel.markAsUnused(codeVal, (mErr) => {
        if (mErr) return next(mErr);
        return res.redirect('/database?success=' + encodeURIComponent('Mühür kullanımdan çıkarıldı.'));
      });
    });
  },

  // POST /database/delete-company/:id → Şirket sil
  deleteCompany(req, res, next) {
    const id = req.params.id;
    if (!id) return res.redirect('/database');

    // read the company first so we can archive it
    const sqlGet = 'SELECT id, name, type FROM companies WHERE id = ? LIMIT 1';
    db.get(sqlGet, [id], (gErr, row) => {
      if (gErr) return next(gErr);
      if (!row) return res.redirect('/database?error=' + encodeURIComponent('Şirket bulunamadı.'));

      const deletedBy = req.session && req.session.user ? req.session.user.username : null;
      const deletedAt = new Date().toISOString();

      // ensure deleted_companies table exists
      const createSql = `CREATE TABLE IF NOT EXISTS deleted_companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_id INTEGER,
        name TEXT,
        type TEXT,
        deleted_by TEXT,
        deleted_at TEXT
      )`;

      db.run(createSql, [], (cErr) => {
        if (cErr) return next(cErr);

        const insertSql = 'INSERT INTO deleted_companies (original_id, name, type, deleted_by, deleted_at) VALUES (?, ?, ?, ?, ?)';
        db.run(insertSql, [row.id, row.name, row.type, deletedBy, deletedAt], function (iErr) {
          if (iErr) return next(iErr);

          // now delete original
          CompanyModel.delete(id, (delErr) => {
            if (delErr) {
              return res.redirect('/database?error=' + encodeURIComponent('Şirket silinirken hata oluştu.'));
            }
            // Show deletion message as a red toast per UX request
            res.redirect('/database?error=' + encodeURIComponent('Şirket silindi.'));
          });
        });
      });
    });
  },

  // Chat log management
  clearChatLogs: async (req, res) => {
    try {
      const chatHandler = require('../socket/chatHandler');
      await chatHandler.clearAllMessages();
      res.json({ success: true, message: 'Tüm chat logları silindi.' });
    } catch (error) {
      console.error('Chat logları silinirken hata:', error);
      res.status(500).json({ success: false, message: 'Chat logları silinirken hata oluştu.' });
    }
  },

  getChatStats: async (req, res) => {
    try {
      const chatHandler = require('../socket/chatHandler');
      const counts = await chatHandler.getMessageCount();
      res.json({ success: true, ...counts });
    } catch (error) {
      console.error('Chat istatistikleri alınırken hata:', error);
      res.status(500).json({ success: false, message: 'İstatistikler alınamadı.' });
    }
  }
};

module.exports = databaseController;
