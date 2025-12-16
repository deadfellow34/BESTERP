// backend/src/models/trailerModel.js
const db = require('../config/db');

const TrailerModel = {
  getAll(callback) {
    const sql = `
      SELECT id, plate
      FROM trailers
      WHERE active = 1
      ORDER BY plate ASC
    `;
    db.all(sql, [], callback);
  },
};

module.exports = TrailerModel;
