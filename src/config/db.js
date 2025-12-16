/**
 * better-sqlite3 database wrapper
 * Geriye dönük uyumlu callback API + senkron API desteği
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'bestfreight.db');
console.log('[better-sqlite3] DB path:', dbPath);

// Database bağlantısını aç
const db = new Database(dbPath, { 
  // verbose: console.log // Debug için açılabilir
});

console.log('[better-sqlite3] Bağlantı açıldı:', dbPath);

// WAL mode - daha iyi performans
db.pragma('journal_mode = WAL');
// Foreign keys aktif
db.pragma('foreign_keys = ON');

// ============ CALLBACK UYUMLU API ============
// Mevcut kodlarla uyumluluk için callback-based metodlar

/**
 * SELECT sorguları için (birden fazla satır)
 * @param {string} sql 
 * @param {Array} params 
 * @param {Function} callback (err, rows)
 */
db.all = function(sql, params = [], callback) {
  // Eğer callback ikinci parametrede ise (params verilmemiş)
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  
  setImmediate(() => {
    try {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...(Array.isArray(params) ? params : [params]));
      if (callback) callback(null, rows);
    } catch (err) {
      if (callback) callback(err);
      else console.error('[db.all] Error:', err.message);
    }
  });
};

/**
 * SELECT sorguları için (tek satır)
 * @param {string} sql 
 * @param {Array} params 
 * @param {Function} callback (err, row)
 */
db.get = function(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  
  setImmediate(() => {
    try {
      const stmt = db.prepare(sql);
      const row = stmt.get(...(Array.isArray(params) ? params : [params]));
      if (callback) callback(null, row);
    } catch (err) {
      if (callback) callback(err);
      else console.error('[db.get] Error:', err.message);
    }
  });
};

/**
 * INSERT/UPDATE/DELETE sorguları için
 * @param {string} sql 
 * @param {Array} params 
 * @param {Function} callback (err) - this.lastID ve this.changes içerir
 */
db.run = function(sql, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  
  setImmediate(() => {
    try {
      const stmt = db.prepare(sql);
      const result = stmt.run(...(Array.isArray(params) ? params : [params]));
      if (callback) {
        // sqlite3 uyumluluğu için this context simüle et
        const context = {
          lastID: result.lastInsertRowid,
          changes: result.changes
        };
        callback.call(context, null);
      }
    } catch (err) {
      if (callback) callback(err);
      else console.error('[db.run] Error:', err.message);
    }
  });
};

/**
 * Birden fazla SQL statement'ı çalıştır (migration vs için)
 * @param {string} sql 
 * @param {Function} callback 
 */
db.execAsync = function(sql, callback) {
  setImmediate(() => {
    try {
      db.exec(sql);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
      else console.error('[db.exec] Error:', err.message);
    }
  });
};

/**
 * serialize - sqlite3 uyumluluğu için
 * better-sqlite3 zaten senkron olduğundan basitçe callback'i çağır
 */
db.serialize = function(callback) {
  if (callback) callback();
};

/**
 * parallelize - sqlite3 uyumluluğu için
 */
db.parallelize = function(callback) {
  if (callback) callback();
};

// ============ SENKRON API ============
// Yeni kodlar için doğrudan senkron metodlar

/**
 * Senkron SELECT (birden fazla satır)
 */
db.allSync = function(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...(Array.isArray(params) ? params : [params]));
};

/**
 * Senkron SELECT (tek satır)
 */
db.getSync = function(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...(Array.isArray(params) ? params : [params]));
};

/**
 * Senkron INSERT/UPDATE/DELETE
 * @returns {{ lastID: number, changes: number }}
 */
db.runSync = function(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = stmt.run(...(Array.isArray(params) ? params : [params]));
  return {
    lastID: result.lastInsertRowid,
    changes: result.changes
  };
};

// ============ SCHEMA INITIALIZATION ============

// Users tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )
`).run();

// Companies tablosu (Gönderici / Alıcı dropdown kaynağı)
db.prepare(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )
`).run();

// Loads tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_no TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    consignee_name TEXT,
    loading_country TEXT,
    loading_city TEXT,
    loading_address TEXT,
    unloading_country TEXT,
    unloading_city TEXT,
    unloading_address TEXT,
    goods_description TEXT,
    packages INTEGER,
    pallets INTEGER,
    ldm REAL,
    gross_weight REAL,
    net_weight REAL,
    truck_plate TEXT,
    trailer_plate TEXT,
    driver_name TEXT,
    t1_mrn TEXT,
    exit_date TEXT,
    arrival_date TEXT,
    loading_date TEXT,
    unloading_date TEXT,
    navlun_currency TEXT,
    navlun_amount REAL,
    fatura_kime TEXT,
    cost_currency TEXT,
    cost_amount REAL,
    notes TEXT,
    seal_code TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Seals tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS seals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seal_no TEXT UNIQUE NOT NULL,
    is_used INTEGER NOT NULL DEFAULT 0,
    used_at TEXT,
    used_in_load_id INTEGER,
    FOREIGN KEY (used_in_load_id) REFERENCES loads(id)
  )
`).run();

// Logs tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    role TEXT,
    entity TEXT,
    entity_id INTEGER,
    entity_id_text TEXT,
    action TEXT,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    machine_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// GPSBuddy - Vehicle last (cache) tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS gps_vehicle_last (
    vehicleid INTEGER PRIMARY KEY,
    plate TEXT,
    drivername TEXT,
    latitude REAL,
    longitude REAL,
    velocity REAL,
    address TEXT,
    location TEXT,
    direction INTEGER,
    time_indicator TEXT,
    drivetime INTEGER,
    worktime INTEGER,
    idletime INTEGER,
    stoptime INTEGER,
    totaldistance INTEGER,
    start_km REAL,
    flags INTEGER,
    communication INTEGER,
    colorcode TEXT,
    updated_at TEXT
  )
`).run();

// GPSBuddy - Vehicle history (time series) tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS gps_vehicle_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicleid INTEGER NOT NULL,
    plate TEXT,
    latitude REAL,
    longitude REAL,
    velocity REAL,
    time_indicator TEXT,
    address TEXT,
    drivetime INTEGER,
    worktime INTEGER,
    idletime INTEGER,
    stoptime INTEGER,
    totaldistance INTEGER,
    start_km REAL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(vehicleid, time_indicator)
  )
`).run();

// Index for time-series queries
try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_gps_vehicle_history_vehicle_time ON gps_vehicle_history(vehicleid, time_indicator)`).run();
} catch (_) {
  // ignore
}

// Position expenses tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS position_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_no TEXT NOT NULL,
    expense_type TEXT NOT NULL,
    cost_amount REAL NOT NULL DEFAULT 0,
    cost_currency TEXT DEFAULT 'EUR',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Invoice companies tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS invoice_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Mail recipients tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS mail_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alici_adi TEXT NOT NULL,
    email TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Documents tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_no TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    category TEXT DEFAULT 'Evraklar',
    type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// VizeBest entries tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS vizebest_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    dob TEXT,
    hire TEXT,
    ukvisa TEXT,
    schengen TEXT,
    visa_country TEXT,
    license_exp TEXT,
    insurance_exp TEXT,
    src3 TEXT,
    src5 TEXT,
    psycho TEXT,
    tacho TEXT,
    passport_exp TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL
  )
`).run();

// Chat messages tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Private messages tablosu
db.prepare(`
  CREATE TABLE IF NOT EXISTS chat_private_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_key TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    text TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// ============ MIGRATIONS (ALTER TABLE) ============
// Mevcut tablolara kolon ekleme - hata varsa yoksay

const safeAddColumn = (table, column, type) => {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } catch (err) {
    // duplicate column hatası normaldir
    if (!err.message.includes('duplicate column')) {
      console.error(`[Migration] ${table}.${column}:`, err.message);
    }
  }
};

// loads tablosu ekstra kolonları
safeAddColumn('loads', 'ordino_cost', 'REAL DEFAULT 0');
safeAddColumn('loads', 'mrn_no', 'TEXT');
safeAddColumn('loads', 'ref', 'TEXT');
safeAddColumn('loads', 'fatura_no', 'TEXT');
safeAddColumn('loads', 'ihr_poz', 'TEXT');
safeAddColumn('loads', 'uid', 'INTEGER');
safeAddColumn('loads', 'ydg_amount', 'REAL DEFAULT 0');
safeAddColumn('loads', 'completed_rates', 'TEXT');
safeAddColumn('loads', 'status', 'TEXT');
safeAddColumn('loads', 'no_expense', 'INTEGER DEFAULT 0');

// companies tablosu
safeAddColumn('companies', 'type', "TEXT DEFAULT 'both'");

// logs tablosu
safeAddColumn('logs', 'entity_id_text', 'TEXT');

// mail_recipients tablosu
safeAddColumn('mail_recipients', 'sender_company', 'TEXT');

// documents tablosu
safeAddColumn('documents', 'category', "TEXT DEFAULT 'Evraklar'");
safeAddColumn('documents', 'type', 'TEXT');

// vizebest_entries tablosu
safeAddColumn('vizebest_entries', 'deleted_at', 'TEXT DEFAULT NULL');

// ============ INDEXES ============

const safeCreateIndex = (indexDef) => {
  try {
    db.prepare(indexDef).run();
  } catch (err) {
    // Tablo yoksa veya index zaten varsa sessizce geç
  }
};

// loads indexes
safeCreateIndex('CREATE UNIQUE INDEX IF NOT EXISTS idx_loads_uid_unique ON loads(uid)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_position_no ON loads(position_no)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_created_at ON loads(created_at DESC)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_truck_plate ON loads(truck_plate)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_trailer_plate ON loads(trailer_plate)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_driver_name ON loads(driver_name)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_fatura_kime ON loads(fatura_kime)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_customer_name ON loads(customer_name)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_loads_consignee_name ON loads(consignee_name)');

// documents indexes
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_documents_position_no ON documents(position_no)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)');

// logs indexes
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_logs_entity_id_text ON logs(entity_id_text)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_logs_entity ON logs(entity)');

// position_expenses index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_position_expenses_position_no ON position_expenses(position_no)');

// position_km index (tablo varsa)
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_position_km_position_no ON position_km(position_no)');

// vizebest index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_vizebest_deleted_at ON vizebest_entries(deleted_at)');

// chat index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_private_chat_key ON chat_private_messages(chat_key)');

// drivers index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name)');

// trucks index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_trucks_plate ON trucks(plate)');

// trailers index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_trailers_plate ON trailers(plate)');

// seals indexes
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_seals_is_used ON seals(is_used)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_seals_seal_no ON seals(seal_no)');

// companies indexes
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_companies_type ON companies(type)');
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)');

// users index
safeCreateIndex('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');

console.log('[better-sqlite3] Schema ve indexler hazır');

// ============ CLEANUP ============

// Process kapanırken bağlantıyı kapat
process.on('exit', () => {
  try {
    db.close();
    console.log('[better-sqlite3] Bağlantı kapatıldı');
  } catch (e) {}
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

module.exports = db;
