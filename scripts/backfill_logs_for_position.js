const LogModel = require('../src/models/logModel');
const db = require('../src/config/db');
const pos = process.argv[2];
if (!pos) {
  console.error('Usage: node scripts/backfill_logs_for_position.js "<positionNo>"');
  process.exit(1);
}

const username = process.env.USER || process.env.USERNAME || 'system';

db.get('SELECT * FROM loads WHERE position_no = ? LIMIT 1', [pos], (err, row) => {
  if (err) {
    console.error('Error reading loads:', err.message);
    return process.exit(2);
  }
  if (!row) {
    console.error('Position not found:', pos);
    return process.exit(3);
  }

  const entries = [];
  if (row.mrn_no) entries.push({ field: 'mrn_no', new_value: row.mrn_no });
  if (row.seal_code) entries.push({ field: 'seal_code', new_value: row.seal_code });
  if (row.truck_plate) entries.push({ field: 'truck_plate', new_value: row.truck_plate });
  if (row.trailer_plate) entries.push({ field: 'trailer_plate', new_value: row.trailer_plate });

  if (entries.length === 0) {
    console.log('No values to backfill for position', pos);
    return process.exit(0);
  }

  let done = 0;
  entries.forEach(e => {
    LogModel.create({
      username,
      role: 'system',
      entity: 'position',
      entity_id: pos,
      action: 'backfill',
      field: e.field,
      old_value: null,
      new_value: e.new_value
    }, (err2, id) => {
      if (err2) console.error('Log insert error for', e.field, err2.message);
      else console.log('Inserted log id', id, 'for', e.field);
      done++;
      if (done === entries.length) process.exit(0);
    });
  });
});
