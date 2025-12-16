const db = require('../config/db');

const InvoiceCompanyModel = {
  getAll(callback) {
    const sql = 'SELECT id, name FROM invoice_companies ORDER BY name ASC';
    db.all(sql, [], callback);
  },

  addCompany(name, callback) {
    const sql = 'INSERT INTO invoice_companies (name) VALUES (?)';
    db.run(sql, [name], function (err) {
      if (err) return callback(err);
      callback(null, { id: this.lastID, name });
    });
  },
};

module.exports = InvoiceCompanyModel;
