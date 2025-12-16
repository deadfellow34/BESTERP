const db = require('../config/db');

const TruckModel = {
  getAll(callback) {
    const sql = `
      SELECT id, plate, driver_name
      FROM trucks
      WHERE active = 1
      ORDER BY plate ASC
    `;
    db.all(sql, [], callback);
  },
};

module.exports = TruckModel;
