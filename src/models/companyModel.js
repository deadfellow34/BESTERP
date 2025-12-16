const db = require('../config/db');

const CompanyModel = {


  // Sadece aktif şirketleri döndür
  getAll(callback) {
    const sql = 'SELECT * FROM companies ORDER BY name ASC';
    db.all(sql, [], callback);
  },

  // Create a new company with audit fields if present
  create(data, callback) {
    // data: { name, type, created_by, created_at }
    const colNames = ['name', 'type'];
    const values = [data.name, data.type];
    if (data.created_by) {
      colNames.push('created_by');
      values.push(data.created_by);
    }
    if (data.created_at) {
      colNames.push('created_at');
      values.push(data.created_at);
    }
    const sql = `INSERT INTO companies (${colNames.join(', ')}) VALUES (${colNames.map(() => '?').join(', ')})`;
    db.run(sql, values, function (err) {
      if (err) return callback(err);
      callback(null, { id: this.lastID });
    });
  },

  delete(id, callback) {
    const sql = 'DELETE FROM companies WHERE id = ?';
    db.run(sql, [id], function (err) {
      if (err) return callback(err);
      callback(null);
    });
  },
};

module.exports = CompanyModel;
