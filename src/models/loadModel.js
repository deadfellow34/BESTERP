// backend/src/models/loadModel.js
const db = require('../config/db');
const NamedModel = require('./namedModel');

const LoadModel = {
  // Get available years from existing positions
  getAvailableYears(callback) {
    const sql = `
      SELECT DISTINCT substr(position_no, 1, 2) as year_prefix 
      FROM loads 
      WHERE position_no IS NOT NULL AND position_no != ''
      ORDER BY year_prefix DESC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) return callback(err);
      // Convert prefixes to full years (25 -> 2025)
      const years = (rows || []).map(r => {
        const prefix = r.year_prefix;
        return prefix ? 2000 + parseInt(prefix, 10) : null;
      }).filter(y => y !== null);
      callback(null, years);
    });
  },

  // Tüm yüklemeleri listele (YL1 ana liste)
  getAll(callback) {
    const sql = `
      SELECT
        id,
        ref,
        position_no,
        uid,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_date,
        unloading_country,
        unloading_city,
        truck_plate,
        trailer_plate,
        exit_date,
        arrival_date,
        created_by,
        created_at,
        status,
        seal_code,
        mrn_no,
        packages,
        gross_weight,
        no_expense,
        driver_name
      FROM loads
      ORDER BY created_at DESC
    `;
    db.all(sql, [], callback);
  },

  // Get loads filtered by year prefix (e.g. '25' for 2025)
  getByYearPrefix(yearPrefix, callback) {
    const likePattern = yearPrefix + '/%';
    const sql = `
      SELECT
        id,
        ref,
        position_no,
        uid,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_date,
        unloading_country,
        unloading_city,
        truck_plate,
        trailer_plate,
        exit_date,
        arrival_date,
        created_by,
        created_at,
        status,
        seal_code,
        mrn_no,
        packages,
        gross_weight,
        no_expense,
        driver_name
      FROM loads
      WHERE position_no LIKE ?
      ORDER BY created_at DESC
    `;
    db.all(sql, [likePattern], callback);
  },

  // General search across a few key fields (UID, position_no, plates, MRN, seal, customer/consignee)
  search(searchTerm, callback) {
    const like = '%' + String(searchTerm).replace(/%/g, '') + '%';
    const sql = `
      SELECT
        id,
        ref,
        position_no,
        uid,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_date,
        unloading_country,
        unloading_city,
        truck_plate,
        trailer_plate,
        exit_date,
        arrival_date,
        created_by,
        created_at,
        status,
        seal_code,
        mrn_no,
        packages,
        gross_weight,
        no_expense,
        driver_name
      FROM loads
      WHERE (uid = ?)
         OR uid LIKE ?
         OR position_no LIKE ?
         OR truck_plate LIKE ?
         OR trailer_plate LIKE ?
         OR customer_name LIKE ?
         OR consignee_name LIKE ?
         OR mrn_no LIKE ?
         OR seal_code LIKE ?
      ORDER BY created_at DESC
    `;
    const params = [String(searchTerm), like, like, like, like, like, like, like, like];
    db.all(sql, params, callback);
  },

  // Tek bir yüklemeyi detay için çek
  getById(id, callback) {
    const sql = `
      SELECT
        id,
        position_no,
        uid,
          ref,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_address,
        unloading_country,
        unloading_city,
        unloading_address,
        goods_description,
        packages,
        pallets,
        ldm,
        gross_weight,
        net_weight,
        truck_plate,
        trailer_plate,
        driver_name,
        t1_mrn,
        exit_date,
        arrival_date,
        loading_date,
        unloading_date,
        navlun_currency,
        navlun_amount,
        ydg_amount,
        fatura_kime,
        fatura_no,
        cost_currency,
        cost_amount,
        notes,
        created_by,
        created_at,
        seal_code,
        ordino_cost,
        mrn_no,
        uid,
        ref,
        no_expense
      FROM loads
      WHERE id = ?
    `;
    db.get(sql, [id], callback);
  },

  // Bir sonraki pozisyon numarasını üret (25/200-001 → 25/200-002 ...)
  getNextPositionNo(callback) {
    const sql = `
      SELECT position_no
      FROM loads
      WHERE position_no LIKE '%/%-%'
      ORDER BY id DESC
      LIMIT 1
    `;
    db.get(sql, [], (err, row) => {
      if (err) return callback(err);

      const yearCode = String(new Date().getFullYear()).slice(-2); // 2025 → "25"
      const basePrefix = `${yearCode}/200-`;

      if (!row || !row.position_no) {
        return callback(null, `${basePrefix}001`);
      }

      const last = row.position_no; // örn: "25/200-017"
      const parts = last.split('-');
      let seq = 1;

      if (parts.length === 2) {
        const numPart = parseInt(parts[1], 10);
        if (!isNaN(numPart)) {
          seq = numPart + 1;
        }
      }

      const nextSeq = String(seq).padStart(3, '0'); // 1 → "001"
      const nextPos = `${basePrefix}${nextSeq}`;
      callback(null, nextPos);
    });
  },

  // YENİ KAYIT OLUŞTUR
  create(data, callback) {
    const sql = `
      INSERT INTO loads (
        position_no,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_address,
        unloading_country,
        unloading_city,
        unloading_address,
        goods_description,
        packages,
        pallets,
        ldm,
        gross_weight,
        net_weight,
        truck_plate,
        trailer_plate,
        driver_name,
        t1_mrn,
        exit_date,
        arrival_date,
        loading_date,
        unloading_date,
        navlun_currency,
        navlun_amount,
        ydg_amount,
        fatura_kime,
        fatura_no,
        cost_currency,
        cost_amount,
        notes,
        created_by,
        seal_code,
        ordino_cost,
        mrn_no,
        uid,
        ref
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `;

    const params = [
      data.position_no,
      data.ihr_poz || null,
      data.customer_name,
      data.consignee_name,
      data.loading_country,
      data.loading_city,
      data.loading_address,
      data.unloading_country,
      data.unloading_city,
      data.unloading_address,
      data.goods_description,
      data.packages,
      data.pallets,
      data.ldm,
      data.gross_weight,
      data.net_weight,
      data.truck_plate,
      data.trailer_plate,
      data.driver_name,
      data.t1_mrn,
      data.exit_date,
      data.arrival_date,
      data.loading_date,
      data.unloading_date,
      data.navlun_currency,
      data.navlun_amount,
      data.ydg_amount,
      data.fatura_kime,
      data.fatura_no,
      data.cost_currency,
      data.cost_amount,
      data.notes,
      data.created_by,
      data.seal_code,
      data.ordino_cost || 0,
      data.mrn_no || null,
      data.uid || null,
      data.ref || null
    ];

    db.run(sql, params, function (err) {
      if (err) return callback(err);
      // If the client included the `naming` property (even if empty), persist it to the `named` table
      if (data && Object.prototype.hasOwnProperty.call(data, 'naming')) {
        try {
          NamedModel.createForLoad(this.lastID, data.naming, (nErr) => {
            if (nErr) console.error('Failed to insert named entry:', nErr.message);
            // still return the created load id regardless of named insert result
            callback(null, this.lastID);
          });
        } catch (e) {
          console.error('NamedModel insert error:', e.message);
          callback(null, this.lastID);
        }
      } else {
        callback(null, this.lastID);
      }
    });
  },

  // KAYDI GÜNCELLE
  update(id, data, callback) {
    const sql = `
      UPDATE loads
      SET
        position_no = ?,
        ihr_poz = ?,
        customer_name = ?,
        consignee_name = ?,
        loading_country = ?,
        loading_city = ?,
        loading_address = ?,
        unloading_country = ?,
        unloading_city = ?,
        unloading_address = ?,
        goods_description = ?,
        packages = ?,
        pallets = ?,
        ldm = ?,  
        gross_weight = ?,
        net_weight = ?,
        truck_plate = ?,
        trailer_plate = ?,
        driver_name = ?,
        t1_mrn = ?,
        exit_date = ?,
        arrival_date = ?,
        loading_date = ?,
        unloading_date = ?,
        ref = ?,
        navlun_currency = ?,
        navlun_amount = ?,
        ydg_amount = ?,
        fatura_kime = ?,
        fatura_no = ?,
        cost_currency = ?,
        cost_amount = ?,
        notes = ?,
        seal_code = ?,
        ordino_cost = ?,
        mrn_no = ?
      WHERE id = ?
    `;

    const params = [
      data.position_no,
      data.ihr_poz || null,
      data.customer_name,
      data.consignee_name,
      data.loading_country,
      data.loading_city,
      data.loading_address,
      data.unloading_country,
      data.unloading_city,
      data.unloading_address,
      data.goods_description,
      data.packages,
      data.pallets,
      data.ldm,
      data.gross_weight,
      data.net_weight,
      data.truck_plate,
      data.trailer_plate,
      data.driver_name,
      data.t1_mrn,
      data.exit_date,
      data.arrival_date,
      data.loading_date,
      data.unloading_date,
              data.ref || null,
      data.navlun_currency,
      data.navlun_amount,
      data.ydg_amount,
      data.fatura_kime,
      data.fatura_no,
      data.cost_currency,
      data.cost_amount,
      data.notes,
      data.seal_code,
      data.ordino_cost || 0,
      data.mrn_no || null,
      id,
    ];

    db.run(sql, params, function (err) {
      if (err) return callback(err);
      callback(null);
    });
  },

  // Aynı position_no ile tüm yükleri getir (sibling loads)
  getByPositionNo(positionNo, callback) {
    const sql = `
      SELECT
        id,
        position_no,
        uid,
        ref,
        ihr_poz,
        customer_name,
        consignee_name,
        loading_country,
        loading_city,
        loading_address,
        unloading_country,
        unloading_city,
        unloading_address,
        goods_description,
        packages,
        pallets,
        ldm,
        gross_weight,
        net_weight,
        truck_plate,
        trailer_plate,
        driver_name,
        t1_mrn,
        exit_date,
        arrival_date,
        loading_date,
        unloading_date,
        navlun_currency,
        navlun_amount,
        ydg_amount,
        fatura_kime,
        fatura_no,
        cost_currency,
        cost_amount,
        notes,
        created_by,
        created_at,
        seal_code,
        status,
        ordino_cost,
        mrn_no,
        no_expense,
        completed_rates
      FROM loads
      WHERE position_no = ?
      ORDER BY id ASC
    `;
    db.all(sql, [positionNo], callback);
  },

  // SİL
  delete(id, callback) {
    const sql = `DELETE FROM loads WHERE id = ?`;
    db.run(sql, [id], function (err) {
      if (err) return callback(err);
      callback(null);
    });
  },

  // Get recent distinct positions (for admin panel dropdown)
  getRecentPositions(limit = 50, callback) {
    const sql = `
      SELECT DISTINCT position_no
      FROM loads
      WHERE position_no IS NOT NULL AND position_no != ''
      ORDER BY created_at DESC
      LIMIT ?
    `;
    db.all(sql, [limit], callback);
  },
};

module.exports = LoadModel;
