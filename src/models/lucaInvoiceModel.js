/**
 * Luca e-Fatura Model
 * 
 * Bu model Luca üzerinden oluşturulan e-faturaları yerel veritabanında takip eder.
 */

const db = require('../config/db');

const LucaInvoiceModel = {
  /**
   * Tablo oluştur
   */
  createTable(callback) {
    const sql = `
      CREATE TABLE IF NOT EXISTS luca_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        -- Luca referansları
        luca_invoice_id TEXT,
        luca_ettn TEXT UNIQUE,
        luca_invoice_number TEXT,
        luca_company_id REAL,
        
        -- Pozisyon bağlantısı
        position_id INTEGER,
        position_no TEXT,
        
        -- Fatura bilgileri
        invoice_type TEXT DEFAULT 'SATIS',
        scenario_type TEXT DEFAULT 'TEMEL',
        recipient_type TEXT DEFAULT 'EFATURA',
        
        -- Alıcı bilgileri
        recipient_name TEXT,
        recipient_vkn TEXT,
        recipient_address TEXT,
        
        -- Tutarlar
        currency_code TEXT DEFAULT 'TRY',
        cross_rate REAL DEFAULT 1,
        subtotal REAL DEFAULT 0,
        vat_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        
        -- Durum
        status TEXT DEFAULT 'draft',
        sent_at TEXT,
        approved_at TEXT,
        cancelled_at TEXT,
        cancel_reason TEXT,
        
        -- PDF/XML dosya yolları
        pdf_path TEXT,
        xml_path TEXT,
        
        -- Notlar
        notes TEXT,
        error_message TEXT,
        
        -- Meta
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key
        FOREIGN KEY (position_id) REFERENCES loads(id)
      )
    `;
    
    db.run(sql, [], (err) => {
      if (err) {
        console.error('[LucaInvoiceModel] Tablo oluşturma hatası:', err);
        return callback && callback(err);
      }
      
      // İndeksler
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_luca_invoices_ettn ON luca_invoices(luca_ettn)',
        'CREATE INDEX IF NOT EXISTS idx_luca_invoices_position_id ON luca_invoices(position_id)',
        'CREATE INDEX IF NOT EXISTS idx_luca_invoices_status ON luca_invoices(status)',
        'CREATE INDEX IF NOT EXISTS idx_luca_invoices_created_at ON luca_invoices(created_at)'
      ];
      
      let completed = 0;
      indexes.forEach(indexSql => {
        db.run(indexSql, [], () => {
          completed++;
          if (completed === indexes.length) {
            console.log('[LucaInvoiceModel] Tablo ve indeksler oluşturuldu');
            callback && callback(null);
          }
        });
      });
    });
  },

  /**
   * Yeni fatura kaydı oluştur
   */
  create(data, callback) {
    const sql = `
      INSERT INTO luca_invoices (
        luca_invoice_id, luca_ettn, luca_invoice_number, luca_company_id,
        position_id, position_no,
        invoice_type, scenario_type, recipient_type,
        recipient_name, recipient_vkn, recipient_address,
        currency_code, cross_rate, subtotal, vat_amount, total_amount,
        status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      data.luca_invoice_id,
      data.luca_ettn,
      data.luca_invoice_number,
      data.luca_company_id,
      data.position_id,
      data.position_no,
      data.invoice_type || 'SATIS',
      data.scenario_type || 'TEMEL',
      data.recipient_type || 'EFATURA',
      data.recipient_name,
      data.recipient_vkn,
      data.recipient_address,
      data.currency_code || 'TRY',
      data.cross_rate || 1,
      data.subtotal || 0,
      data.vat_amount || 0,
      data.total_amount || 0,
      data.status || 'draft',
      data.notes,
      data.created_by
    ];
    
    db.run(sql, params, function(err) {
      if (err) return callback(err);
      callback(null, { id: this.lastID, ...data });
    });
  },

  /**
   * ETTN ile fatura bul
   */
  findByEttn(ettn, callback) {
    const sql = 'SELECT * FROM luca_invoices WHERE luca_ettn = ?';
    db.get(sql, [ettn], callback);
  },

  /**
   * ID ile fatura bul
   */
  findById(id, callback) {
    const sql = 'SELECT * FROM luca_invoices WHERE id = ?';
    db.get(sql, [id], callback);
  },

  /**
   * Pozisyon ID ile faturaları bul
   */
  findByPositionId(positionId, callback) {
    const sql = 'SELECT * FROM luca_invoices WHERE position_id = ? ORDER BY created_at DESC';
    db.all(sql, [positionId], callback);
  },

  /**
   * Tüm faturaları listele (filtreli)
   */
  getAll(filters = {}, callback) {
    let sql = 'SELECT * FROM luca_invoices WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.startDate) {
      sql += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      sql += ' AND created_at <= ?';
      params.push(filters.endDate);
    }
    
    if (filters.recipientVkn) {
      sql += ' AND recipient_vkn = ?';
      params.push(filters.recipientVkn);
    }
    
    if (filters.search) {
      sql += ' AND (recipient_name LIKE ? OR luca_invoice_number LIKE ? OR position_no LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }
    
    db.all(sql, params, callback);
  },

  /**
   * Fatura güncelle
   */
  update(id, data, callback) {
    const fields = [];
    const params = [];
    
    const allowedFields = [
      'luca_invoice_id', 'luca_ettn', 'luca_invoice_number',
      'status', 'sent_at', 'approved_at', 'cancelled_at', 'cancel_reason',
      'pdf_path', 'xml_path', 'notes', 'error_message'
    ];
    
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    });
    
    if (fields.length === 0) {
      return callback(null, { changes: 0 });
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const sql = `UPDATE luca_invoices SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  },

  /**
   * Durumu güncelle
   */
  updateStatus(id, status, callback) {
    const now = new Date().toISOString();
    let extraField = '';
    
    if (status === 'sent') {
      extraField = ', sent_at = ?';
    } else if (status === 'approved') {
      extraField = ', approved_at = ?';
    } else if (status === 'cancelled') {
      extraField = ', cancelled_at = ?';
    }
    
    const sql = `UPDATE luca_invoices SET status = ?, updated_at = CURRENT_TIMESTAMP${extraField} WHERE id = ?`;
    const params = extraField ? [status, now, id] : [status, id];
    
    db.run(sql, params, function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  },

  /**
   * PDF yolunu güncelle
   */
  updatePdfPath(id, pdfPath, callback) {
    const sql = 'UPDATE luca_invoices SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    db.run(sql, [pdfPath, id], function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  },

  /**
   * Fatura sil
   */
  delete(id, callback) {
    const sql = 'DELETE FROM luca_invoices WHERE id = ?';
    db.run(sql, [id], function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  },

  /**
   * İstatistikler
   */
  getStats(callback) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(total_amount) as total_amount,
        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) as active_total
      FROM luca_invoices
    `;
    db.get(sql, [], callback);
  },

  /**
   * Aylık özet
   */
  getMonthlySummary(year, callback) {
    const sql = `
      SELECT 
        strftime('%m', created_at) as month,
        COUNT(*) as count,
        SUM(total_amount) as total,
        SUM(vat_amount) as vat_total
      FROM luca_invoices
      WHERE strftime('%Y', created_at) = ? AND status != 'cancelled'
      GROUP BY strftime('%m', created_at)
      ORDER BY month
    `;
    db.all(sql, [year.toString()], callback);
  }
};

module.exports = LucaInvoiceModel;
