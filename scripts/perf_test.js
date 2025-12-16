/**
 * better-sqlite3 AĞIR PERFORMANS TESTİ
 * Kullanım: node perf_test.js
 */
const db = require('./src/config/db');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║     BETTER-SQLITE3 AĞIR PERFORMANS TESTİ                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const results = {};

function formatMs(ms) {
  return ms.toLocaleString() + ' ms';
}

function formatOps(count, ms) {
  const opsPerSec = Math.round((count / ms) * 1000);
  return opsPerSec.toLocaleString() + ' ops/sec';
}

async function runTests() {
  
  // ═══════════════════════════════════════════════════════════
  // TEST 1: 1000x SELECT tek kayıt
  // ═══════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: 1000x SELECT tek kayıt');
  const start1 = Date.now();
  for (let i = 0; i < 1000; i++) {
    db.getSync('SELECT * FROM loads WHERE id = ?', [(i % 87) + 1]);
  }
  results.test1 = Date.now() - start1;
  console.log('   Süre:', formatMs(results.test1));
  console.log('   Hız:', formatOps(1000, results.test1));

  // ═══════════════════════════════════════════════════════════
  // TEST 2: 500x Full table scan (tüm loads)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: 500x Full table scan');
  const start2 = Date.now();
  for (let i = 0; i < 500; i++) {
    db.allSync('SELECT * FROM loads');
  }
  results.test2 = Date.now() - start2;
  console.log('   Süre:', formatMs(results.test2));
  console.log('   Hız:', formatOps(500, results.test2));

  // ═══════════════════════════════════════════════════════════
  // TEST 3: 1000x INSERT + UPDATE + DELETE (Transaction)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 3: 1000x INSERT + UPDATE + DELETE');
  const start3 = Date.now();
  db.exec('BEGIN TRANSACTION');
  for (let i = 0; i < 1000; i++) {
    const res = db.runSync('INSERT INTO logs (username, action, entity, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)', 
      ['STRESS_TEST', 'benchmark-' + i, 'performance', 'value', 'old_' + i, 'new_' + i]);
    db.runSync('UPDATE logs SET action = ? WHERE id = ?', ['updated-' + i, res.lastID]);
    db.runSync('DELETE FROM logs WHERE id = ?', [res.lastID]);
  }
  db.exec('COMMIT');
  results.test3 = Date.now() - start3;
  console.log('   Süre:', formatMs(results.test3));
  console.log('   Hız:', formatOps(3000, results.test3), '(3 op/iteration)');

  // ═══════════════════════════════════════════════════════════
  // TEST 4: 200x Çoklu tablo JOIN + Subquery
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 4: 200x Çoklu JOIN + Subquery');
  const start4 = Date.now();
  for (let i = 0; i < 200; i++) {
    db.allSync(`
      SELECT 
        l.id, l.position_no, l.customer_name, l.consignee_name,
        l.truck_plate, l.trailer_plate, l.driver_name,
        l.navlun_amount, l.navlun_currency,
        (SELECT COUNT(*) FROM documents d WHERE d.position_no = l.position_no) as doc_count,
        (SELECT SUM(cost_amount) FROM position_expenses pe WHERE pe.position_no = l.position_no) as total_expense,
        (SELECT COUNT(*) FROM logs lg WHERE lg.entity_id_text = l.position_no) as log_count
      FROM loads l
      WHERE l.created_at > '2024-01-01'
      ORDER BY l.created_at DESC
      LIMIT 50
    `);
  }
  results.test4 = Date.now() - start4;
  console.log('   Süre:', formatMs(results.test4));
  console.log('   Hız:', formatOps(200, results.test4));

  // ═══════════════════════════════════════════════════════════
  // TEST 5: 500x LIKE arama (pattern matching)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 5: 500x LIKE pattern arama');
  const patterns = ['%BEST%', '%LOG%', '%TRANS%', '%CARGO%', '%25-200%'];
  const start5 = Date.now();
  for (let i = 0; i < 500; i++) {
    const pattern = patterns[i % patterns.length];
    db.allSync(`
      SELECT id, position_no, customer_name, consignee_name 
      FROM loads 
      WHERE customer_name LIKE ? OR consignee_name LIKE ? OR position_no LIKE ?
    `, [pattern, pattern, pattern]);
  }
  results.test5 = Date.now() - start5;
  console.log('   Süre:', formatMs(results.test5));
  console.log('   Hız:', formatOps(500, results.test5));

  // ═══════════════════════════════════════════════════════════
  // TEST 6: 100x Aggregate fonksiyonlar (GROUP BY, SUM, COUNT, AVG)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 6: 100x Aggregate (GROUP BY, SUM, COUNT)');
  const start6 = Date.now();
  for (let i = 0; i < 100; i++) {
    db.allSync(`
      SELECT 
        customer_name,
        COUNT(*) as load_count,
        SUM(navlun_amount) as total_navlun,
        AVG(gross_weight) as avg_weight,
        MIN(created_at) as first_load,
        MAX(created_at) as last_load
      FROM loads
      WHERE navlun_amount IS NOT NULL
      GROUP BY customer_name
      HAVING COUNT(*) > 0
      ORDER BY total_navlun DESC
    `);
  }
  results.test6 = Date.now() - start6;
  console.log('   Süre:', formatMs(results.test6));
  console.log('   Hız:', formatOps(100, results.test6));

  // ═══════════════════════════════════════════════════════════
  // TEST 7: 2000x Prepared Statement (aynı sorgu tekrar)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 7: 2000x Prepared Statement');
  const stmt = db.prepare('SELECT id, position_no, customer_name, truck_plate FROM loads WHERE id = ?');
  const start7 = Date.now();
  for (let i = 0; i < 2000; i++) {
    stmt.get((i % 87) + 1);
  }
  results.test7 = Date.now() - start7;
  console.log('   Süre:', formatMs(results.test7));
  console.log('   Hız:', formatOps(2000, results.test7));

  // ═══════════════════════════════════════════════════════════
  // TEST 8: 50x Çoklu tablo count (tüm tablolar)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 8: 50x Tüm tablo sayımları');
  const start8 = Date.now();
  for (let i = 0; i < 50; i++) {
    db.getSync('SELECT COUNT(*) as c FROM loads');
    db.getSync('SELECT COUNT(*) as c FROM documents');
    db.getSync('SELECT COUNT(*) as c FROM logs');
    db.getSync('SELECT COUNT(*) as c FROM position_expenses');
    db.getSync('SELECT COUNT(*) as c FROM users');
    db.getSync('SELECT COUNT(*) as c FROM trucks');
    db.getSync('SELECT COUNT(*) as c FROM trailers');
    db.getSync('SELECT COUNT(*) as c FROM seals');
    db.getSync('SELECT COUNT(*) as c FROM companies');
    db.getSync('SELECT COUNT(*) as c FROM vizebest_entries');
  }
  results.test8 = Date.now() - start8;
  console.log('   Süre:', formatMs(results.test8));
  console.log('   Hız:', formatOps(500, results.test8), '(10 tablo/iteration)');

  // ═══════════════════════════════════════════════════════════
  // TEST 9: 100x Büyük INSERT batch (transaction içinde)
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 9: 5000 INSERT batch (transaction)');
  const insertStmt = db.prepare('INSERT INTO logs (username, action, entity, field) VALUES (?, ?, ?, ?)');
  const start9 = Date.now();
  db.exec('BEGIN TRANSACTION');
  const insertedIds = [];
  for (let i = 0; i < 5000; i++) {
    const res = insertStmt.run('BATCH_TEST', 'insert-' + i, 'stress', 'field-' + i);
    insertedIds.push(res.lastInsertRowid);
  }
  db.exec('COMMIT');
  results.test9_insert = Date.now() - start9;
  console.log('   INSERT Süre:', formatMs(results.test9_insert));
  console.log('   INSERT Hız:', formatOps(5000, results.test9_insert));
  
  // Temizlik
  const start9b = Date.now();
  db.exec('BEGIN TRANSACTION');
  const deleteStmt = db.prepare('DELETE FROM logs WHERE id = ?');
  for (const id of insertedIds) {
    deleteStmt.run(id);
  }
  db.exec('COMMIT');
  results.test9_delete = Date.now() - start9b;
  console.log('   DELETE Süre:', formatMs(results.test9_delete));
  console.log('   DELETE Hız:', formatOps(5000, results.test9_delete));

  // ═══════════════════════════════════════════════════════════
  // TEST 10: Concurrent-like okuma/yazma simülasyonu
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 10: 500x Mixed read/write');
  const start10 = Date.now();
  for (let i = 0; i < 500; i++) {
    // Read
    db.getSync('SELECT * FROM loads WHERE id = ?', [(i % 87) + 1]);
    db.allSync('SELECT id, position_no FROM loads LIMIT 10');
    
    // Write (log)
    const res = db.runSync('INSERT INTO logs (username, action, entity) VALUES (?, ?, ?)', 
      ['MIXED_TEST', 'action-' + i, 'test']);
    
    // Read again
    db.getSync('SELECT COUNT(*) as c FROM logs WHERE id > ?', [res.lastID - 100]);
    
    // Delete
    db.runSync('DELETE FROM logs WHERE id = ?', [res.lastID]);
  }
  results.test10 = Date.now() - start10;
  console.log('   Süre:', formatMs(results.test10));
  console.log('   Hız:', formatOps(2500, results.test10), '(5 op/iteration)');

  // ═══════════════════════════════════════════════════════════
  // SONUÇLAR
  // ═══════════════════════════════════════════════════════════
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    SONUÇ ÖZETİ                            ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  
  const totalTime = Object.values(results).reduce((a, b) => a + b, 0);
  console.log('║  Toplam test süresi: ' + formatMs(totalTime).padEnd(37) + '║');
  console.log('║                                                           ║');
  console.log('║  Test 1  (1000x SELECT):        ' + formatMs(results.test1).padEnd(24) + '║');
  console.log('║  Test 2  (500x Full scan):      ' + formatMs(results.test2).padEnd(24) + '║');
  console.log('║  Test 3  (1000x CRUD):          ' + formatMs(results.test3).padEnd(24) + '║');
  console.log('║  Test 4  (200x JOIN+Subquery):  ' + formatMs(results.test4).padEnd(24) + '║');
  console.log('║  Test 5  (500x LIKE search):    ' + formatMs(results.test5).padEnd(24) + '║');
  console.log('║  Test 6  (100x Aggregate):      ' + formatMs(results.test6).padEnd(24) + '║');
  console.log('║  Test 7  (2000x Prepared):      ' + formatMs(results.test7).padEnd(24) + '║');
  console.log('║  Test 8  (500x Multi-count):    ' + formatMs(results.test8).padEnd(24) + '║');
  console.log('║  Test 9  (5000 Batch INSERT):   ' + formatMs(results.test9_insert).padEnd(24) + '║');
  console.log('║  Test 10 (500x Mixed R/W):      ' + formatMs(results.test10).padEnd(24) + '║');
  console.log('║                                                           ║');
  console.log('║  Eski sqlite3 ile bu testler 5-10x daha yavaş olurdu!     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
}

runTests().catch(console.error);
