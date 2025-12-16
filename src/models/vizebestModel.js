const db = require('../config/db');

const VizeBestModel = {
  getAll(callback) {
    const sql = `SELECT id, name, dob, hire, ukvisa, schengen, visa_country as visaCountry, license_exp, insurance_exp, src3, src5, psycho, tacho, passport_exp, notes, created_at FROM vizebest_entries WHERE deleted_at IS NULL ORDER BY id`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('VizeBest getAll error:', err);
        return callback(err, null);
      }
      callback(null, rows || []);
    });
  },

  getDeleted(callback) {
    const sql = `SELECT id, name, dob, hire, ukvisa, schengen, visa_country as visaCountry, license_exp, insurance_exp, src3, src5, psycho, tacho, passport_exp, notes, created_at, deleted_at FROM vizebest_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('VizeBest getDeleted error:', err);
        return callback(err, null);
      }
      callback(null, rows || []);
    });
  },

  create(data, callback) {
    const sql = `INSERT INTO vizebest_entries (name,dob,hire,ukvisa,schengen,visa_country,license_exp,insurance_exp,src3,src5,psycho,tacho,passport_exp,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const params = [data.name || null, data.dob || null, data.hire || null, data.ukvisa || null, data.schengen || null, data.visaCountry || null, data.license_exp || null, data.insurance_exp || null, data.src3 || null, data.src5 || null, data.psycho || null, data.tacho || null, data.passport_exp || null, data.notes || null];
    db.run(sql, params, function(err) {
      if (err) {
        console.error('VizeBest create error:', err);
        return callback(err, null);
      }
      // return the created row id
      callback(null, { id: this.lastID });
    });
  },

  update(id, data, callback) {
    const sql = `UPDATE vizebest_entries SET name=?, dob=?, hire=?, ukvisa=?, schengen=?, visa_country=?, license_exp=?, insurance_exp=?, src3=?, src5=?, psycho=?, tacho=?, passport_exp=?, notes=? WHERE id = ?`;
    const params = [data.name || null, data.dob || null, data.hire || null, data.ukvisa || null, data.schengen || null, data.visaCountry || null, data.license_exp || null, data.insurance_exp || null, data.src3 || null, data.src5 || null, data.psycho || null, data.tacho || null, data.passport_exp || null, data.notes || null, id];
    db.run(sql, params, function(err) {
      if (err) {
        console.error('VizeBest update error:', err);
        return callback(err);
      }
      callback(null);
    });
  },

  delete(id, callback) {
    // Soft delete - set deleted_at timestamp
    const sql = `UPDATE vizebest_entries SET deleted_at = datetime('now') WHERE id = ?`;
    db.run(sql, [id], function(err) {
      if (err) {
        console.error('VizeBest delete error:', err);
        return callback(err);
      }
      callback(null);
    });
  },

  restore(id, callback) {
    // Restore a soft-deleted entry
    const sql = `UPDATE vizebest_entries SET deleted_at = NULL WHERE id = ?`;
    db.run(sql, [id], function(err) {
      if (err) {
        console.error('VizeBest restore error:', err);
        return callback(err);
      }
      callback(null);
    });
  },

  permanentDelete(id, callback) {
    // Permanently delete entry
    const sql = `DELETE FROM vizebest_entries WHERE id = ?`;
    db.run(sql, [id], function(err) {
      if (err) {
        console.error('VizeBest permanentDelete error:', err);
        return callback(err);
      }
      callback(null);
    });
  }
};

module.exports = VizeBestModel;
