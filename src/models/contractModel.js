/**
 * Contract Model
 * Handles CRUD operations for contracts table
 */

const db = require('../config/db');

// Sözleşme türleri
const CONTRACT_TYPES = {
  transport: 'Taşıma Sözleşmesi',
  rental: 'Kiralama Sözleşmesi',
  insurance: 'Sigorta Sözleşmesi',
  service: 'Hizmet Sözleşmesi',
  supplier: 'Tedarikçi Sözleşmesi',
  customer: 'Müşteri Sözleşmesi',
  partnership: 'Ortaklık Sözleşmesi',
  other: 'Diğer'
};

// Sözleşme durumları
const CONTRACT_STATUSES = {
  active: 'Aktif',
  passive: 'Pasif',
  expired: 'Süresi Dolmuş',
  cancelled: 'İptal Edildi',
  renewed: 'Yenilendi'
};

// Para birimleri
const CURRENCIES = ['EUR', 'USD', 'TRY', 'GBP'];

const ContractModel = {
  // Constants
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  CURRENCIES,

  /**
   * Get all contracts ordered by created_at DESC
   * @param {Function} callback - (err, rows)
   */
  getAll(callback) {
    const sql = `
      SELECT 
        id,
        title,
        description,
        file_name,
        file_path,
        start_date,
        expiry_date,
        contract_type,
        status,
        contract_value,
        currency,
        party_name,
        party_contact,
        party_email,
        created_at,
        created_by
      FROM contracts
      ORDER BY created_at DESC
    `;
    db.all(sql, [], callback);
  },

  /**
   * Get contracts by status
   * @param {string} status - Contract status
   * @param {Function} callback - (err, rows)
   */
  getByStatus(status, callback) {
    const sql = `
      SELECT * FROM contracts 
      WHERE status = ?
      ORDER BY expiry_date ASC
    `;
    db.all(sql, [status], callback);
  },

  /**
   * Get contracts expiring within X days
   * @param {number} days - Number of days
   * @param {Function} callback - (err, rows)
   */
  getExpiringSoon(days, callback) {
    const sql = `
      SELECT * FROM contracts 
      WHERE status = 'active'
        AND expiry_date IS NOT NULL
        AND date(expiry_date) <= date('now', '+' || ? || ' days')
        AND date(expiry_date) >= date('now')
      ORDER BY expiry_date ASC
    `;
    db.all(sql, [days], callback);
  },

  /**
   * Get expired contracts (auto-update status)
   * @param {Function} callback - (err, rows)
   */
  getExpired(callback) {
    // First update expired contracts
    const updateSql = `
      UPDATE contracts 
      SET status = 'expired'
      WHERE status = 'active'
        AND expiry_date IS NOT NULL
        AND date(expiry_date) < date('now')
    `;
    db.run(updateSql, [], (err) => {
      if (err) console.error('[ContractModel] Error updating expired:', err);
      
      // Then return expired list
      const sql = `SELECT * FROM contracts WHERE status = 'expired' ORDER BY expiry_date DESC`;
      db.all(sql, [], callback);
    });
  },

  /**
   * Get a single contract by ID
   * @param {number} id - Contract ID
   * @param {Function} callback - (err, row)
   */
  getById(id, callback) {
    const sql = `
      SELECT 
        id,
        title,
        description,
        file_name,
        file_path,
        start_date,
        expiry_date,
        contract_type,
        status,
        contract_value,
        currency,
        party_name,
        party_contact,
        party_email,
        created_at,
        created_by
      FROM contracts
      WHERE id = ?
    `;
    db.get(sql, [id], callback);
  },

  /**
   * Create a new contract
   * @param {Object} data - Contract data
   * @param {Function} callback - (err, result)
   */
  create(data, callback) {
    const { 
      title, description, fileName, filePath, createdBy,
      startDate, expiryDate, contractType, status,
      contractValue, currency, partyName, partyContact, partyEmail
    } = data;
    const createdAt = new Date().toISOString();
    
    const sql = `
      INSERT INTO contracts (
        title, description, file_name, file_path, created_at, created_by,
        start_date, expiry_date, contract_type, status,
        contract_value, currency, party_name, party_contact, party_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
      title, 
      description || null, 
      fileName, 
      filePath, 
      createdAt, 
      createdBy || null,
      startDate || null,
      expiryDate || null,
      contractType || 'other',
      status || 'active',
      contractValue || null,
      currency || 'EUR',
      partyName || null,
      partyContact || null,
      partyEmail || null
    ], function(err) {
      if (err) return callback(err);
      callback(null, { id: this.lastID, createdAt });
    });
  },

  /**
   * Update a contract
   * @param {number} id - Contract ID
   * @param {Object} data - Updated fields
   * @param {Function} callback - (err)
   */
  update(id, data, callback) {
    const { 
      title, description, startDate, expiryDate, contractType, status,
      contractValue, currency, partyName, partyContact, partyEmail
    } = data;
    const sql = `
      UPDATE contracts
      SET title = ?, description = ?, start_date = ?, expiry_date = ?,
          contract_type = ?, status = ?, contract_value = ?, currency = ?,
          party_name = ?, party_contact = ?, party_email = ?
      WHERE id = ?
    `;
    db.run(sql, [
      title, description || null, startDate || null, expiryDate || null,
      contractType || 'other', status || 'active', contractValue || null, currency || 'EUR',
      partyName || null, partyContact || null, partyEmail || null, id
    ], callback);
  },

  /**
   * Update contract status
   * @param {number} id - Contract ID
   * @param {string} status - New status
   * @param {Function} callback - (err)
   */
  updateStatus(id, status, callback) {
    const sql = 'UPDATE contracts SET status = ? WHERE id = ?';
    db.run(sql, [status, id], callback);
  },

  /**
   * Delete a contract by ID
   * @param {number} id - Contract ID
   * @param {Function} callback - (err)
   */
  deleteById(id, callback) {
    const sql = 'DELETE FROM contracts WHERE id = ?';
    db.run(sql, [id], function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  },

  /**
   * Get contract statistics
   * @param {Function} callback - (err, stats)
   */
  getStats(callback) {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN status = 'passive' THEN 1 ELSE 0 END) as passive,
        SUM(CASE WHEN status = 'active' AND expiry_date IS NOT NULL 
            AND date(expiry_date) <= date('now', '+30 days') 
            AND date(expiry_date) >= date('now') THEN 1 ELSE 0 END) as expiring_soon
      FROM contracts
    `;
    db.get(sql, [], callback);
  },

  // ==================== FILE MANAGEMENT ====================

  /**
   * Get all files for a contract
   * @param {number} contractId - Contract ID
   * @param {Function} callback - (err, rows)
   */
  getFilesByContractId(contractId, callback) {
    const sql = `
      SELECT * FROM contract_files 
      WHERE contract_id = ?
      ORDER BY version DESC, uploaded_at DESC
    `;
    db.all(sql, [contractId], callback);
  },

  /**
   * Get the latest file for a contract
   * @param {number} contractId - Contract ID
   * @param {Function} callback - (err, file)
   */
  getLatestFile(contractId, callback) {
    const sql = `
      SELECT * FROM contract_files 
      WHERE contract_id = ?
      ORDER BY uploaded_at DESC, version DESC
      LIMIT 1
    `;
    db.get(sql, [contractId], callback);
  },

  /**
   * Add a file to a contract
   * @param {Object} data - File data
   * @param {Function} callback - (err, result)
   */
  addFile(data, callback) {
    const { contractId, fileName, filePath, fileSize, description, uploadedBy } = data;
    
    // Get next version number
    const versionSql = `SELECT COALESCE(MAX(version), 0) + 1 as nextVersion FROM contract_files WHERE contract_id = ?`;
    db.get(versionSql, [contractId], (err, row) => {
      if (err) return callback(err);
      
      const version = row ? row.nextVersion : 1;
      const uploadedAt = new Date().toISOString();
      
      const sql = `
        INSERT INTO contract_files (contract_id, file_name, file_path, file_size, description, version, uploaded_at, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [contractId, fileName, filePath, fileSize || null, description || null, version, uploadedAt, uploadedBy || null], function(err) {
        if (err) return callback(err);
        callback(null, { id: this.lastID, version, uploadedAt });
      });
    });
  },

  /**
   * Delete a file by ID
   * @param {number} fileId - File ID
   * @param {Function} callback - (err, filePath)
   */
  deleteFile(fileId, callback) {
    // First get the file path
    db.get('SELECT file_path FROM contract_files WHERE id = ?', [fileId], (err, file) => {
      if (err) return callback(err);
      if (!file) return callback(new Error('Dosya bulunamadı'));
      
      // Delete from database
      db.run('DELETE FROM contract_files WHERE id = ?', [fileId], function(err) {
        if (err) return callback(err);
        callback(null, file.file_path);
      });
    });
  },

  /**
   * Get file by ID
   * @param {number} fileId - File ID
   * @param {Function} callback - (err, file)
   */
  getFileById(fileId, callback) {
    const sql = 'SELECT * FROM contract_files WHERE id = ?';
    db.get(sql, [fileId], callback);
  },

  // ==================== SEARCH & FILTER ====================

  /**
   * Search and filter contracts
   * @param {Object} filters - Search/filter criteria
   * @param {Function} callback - (err, rows)
   */
  search(filters, callback) {
    const { search, contract_type, status, start_date_from, start_date_to, expiry_date_from, expiry_date_to } = filters;
    
    let sql = `
      SELECT 
        id, title, description, file_name, file_path,
        start_date, expiry_date, contract_type, status,
        contract_value, currency, party_name, party_contact, party_email,
        created_at, created_by
      FROM contracts
      WHERE 1=1
    `;
    const params = [];
    
    // Text search (title, description, party_name)
    if (search && search.trim()) {
      sql += ` AND (
        title LIKE ? OR 
        description LIKE ? OR 
        party_name LIKE ? OR
        party_email LIKE ?
      )`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    // Contract type filter
    if (contract_type && contract_type !== 'all') {
      sql += ` AND contract_type = ?`;
      params.push(contract_type);
    }
    
    // Status filter
    if (status && status !== 'all') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    // Start date range
    if (start_date_from) {
      sql += ` AND date(start_date) >= date(?)`;
      params.push(start_date_from);
    }
    if (start_date_to) {
      sql += ` AND date(start_date) <= date(?)`;
      params.push(start_date_to);
    }
    
    // Expiry date range
    if (expiry_date_from) {
      sql += ` AND date(expiry_date) >= date(?)`;
      params.push(expiry_date_from);
    }
    if (expiry_date_to) {
      sql += ` AND date(expiry_date) <= date(?)`;
      params.push(expiry_date_to);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    db.all(sql, params, callback);
  }
};

module.exports = ContractModel;
