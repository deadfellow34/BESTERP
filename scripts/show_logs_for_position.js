const db = require('../src/config/db');
const pos = process.argv[2];
if (!pos) {
  console.error('Usage: node scripts/show_logs_for_position.js "<positionNo>"');
  process.exit(1);
}

db.serialize(() => {
  const sql = `SELECT id, username, role, entity, entity_id, entity_id_text, action, field, old_value, new_value, created_at FROM logs WHERE (entity = 'position' AND (entity_id = ? OR entity_id_text = ?)) OR (entity = 'load' AND (entity_id IN (SELECT id FROM loads WHERE position_no = ?) OR entity_id_text = ?)) ORDER BY created_at DESC`;
  db.all(sql, [pos, pos, pos, pos], (err, rows) => {
    if (err) {
      console.error('Error querying logs:', err.message);
      return process.exit(2);
    }
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  });
});
