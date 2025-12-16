const db = require('../src/config/db');

db.serialize(() => {
  db.all("SELECT position_no, COUNT(1) as cnt FROM documents WHERE type IS NOT NULL AND trim(type) <> '' GROUP BY position_no ORDER BY cnt DESC LIMIT 50", [], (err, rows) => {
    if (err) {
      console.error('Error fetching docs counts (type non-empty):', err.message);
      process.exit(1);
    }

    console.log('=== Documents with non-empty type (accounting uploads) ===');
    console.log(JSON.stringify(rows, null, 2));

    // Also show counts for any documents regardless of type
    db.all("SELECT position_no, COUNT(1) as cnt FROM documents GROUP BY position_no ORDER BY cnt DESC LIMIT 50", [], (errAll, allRows) => {
      if (errAll) {
        console.error('Error fetching docs counts (all):', errAll.message);
        process.exit(1);
      }
      console.log('=== All documents by position (any type) ===');
      console.log(JSON.stringify(allRows, null, 2));

      // continue below with load positions and sample docs using the accounting rows variable
      proceedAfterCounts(rows, allRows);
    });
  });

  function proceedAfterCounts(rows, allRows) {
    db.all('SELECT DISTINCT position_no FROM loads LIMIT 40', [], (err2, loadRows) => {
      if (err2) {
        console.error('Error fetching distinct position_no from loads:', err2.message);
        process.exit(2);
      }

      console.log('=== Sample position_no values from loads ===');
      console.log(JSON.stringify(loadRows, null, 2));

      // prefer a sample position that actually has any documents (allRows), else fallback to first accounting row
      const samplePos = (allRows && allRows.length > 0) ? allRows[0].position_no : (rows && rows.length > 0 ? rows[0].position_no : null);
      if (samplePos) {
        db.all('SELECT id, position_no, type, category, filename, original_name, created_at FROM documents WHERE position_no = ? ORDER BY created_at DESC LIMIT 20', [samplePos], (err3, docs) => {
          if (err3) {
            console.error('Error fetching sample documents for position', samplePos, err3.message);
            process.exit(3);
          }
          console.log(`=== Sample documents for position ${samplePos} ===`);
          console.log(JSON.stringify(docs, null, 2));
          setTimeout(() => process.exit(0), 50);
        });
      } else {
        console.log('No documents found for any position.');
        setTimeout(() => process.exit(0), 50);
      }
    });
  }
});
