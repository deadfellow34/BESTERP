const db = require('../config/db');

const TruckNoteModel = {
  ensureTable(cb) {
    const sql = `CREATE TABLE IF NOT EXISTS truck_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;
    db.run(sql, [], cb);
  },

  addNote(truckId, note, createdBy, cb) {
    this.ensureTable((err) => {
      if (err) return cb(err);
      const sql = 'INSERT INTO truck_notes (truck_id, note, created_by) VALUES (?, ?, ?)';
      db.run(sql, [truckId, note, createdBy || null], function (e) {
        if (e) return cb(e);
        return cb(null, { id: this.lastID });
      });
    });
  },

  getNotesForTruck(truckId, cb) {
    this.ensureTable((err) => {
      if (err) return cb(err);
      const sql = 'SELECT id, truck_id, note, created_by, created_at FROM truck_notes WHERE truck_id = ? ORDER BY created_at DESC';
      db.all(sql, [truckId], cb);
    });
  }
  ,

  updateNote(noteId, text, cb) {
    this.ensureTable((err) => {
      if (err) return cb(err);
      const sql = 'UPDATE truck_notes SET note = ? WHERE id = ?';
      db.run(sql, [text, noteId], function (e) {
        if (e) return cb(e);
        return cb(null, { changes: this.changes });
      });
    });
  }
  ,

  deleteNote(noteId, cb) {
    this.ensureTable((err) => {
      if (err) return cb(err);
      const sql = 'DELETE FROM truck_notes WHERE id = ?';
      db.run(sql, [noteId], function (e) {
        if (e) return cb(e);
        return cb(null, { changes: this.changes });
      });
    });
  }
};

module.exports = TruckNoteModel;
