// backend/src/models/logModel.js
const db = require('../config/db');
const os = require('os');

const LogModel = {
  /**
   * Tek bir log kaydı oluştur
   * log = {
   *   username, role, entity, entity_id, entity_id_text,
   *   action, field, old_value, new_value,
   *   machine_name
   * }
   */
  create(log, callback) {
    const sql = `
      INSERT INTO logs (
        username,
        role,
        entity,
        entity_id,
        entity_id_text,
        action,
        field,
        old_value,
        new_value,
        machine_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const numericEntityId = (log.entity_id != null && !isNaN(Number(log.entity_id))) ? Number(log.entity_id) : null;
    // entity_id_text öncelikli, yoksa entity_id'den al
    const textEntityId = log.entity_id_text || (log.entity_id != null ? String(log.entity_id) : null);

    const params = [
      log.username || null,
      log.role || null,
      log.entity || null,
      numericEntityId,
      textEntityId,
      log.action || null,
      log.field || null,
      log.old_value != null ? String(log.old_value) : null,
      log.new_value != null ? String(log.new_value) : null,
      log.machine_name || os.hostname(),
    ];

    db.run(sql, params, function (err) {
      if (callback) {
        if (err) return callback(err);
        return callback(null, this.lastID);
      }
      // callback verilmediyse sessizce geç
    });
  },

  /**
   * Birden fazla log kaydını tek seferde oluştur
   * logs = [{username, role, entity, ...}, ...]
   */
  createBulk(logs, callback) {
    if (!logs || logs.length === 0) {
      if (callback) return callback(null, []);
      return;
    }

    const insertedIds = [];
    let completed = 0;
    let hasError = false;

    logs.forEach((log, index) => {
      LogModel.create(log, (err, id) => {
        if (hasError) return;
        if (err) {
          hasError = true;
          if (callback) return callback(err);
          return;
        }
        insertedIds[index] = id;
        completed++;
        if (completed === logs.length && callback) {
          callback(null, insertedIds);
        }
      });
    });
  },

  /**
   * Belirli bir entity + id için tüm logları getir
   * Örn: entity='load', entity_id=21
   */
  getByEntity(entity, entityId, callback) {
    const sql = `
      SELECT
        id,
        username,
        role,
        entity,
        entity_id,
        entity_id_text,
        action,
        field,
        old_value,
        new_value,
        machine_name,
        created_at
      FROM logs
      WHERE entity = ?
        AND (entity_id = ? OR entity_id_text = ?)
      ORDER BY id DESC
    `;

    const numericEntityId = (entityId != null && !isNaN(Number(entityId))) ? Number(entityId) : null;
    const textEntityId = entityId != null ? String(entityId) : null;

    db.all(sql, [entity, numericEntityId, textEntityId], callback);
  },

  /**
   * Pozisyon numarasına göre logları getir
   */
  getByPositionNo(positionNo, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      WHERE entity_id_text = ? OR entity_id_text LIKE ?
      ORDER BY id DESC
    `;
    db.all(sql, [positionNo, positionNo + '%'], callback);
  },

  /**
   * Kullanıcıya göre logları getir
   */
  getByUsername(username, limit = 100, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      WHERE username = ?
      ORDER BY id DESC
      LIMIT ?
    `;
    db.all(sql, [username, limit], callback);
  },

  /**
   * Belirli bir tarih aralığındaki logları getir
   */
  getByDateRange(startDate, endDate, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      WHERE date(created_at) BETWEEN date(?) AND date(?)
      ORDER BY id DESC
    `;
    db.all(sql, [startDate, endDate], callback);
  },

  /**
   * Bugünün loglarını getir
   */
  getToday(callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      WHERE date(created_at) = date('now', 'localtime')
      ORDER BY id DESC
    `;
    db.all(sql, [], callback);
  },

  /**
   * Tüm logları getir (pagination destekli)
   */
  getAll(limit = 500, offset = 0, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [limit, offset], callback);
  },

  /**
   * Pozisyonlara göre gruplu log sayıları
   */
  getGroupedByPosition(callback) {
    const sql = `
      SELECT
        entity_id_text as position_no,
        COUNT(*) as log_count,
        MAX(created_at) as last_activity,
        GROUP_CONCAT(DISTINCT username) as users
      FROM logs
      WHERE entity IN ('position', 'load')
        AND entity_id_text IS NOT NULL
        AND entity_id_text != ''
      GROUP BY entity_id_text
      ORDER BY MAX(id) DESC
      LIMIT 200
    `;
    db.all(sql, [], callback);
  },

  /**
   * İstatistikler - Genel özet
   */
  getStats(callback) {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM logs) as total_logs,
        (SELECT COUNT(DISTINCT username) FROM logs) as unique_users,
        (SELECT COUNT(*) FROM logs WHERE date(created_at) = date('now', 'localtime')) as today_count,
        (SELECT COUNT(*) FROM logs WHERE action LIKE '%update%' OR action LIKE '%Update%' OR action LIKE '%Güncelle%') as update_count,
        (SELECT COUNT(*) FROM logs WHERE action LIKE '%create%' OR action LIKE '%Create%' OR action LIKE '%Oluştur%') as create_count,
        (SELECT COUNT(*) FROM logs WHERE action LIKE '%delete%' OR action LIKE '%Delete%' OR action LIKE '%Sil%') as delete_count,
        (SELECT COUNT(DISTINCT entity_id_text) FROM logs WHERE entity_id_text IS NOT NULL) as unique_positions
    `;
    db.get(sql, [], callback);
  },

  /**
   * Kullanıcı bazlı istatistikler
   */
  getUserStats(callback) {
    const sql = `
      SELECT
        username,
        role,
        COUNT(*) as action_count,
        MAX(created_at) as last_activity
      FROM logs
      WHERE username IS NOT NULL
      GROUP BY username
      ORDER BY action_count DESC
    `;
    db.all(sql, [], callback);
  },

  /**
   * Son N log kaydını getir
   */
  getRecent(limit = 50, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      ORDER BY id DESC
      LIMIT ?
    `;
    db.all(sql, [limit], callback);
  },

  /**
   * Belirli bir alan için değişiklik geçmişi
   */
  getFieldHistory(entityIdText, fieldName, callback) {
    const sql = `
      SELECT
        id, username, role, action, field, old_value, new_value, created_at
      FROM logs
      WHERE entity_id_text = ? AND field = ?
      ORDER BY id DESC
    `;
    db.all(sql, [entityIdText, fieldName], callback);
  },

  /**
   * Arama - log içeriğinde arama yap
   */
  search(searchTerm, limit = 100, callback) {
    const sql = `
      SELECT
        id, username, role, entity, entity_id, entity_id_text,
        action, field, old_value, new_value, machine_name, created_at
      FROM logs
      WHERE username LIKE ?
        OR entity_id_text LIKE ?
        OR action LIKE ?
        OR field LIKE ?
        OR old_value LIKE ?
        OR new_value LIKE ?
      ORDER BY id DESC
      LIMIT ?
    `;
    const term = '%' + searchTerm + '%';
    db.all(sql, [term, term, term, term, term, term, limit], callback);
  },

  /**
   * Eski logları temizle (belirli günden eski olanları sil)
   */
  deleteOlderThan(days, callback) {
    const sql = `
      DELETE FROM logs
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `;
    db.run(sql, [days], function(err) {
      if (callback) {
        if (err) return callback(err);
        return callback(null, this.changes);
      }
    });
  },

  /**
   * Tüm logları sil
   */
  deleteAll(callback) {
    const sql = `DELETE FROM logs`;
    db.run(sql, [], function(err) {
      if (callback) {
        if (err) return callback(err);
        return callback(null, this.changes);
      }
    });
  },

  /**
   * Belirli bir pozisyonun loglarını sil
   */
  deleteByPosition(positionNo, callback) {
    const sql = `DELETE FROM logs WHERE entity_id_text = ?`;
    db.run(sql, [positionNo], function(err) {
      if (callback) {
        if (err) return callback(err);
        return callback(null, this.changes);
      }
    });
  },

  /**
   * Log sayısını getir
   */
  count(callback) {
    const sql = `SELECT COUNT(*) as count FROM logs`;
    db.get(sql, [], callback);
  }
};

module.exports = LogModel;
