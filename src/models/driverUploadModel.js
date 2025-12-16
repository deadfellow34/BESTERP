// backend/src/models/driverUploadModel.js
const db = require('../config/db');
const crypto = require('crypto');

const DriverUploadModel = {
  /**
   * Generate a secure random token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Create a new upload token for a position
   * @param {string} positionNo - The position number
   * @param {string} createdBy - Username who created the token
   * @param {number} expiresInHours - Hours until token expires (default 168 = 1 week)
   */
  createToken(positionNo, createdBy, expiresInHours = 168, callback) {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    
    const sql = `
      INSERT INTO driver_upload_tokens (position_no, token, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;
    
    db.run(sql, [positionNo, token, expiresAt, createdBy], function(err) {
      if (err) return callback(err);
      callback(null, {
        id: this.lastID,
        position_no: positionNo,
        token: token,
        expires_at: expiresAt,
        created_by: createdBy
      });
    });
  },

  /**
   * Get token by token string
   */
  getByToken(token, callback) {
    const sql = `
      SELECT id, position_no, token, expires_at, used_at, created_by, created_at
      FROM driver_upload_tokens
      WHERE token = ?
    `;
    db.get(sql, [token], callback);
  },

  /**
   * Get active (non-expired, not revoked) token for a position
   */
  getActiveTokenForPosition(positionNo, callback) {
    const sql = `
      SELECT id, position_no, token, expires_at, used_at, revoked_at, created_by, created_at
      FROM driver_upload_tokens
      WHERE position_no = ?
        AND expires_at > datetime('now')
        AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    db.get(sql, [positionNo], callback);
  },

  /**
   * Validate a token - check if exists, not expired, and optionally not used
   * @param {string} token - The token to validate
   * @param {boolean} allowReuse - If true, don't check used_at
   */
  validateToken(token, allowReuse = true, callback) {
    const sql = `
      SELECT id, position_no, token, expires_at, used_at, created_by, created_at
      FROM driver_upload_tokens
      WHERE token = ?
    `;
    
    db.get(sql, [token], (err, row) => {
      if (err) return callback(err);
      
      if (!row) {
        return callback(null, { valid: false, reason: 'Token bulunamadı' });
      }
      
      const now = new Date();
      const expiresAt = new Date(row.expires_at);
      
      if (now > expiresAt) {
        return callback(null, { valid: false, reason: 'Bu link süresi dolmuş', token: row });
      }
      
      if (!allowReuse && row.used_at) {
        return callback(null, { valid: false, reason: 'Bu link daha önce kullanılmış', token: row });
      }
      
      return callback(null, { valid: true, token: row });
    });
  },

  /**
   * Mark token as used
   */
  markAsUsed(tokenId, callback) {
    const sql = `UPDATE driver_upload_tokens SET used_at = datetime('now') WHERE id = ?`;
    db.run(sql, [tokenId], callback);
  },

  /**
   * Revoke a token (mark as revoked instead of deleting)
   */
  revokeToken(tokenId, callback) {
    const sql = `UPDATE driver_upload_tokens SET revoked_at = datetime('now') WHERE id = ?`;
    db.run(sql, [tokenId], callback);
  },

  /**
   * Revoke all active tokens for a position (mark as revoked)
   */
  revokeAllForPosition(positionNo, callback) {
    const sql = `UPDATE driver_upload_tokens SET revoked_at = datetime('now') WHERE position_no = ? AND revoked_at IS NULL`;
    db.run(sql, [positionNo], callback);
  },

  /**
   * Get all tokens for a position (for admin view)
   */
  getAllForPosition(positionNo, callback) {
    const sql = `
      SELECT id, position_no, token, expires_at, used_at, created_by, created_at
      FROM driver_upload_tokens
      WHERE position_no = ?
      ORDER BY created_at DESC
    `;
    db.all(sql, [positionNo], callback);
  },

  /**
   * Clean up expired tokens (can be called periodically)
   */
  cleanupExpired(callback) {
    const sql = `DELETE FROM driver_upload_tokens WHERE expires_at < datetime('now')`;
    db.run(sql, [], function(err) {
      if (err) return callback(err);
      callback(null, this.changes);
    });
  },

  /**
   * Get all tokens with upload statistics
   */
  getAllTokensWithStats(callback) {
    const sql = `
      SELECT 
        t.id,
        t.position_no,
        t.token,
        t.expires_at,
        t.used_at,
        t.revoked_at,
        t.created_by,
        t.created_at,
        CASE 
          WHEN t.revoked_at IS NOT NULL THEN 'revoked'
          WHEN t.expires_at > datetime('now') THEN 'active'
          ELSE 'expired'
        END as status,
        (SELECT COUNT(*) FROM documents d 
         WHERE d.position_no = t.position_no 
         AND d.type = 'driver_upload'
         AND d.created_at >= t.created_at) as upload_count
      FROM driver_upload_tokens t
      ORDER BY t.created_at DESC
    `;
    db.all(sql, [], callback);
  },

  /**
   * Get upload history for a specific token
   */
  getUploadHistoryForToken(tokenId, callback) {
    const sql = `
      SELECT 
        t.position_no,
        t.token,
        t.created_at as token_created_at,
        d.id as doc_id,
        d.filename,
        d.original_name,
        d.created_at as upload_time,
        d.uploaded_by
      FROM driver_upload_tokens t
      LEFT JOIN documents d ON d.position_no = t.position_no 
        AND d.category = 'Teslim CMR'
        AND d.created_at >= t.created_at
      WHERE t.id = ?
      ORDER BY d.created_at DESC
    `;
    db.all(sql, [tokenId], callback);
  }
};

module.exports = DriverUploadModel;
