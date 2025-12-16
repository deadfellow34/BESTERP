const db = require('./src/config/db');

const companies = [
  'WORLDWIDE BOOK SERVICES',
  'PERKINS ENGINES COMPANY LTD',
  'CUMMINS LTD',
  'MECC ALTE UK LTD',
  'BUHLER UK LTD',
  'VESUVIUS UK LTD',
  'FLUIDMASTER GB LTD',
  'OXFORD UNIVERSITY PRESS',
  'AMCOR FLEXIBLES UK LTD',
  'WEIDMANN WHITELEY LTD',
  'BASF',
  'ARLANXEO',
  'XTRALOC LTD',
  'REEDBUT GROUP LTD',
  'CATEXEL',
  'DOW EUROPE GMBH',
  'CELANESE',
  'ORTHENE CHEMICALS LTD',
  'WASP PFS LTD',
  'BIKE ALERT PLC',
  'KADANT UK',
  'BELL PLASTIC LTD',
  'OXFORD PRODUCTS LTD',
  'VIBRANTZ MINERALS',
  'IMERYS MINERALS LTD',
  'DEEP SEA ELECTRONICS',
  'MORGAN\'S POMADE COMPANY LTD',
  'COTMOR TOOL&PRESSWORK',
  'FREEMAN AUTOMOTIVE (UK) LTD.',
  'UNIFRAX (DERBY) LTD',
  'INGREDIENTS UK LTD',
  'BIRMINGHAM SEALS CO LTD',
  'VISUAL COMFORT EUROPE LTD',
  'ROSCOLAB LIMITED',
  'FALCON SAFETY PRODUCTS',
  'BARBIZON EUROPE LTD',
  'MINCHEM HMP LTD',
  'HOLMEN BOARD AND PAPER LTD',
  'AMG CHROME LTD',
  'KEELING & WALKER LTD',
  'BARRY CALLEBAUT FRANCE',
  'CARTELL UK LTD',
  'PERFECTOS PRINTING INKS CO LTD',
  'EATON ELECTRICAL PRODUCTS LTD',
  'ENVALIOR DEUTSCHLAND',
  'BRITISH STEEL LTD',
  'DUPONT SPECIALTY PRODUCTS',
  'GRUPO ANTOLIN CAMBRAI'
];

let idx = 0;

function upsertNext() {
  if (idx >= companies.length) {
    console.log('Sender seed completed.');
    db.close(() => process.exit(0));
    return;
  }

  const name = companies[idx++];

  // Insert if missing with type 'sender'
  const insertSql = 'INSERT OR IGNORE INTO companies (name, type) VALUES (?, ?)';
  db.run(insertSql, [name, 'sender'], function (err) {
    if (err) {
      console.error('Insert error for', name, err.message);
      upsertNext();
      return;
    }

    // If a row existed with type 'receiver' we want to make it 'both'
    const fixSql = `
      UPDATE companies
      SET type = CASE
        WHEN type = 'receiver' THEN 'both'
        WHEN type IS NULL OR type = '' THEN 'sender'
        ELSE type
      END
      WHERE name = ?
    `;

    db.run(fixSql, [name], function (err2) {
      if (err2) {
        console.error('Update error for', name, err2.message);
      } else {
        console.log('Upserted:', name);
      }
      upsertNext();
    });
  });
}

upsertNext();
