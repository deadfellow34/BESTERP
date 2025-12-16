const db = require('../config/db');

const ExpenseModel = {
  // Pozisyona ait tüm masrafları getir
  getByPositionNo(positionNo, callback) {
    const sql = `SELECT * FROM position_expenses WHERE position_no = ? ORDER BY created_at DESC`;
    db.all(sql, [positionNo], callback);
  },

  // Yeni masraf ekle
  create(data, callback) {
    const sql = `
      INSERT INTO position_expenses (position_no, expense_type, cost_amount, cost_currency, notes)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [
        data.position_no,
        data.expense_type,
        data.cost_amount,
        data.cost_currency || 'EUR',
        data.notes || null
      ],
      function (err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      }
    );
  },

  // Masraf sil
  delete(id, callback) {
    const sql = `DELETE FROM position_expenses WHERE id = ?`;
    db.run(sql, [id], callback);
  },

  // Pozisyona ait tüm masrafları sil
  deleteByPosition(positionNo, callback) {
    const sql = `DELETE FROM position_expenses WHERE position_no = ?`;
    db.run(sql, [positionNo], callback);
  },

  // Pozisyona ait masraf toplamını hesapla (expense_type'a göre)
  getSumByPositionAndType(positionNo, expenseType, callback) {
    const sql = `
      SELECT SUM(cost_amount) as total 
      FROM position_expenses 
      WHERE position_no = ? AND expense_type = ?
    `;
    db.get(sql, [positionNo, expenseType], (err, row) => {
      if (err) return callback(err);
      callback(null, row ? (row.total || 0) : 0);
    });
  }
};

module.exports = ExpenseModel;
