const db = require('../config/db');

const LoadItemModel = {
  create(item, callback) {
    const sql = `
      INSERT INTO load_items (
        load_id,
        goods_description,
        packages,
        pallets,
        ldm,
        gross_weight,
        net_weight,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      item.load_id,
      item.goods_description || null,
      item.packages != null ? item.packages : null,
      item.pallets != null ? item.pallets : null,
      item.ldm != null ? item.ldm : null,
      item.gross_weight != null ? item.gross_weight : null,
      item.net_weight != null ? item.net_weight : null,
      item.notes || null,
    ];

    db.run(sql, params, function (err) {
      if (err) return callback(err);
      return callback(null, this.lastID);
    });
  },

  getByLoadId(loadId, callback) {
    const sql = `SELECT * FROM load_items WHERE load_id = ? ORDER BY id ASC`;
    db.all(sql, [loadId], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows || []);
    });
  },
};

module.exports = LoadItemModel;
