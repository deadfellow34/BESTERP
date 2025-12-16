/**
 * Custom better-sqlite3 session store for express-session
 * Simple, no external dependencies
 */
const Database = require('better-sqlite3');
const path = require('path');

module.exports = function(session) {
  const Store = session.Store;
  
  class BetterSqlite3Store extends Store {
    constructor(options = {}) {
      super(options);
      
      const dbPath = options.path || path.join(process.cwd(), 'data', 'sessions.db');
      this.db = new Database(dbPath);
      
      // Create sessions table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY NOT NULL,
          sess TEXT NOT NULL,
          expired INTEGER NOT NULL
        )
      `);
      
      // Create index on expired column
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)
      `);
      
      // Prepared statements
      this._get = this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?');
      this._set = this.db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)');
      this._destroy = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
      this._clear = this.db.prepare('DELETE FROM sessions');
      this._length = this.db.prepare('SELECT COUNT(*) as count FROM sessions WHERE expired > ?');
      this._all = this.db.prepare('SELECT sid, sess FROM sessions WHERE expired > ?');
      this._touch = this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?');
      this._cleanup = this.db.prepare('DELETE FROM sessions WHERE expired <= ?');
      
      // Periodic cleanup (every 15 minutes)
      this.cleanupInterval = setInterval(() => {
        this._cleanup.run(Date.now());
      }, 15 * 60 * 1000);
      
      // Initial cleanup
      this._cleanup.run(Date.now());
      
      console.log('[SessionStore] better-sqlite3 session store hazır:', dbPath);
    }
    
    get(sid, callback) {
      try {
        const row = this._get.get(sid, Date.now());
        if (row) {
          const sess = JSON.parse(row.sess);
          callback(null, sess);
        } else {
          callback(null, null);
        }
      } catch (err) {
        callback(err);
      }
    }
    
    set(sid, sess, callback) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 86400000; // 1 day default
        const expired = Date.now() + maxAge;
        this._set.run(sid, JSON.stringify(sess), expired);
        callback(null);
      } catch (err) {
        callback(err);
      }
    }
    
    destroy(sid, callback) {
      try {
        this._destroy.run(sid);
        callback(null);
      } catch (err) {
        callback(err);
      }
    }
    
    clear(callback) {
      try {
        this._clear.run();
        callback(null);
      } catch (err) {
        callback(err);
      }
    }
    
    length(callback) {
      try {
        const row = this._length.get(Date.now());
        callback(null, row ? row.count : 0);
      } catch (err) {
        callback(err);
      }
    }
    
    all(callback) {
      try {
        const rows = this._all.all(Date.now());
        const sessions = rows.map(row => JSON.parse(row.sess));
        callback(null, sessions);
      } catch (err) {
        callback(err);
      }
    }
    
    touch(sid, sess, callback) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 86400000;
        const expired = Date.now() + maxAge;
        this._touch.run(expired, sid);
        callback(null);
      } catch (err) {
        callback(err);
      }
    }
    
    /**
     * Destroy all sessions for a specific user
     * @param {number} userId - The user ID to invalidate sessions for
     * @param {Function} callback
     */
    destroyByUserId(userId, callback) {
      try {
        const rows = this._all.all(Date.now());
        let destroyed = 0;
        
        for (const row of rows) {
          try {
            const sess = JSON.parse(row.sess);
            if (sess.user && sess.user.id === userId) {
              this._destroy.run(row.sid);
              destroyed++;
            }
          } catch (parseErr) {
            // Skip invalid sessions
          }
        }
        
        console.log(`[SessionStore] Destroyed ${destroyed} session(s) for user ID: ${userId}`);
        if (callback) callback(null, destroyed);
      } catch (err) {
        if (callback) callback(err);
      }
    }
    
    close() {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      if (this.db) {
        this.db.close();
      }
    }
  }
  
  return BetterSqlite3Store;
};
