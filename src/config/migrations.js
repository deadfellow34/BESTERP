/**
 * Database Migration System
 * 
 * This module provides a proper migration system for schema changes.
 * Each migration has an up() function that applies the change.
 * Migrations are tracked in a migrations table to prevent re-running.
 * 
 * Usage:
 *   const { runMigrations } = require('./config/migrations');
 *   runMigrations(db);
 */

const migrations = [
  {
    version: 1,
    name: 'initial_indexes',
    description: 'Add database indexes for performance',
    up: (db) => {
      return new Promise((resolve, reject) => {
        const indexes = [
          // Loads table indexes
          'CREATE INDEX IF NOT EXISTS idx_loads_position_no ON loads(position_no)',
          'CREATE INDEX IF NOT EXISTS idx_loads_customer_name ON loads(customer_name)',
          'CREATE INDEX IF NOT EXISTS idx_loads_consignee_name ON loads(consignee_name)',
          'CREATE INDEX IF NOT EXISTS idx_loads_truck_plate ON loads(truck_plate)',
          'CREATE INDEX IF NOT EXISTS idx_loads_trailer_plate ON loads(trailer_plate)',
          'CREATE INDEX IF NOT EXISTS idx_loads_driver_name ON loads(driver_name)',
          'CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status)',
          'CREATE INDEX IF NOT EXISTS idx_loads_loading_date ON loads(loading_date)',
          'CREATE INDEX IF NOT EXISTS idx_loads_created_at ON loads(created_at)',
          'CREATE INDEX IF NOT EXISTS idx_loads_ihr_poz ON loads(ihr_poz)',
          
          // Logs table indexes
          'CREATE INDEX IF NOT EXISTS idx_logs_entity ON logs(entity)',
          'CREATE INDEX IF NOT EXISTS idx_logs_entity_id ON logs(entity_id)',
          'CREATE INDEX IF NOT EXISTS idx_logs_entity_id_text ON logs(entity_id_text)',
          'CREATE INDEX IF NOT EXISTS idx_logs_username ON logs(username)',
          'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)',
          'CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action)',
          
          // Documents table indexes
          'CREATE INDEX IF NOT EXISTS idx_documents_position_no ON documents(position_no)',
          'CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)',
          'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
          
          // Position expenses table indexes
          'CREATE INDEX IF NOT EXISTS idx_position_expenses_position_no ON position_expenses(position_no)',
          'CREATE INDEX IF NOT EXISTS idx_position_expenses_expense_type ON position_expenses(expense_type)',
          
          // Companies table indexes
          'CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)',
          'CREATE INDEX IF NOT EXISTS idx_companies_type ON companies(type)',
          
          // Seals table indexes
          'CREATE INDEX IF NOT EXISTS idx_seals_is_used ON seals(is_used)',
          
          // Mail recipients table indexes
          'CREATE INDEX IF NOT EXISTS idx_mail_recipients_alici_adi ON mail_recipients(alici_adi)',
          'CREATE INDEX IF NOT EXISTS idx_mail_recipients_is_active ON mail_recipients(is_active)',
          
          // VizeBest entries indexes
          'CREATE INDEX IF NOT EXISTS idx_vizebest_entries_name ON vizebest_entries(name)',
          
          // Position KM table indexes
          'CREATE INDEX IF NOT EXISTS idx_position_km_position_no ON position_km(position_no)',
          
          // Trucks table indexes
          'CREATE INDEX IF NOT EXISTS idx_trucks_plate ON trucks(plate)',
          'CREATE INDEX IF NOT EXISTS idx_trucks_active ON trucks(active)',
          
          // Trailers table indexes
          'CREATE INDEX IF NOT EXISTS idx_trailers_plate ON trailers(plate)',
          
          // Drivers table indexes
          'CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name)',
        ];
        
        let completed = 0;
        let hasError = false;
        
        indexes.forEach((sql) => {
          if (hasError) return;
          db.run(sql, (err) => {
            if (err) {
              // Ignore "table does not exist" errors for optional tables
              if (!err.message.includes('no such table')) {
                console.error(`Index creation error: ${err.message}`);
              }
            }
            completed++;
            if (completed === indexes.length) {
              resolve();
            }
          });
        });
      });
    }
  },
  {
    version: 2,
    name: 'add_status_column',
    description: 'Add status column to loads if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`ALTER TABLE loads ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (status column):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 3,
    name: 'add_no_expense_column',
    description: 'Add no_expense column to loads if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`ALTER TABLE loads ADD COLUMN no_expense INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (no_expense column):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 4,
    name: 'add_volume_column',
    description: 'Add volume_m3 column to loads if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`ALTER TABLE loads ADD COLUMN volume_m3 REAL`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (volume_m3 column):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 5,
    name: 'create_position_km_table',
    description: 'Create position_km table for route distances',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS position_km (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_no TEXT UNIQUE NOT NULL,
            segments TEXT,
            total_km REAL,
            loading_count INTEGER DEFAULT 0,
            unloading_count INTEGER DEFAULT 0,
            exit_count INTEGER DEFAULT 0,
            europe_count INTEGER DEFAULT 0,
            herstal INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (position_km table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 6,
    name: 'create_trucks_table',
    description: 'Create trucks table if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS trucks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate TEXT UNIQUE NOT NULL,
            driver_name TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (trucks table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 7,
    name: 'create_trailers_table',
    description: 'Create trailers table if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS trailers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plate TEXT UNIQUE NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (trailers table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 8,
    name: 'create_drivers_table',
    description: 'Create drivers table if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (drivers table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 9,
    name: 'create_truck_notes_table',
    description: 'Create truck_notes table if not exists',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS truck_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            truck_id INTEGER NOT NULL,
            note TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (truck_id) REFERENCES trucks(id)
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (truck_notes table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 10,
    name: 'create_named_table',
    description: 'Create named table for load naming',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS named (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            load_id INTEGER NOT NULL,
            name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (load_id) REFERENCES loads(id)
          )
        `, (err) => {
          if (err) {
            console.error('Migration error (named table):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 11,
    name: 'add_recipient_type_column',
    description: 'Add recipient_type column to mail_recipients',
    up: (db) => {
      return new Promise((resolve) => {
        db.run(`ALTER TABLE mail_recipients ADD COLUMN recipient_type TEXT DEFAULT 'to'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Migration error (recipient_type column):', err.message);
          }
          resolve();
        });
      });
    }
  },
  {
    version: 12,
    name: 'add_composite_indexes',
    description: 'Add composite indexes for common queries',
    up: (db) => {
      return new Promise((resolve) => {
        const compositeIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_loads_position_status ON loads(position_no, status)',
          'CREATE INDEX IF NOT EXISTS idx_logs_entity_id_combo ON logs(entity, entity_id_text)',
          'CREATE INDEX IF NOT EXISTS idx_documents_position_category ON documents(position_no, category)',
        ];
        
        let completed = 0;
        compositeIndexes.forEach((sql) => {
          db.run(sql, (err) => {
            if (err) {
              console.error(`Composite index error: ${err.message}`);
            }
            completed++;
            if (completed === compositeIndexes.length) {
              resolve();
            }
          });
        });
      });
    }
  },
  {
    version: 13,
    name: 'create_notifications_system',
    description: 'Create notifications table and user preferences for smart notification system',
    up: (db) => {
      return new Promise((resolve, reject) => {
        // Notifications table
        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT,
            link TEXT,
            data TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            read_at TEXT
          )
        `, (err) => {
          if (err) {
            console.error('Notifications table error:', err.message);
            return reject(err);
          }
          
          // User notification preferences table
          db.run(`
            CREATE TABLE IF NOT EXISTS notification_preferences (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER UNIQUE,
              username TEXT UNIQUE,
              new_position INTEGER DEFAULT 1,
              position_completed INTEGER DEFAULT 1,
              position_deleted INTEGER DEFAULT 1,
              documents_uploaded INTEGER DEFAULT 1,
              expense_missing INTEGER DEFAULT 1,
              chat_message INTEGER DEFAULT 1,
              browser_push INTEGER DEFAULT 0,
              updated_at TEXT DEFAULT (datetime('now'))
            )
          `, (err2) => {
            if (err2) {
              console.error('Notification preferences table error:', err2.message);
              return reject(err2);
            }
            
            // Add new columns if they don't exist (for existing databases)
            const alterQueries = [
              "ALTER TABLE notification_preferences ADD COLUMN position_deleted INTEGER DEFAULT 1",
              "ALTER TABLE notification_preferences ADD COLUMN expense_missing INTEGER DEFAULT 1"
            ];
            
            alterQueries.forEach(sql => {
              db.run(sql, [], (alterErr) => {
                // Ignore errors - column might already exist
              });
            });
            
            // Create indexes
            const indexes = [
              'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username)',
              'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)',
              'CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)',
              'CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)'
            ];
            
            let completed = 0;
            indexes.forEach((sql) => {
              db.run(sql, () => {
                completed++;
                if (completed === indexes.length) {
                  resolve();
                }
              });
            });
          });
        });
      });
    }
  },
  {
    version: 14,
    name: 'add_chat_reply_support',
    description: 'Add reply_to_id column to chat_messages and chat_private_messages for reply functionality',
    up: (db) => {
      return new Promise((resolve, reject) => {
        // First ensure chat_messages table exists
        db.run(`
          CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            text TEXT NOT NULL,
            time TEXT,
            reply_to_id INTEGER,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) console.error('chat_messages table error:', err.message);
          
          // Add reply_to_id if not exists
          db.run(`ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER`, (alterErr) => {
            if (alterErr && !alterErr.message.includes('duplicate column')) {
              console.error('chat_messages alter error:', alterErr.message);
            }
            
            // Now ensure chat_private_messages table exists
            db.run(`
              CREATE TABLE IF NOT EXISTS chat_private_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_key TEXT NOT NULL,
                sender TEXT NOT NULL,
                recipient TEXT NOT NULL,
                text TEXT NOT NULL,
                time TEXT,
                reply_to_id INTEGER,
                created_at TEXT DEFAULT (datetime('now'))
              )
            `, (err2) => {
              if (err2) console.error('chat_private_messages table error:', err2.message);
              
              // Add reply_to_id if not exists
              db.run(`ALTER TABLE chat_private_messages ADD COLUMN reply_to_id INTEGER`, (alterErr2) => {
                if (alterErr2 && !alterErr2.message.includes('duplicate column')) {
                  console.error('chat_private_messages alter error:', alterErr2.message);
                }
                
                // Create indexes for chat performance
                const indexes = [
                  'CREATE INDEX IF NOT EXISTS idx_chat_messages_id ON chat_messages(id)',
                  'CREATE INDEX IF NOT EXISTS idx_chat_messages_reply ON chat_messages(reply_to_id)',
                  'CREATE INDEX IF NOT EXISTS idx_chat_private_key ON chat_private_messages(chat_key)',
                  'CREATE INDEX IF NOT EXISTS idx_chat_private_reply ON chat_private_messages(reply_to_id)'
                ];
                
                let completed = 0;
                indexes.forEach(sql => {
                  db.run(sql, () => {
                    completed++;
                    if (completed === indexes.length) {
                      resolve();
                    }
                  });
                });
              });
            });
          });
        });
      });
    }
  },
  {
    version: 15,
    name: 'add_chat_reactions_and_attachments',
    description: 'Add chat_reactions table and attachment support to chat messages',
    up: (db) => {
      return new Promise((resolve, reject) => {
        // Create chat_reactions table
        db.run(`
          CREATE TABLE IF NOT EXISTS chat_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            message_type TEXT DEFAULT 'public',
            user_name TEXT NOT NULL,
            emoji TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(message_id, message_type, user_name, emoji)
          )
        `, (err) => {
          if (err) console.error('chat_reactions table error:', err.message);
          
          // Add attachment columns to chat_messages
          db.run(`ALTER TABLE chat_messages ADD COLUMN attachment_url TEXT`, (err1) => {
            if (err1 && !err1.message.includes('duplicate column')) {
              console.error('chat_messages attachment_url error:', err1.message);
            }
            
            db.run(`ALTER TABLE chat_messages ADD COLUMN attachment_type TEXT`, (err2) => {
              if (err2 && !err2.message.includes('duplicate column')) {
                console.error('chat_messages attachment_type error:', err2.message);
              }
              
              db.run(`ALTER TABLE chat_messages ADD COLUMN attachment_name TEXT`, (err3) => {
                if (err3 && !err3.message.includes('duplicate column')) {
                  console.error('chat_messages attachment_name error:', err3.message);
                }
                
                // Add attachment columns to chat_private_messages
                db.run(`ALTER TABLE chat_private_messages ADD COLUMN attachment_url TEXT`, (err4) => {
                  if (err4 && !err4.message.includes('duplicate column')) {
                    console.error('chat_private_messages attachment_url error:', err4.message);
                  }
                  
                  db.run(`ALTER TABLE chat_private_messages ADD COLUMN attachment_type TEXT`, (err5) => {
                    if (err5 && !err5.message.includes('duplicate column')) {
                      console.error('chat_private_messages attachment_type error:', err5.message);
                    }
                    
                    db.run(`ALTER TABLE chat_private_messages ADD COLUMN attachment_name TEXT`, (err6) => {
                      if (err6 && !err6.message.includes('duplicate column')) {
                        console.error('chat_private_messages attachment_name error:', err6.message);
                      }
                      
                      // Create indexes
                      db.run('CREATE INDEX IF NOT EXISTS idx_chat_reactions_msg ON chat_reactions(message_id, message_type)', () => {
                        resolve();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  },
  {
    version: 16,
    name: 'add_driver_upload_tokens',
    description: 'Add driver_upload_tokens table for secure document upload links',
    up: (db) => {
      return new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS driver_upload_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_no TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `, (err) => {
          if (err) {
            console.error('driver_upload_tokens table error:', err.message);
            reject(err);
            return;
          }
          
          // Create indexes
          db.run('CREATE INDEX IF NOT EXISTS idx_driver_upload_token ON driver_upload_tokens(token)', (err1) => {
            if (err1) console.error('driver_upload_tokens index error:', err1.message);
            
            db.run('CREATE INDEX IF NOT EXISTS idx_driver_upload_position ON driver_upload_tokens(position_no)', (err2) => {
              if (err2) console.error('driver_upload_tokens position index error:', err2.message);
              resolve();
            });
          });
        });
      });
    }
  },
  {
    version: 17,
    name: 'add_driver_upload_columns',
    description: 'Add revoked_at to driver_upload_tokens and uploaded_by to documents for driver upload tracking',
    up: (db) => {
      return new Promise((resolve) => {
        // Add revoked_at column to driver_upload_tokens for soft delete
        db.run(`ALTER TABLE driver_upload_tokens ADD COLUMN revoked_at TEXT`, (err1) => {
          if (err1 && !err1.message.includes('duplicate column')) {
            console.error('Migration error (revoked_at column):', err1.message);
          }
          
          // Add uploaded_by column to documents for driver name tracking
          db.run(`ALTER TABLE documents ADD COLUMN uploaded_by TEXT`, (err2) => {
            if (err2 && !err2.message.includes('duplicate column')) {
              console.error('Migration error (uploaded_by column):', err2.message);
            }
            resolve();
          });
        });
      });
    }
  },
  {
    version: 18,
    name: 'add_driver_locations_and_auth',
    description: 'Add driver_locations table and auth columns to drivers for Android app GPS tracking',
    up: (db) => {
      return new Promise((resolve, reject) => {
        // Create driver_locations table for GPS tracking
        db.run(`
          CREATE TABLE IF NOT EXISTS driver_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            speed REAL DEFAULT 0,
            recorded_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
          )
        `, (err) => {
          if (err) {
            console.error('driver_locations table error:', err.message);
            reject(err);
            return;
          }
          
          // Create indexes for driver_locations
          db.run('CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id)', (err1) => {
            if (err1) console.error('driver_locations driver_id index error:', err1.message);
            
            db.run('CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON driver_locations(recorded_at)', (err2) => {
              if (err2) console.error('driver_locations recorded_at index error:', err2.message);
              
              // Add pin column to drivers for authentication
              db.run(`ALTER TABLE drivers ADD COLUMN pin TEXT`, (err3) => {
                if (err3 && !err3.message.includes('duplicate column')) {
                  console.error('Migration error (pin column):', err3.message);
                }
                
                // Add auth_token column to drivers
                db.run(`ALTER TABLE drivers ADD COLUMN auth_token TEXT`, (err4) => {
                  if (err4 && !err4.message.includes('duplicate column')) {
                    console.error('Migration error (auth_token column):', err4.message);
                  }
                  
                  // Add is_tracking column to drivers (to know if driver is currently tracking)
                  db.run(`ALTER TABLE drivers ADD COLUMN is_tracking INTEGER DEFAULT 0`, (err5) => {
                    if (err5 && !err5.message.includes('duplicate column')) {
                      console.error('Migration error (is_tracking column):', err5.message);
                    }
                    
                    // Add last_location_at column to drivers
                    db.run(`ALTER TABLE drivers ADD COLUMN last_location_at TEXT`, (err6) => {
                      if (err6 && !err6.message.includes('duplicate column')) {
                        console.error('Migration error (last_location_at column):', err6.message);
                      }
                      resolve();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  },
  {
    version: 19,
    name: 'add_driver_truck_relation',
    description: 'Add truck_plate column to drivers for linking drivers to trucks',
    up: (db) => {
      return new Promise((resolve) => {
        // Add truck_plate column to drivers to link with trucks
        db.run(`ALTER TABLE drivers ADD COLUMN truck_plate TEXT`, (err1) => {
          if (err1 && !err1.message.includes('duplicate column')) {
            console.error('Migration error (truck_plate column):', err1.message);
          }
          
          // Try to auto-link drivers to trucks based on matching driver_name
          db.run(`
            UPDATE drivers 
            SET truck_plate = (
              SELECT plate FROM trucks 
              WHERE UPPER(TRIM(trucks.driver_name)) = UPPER(TRIM(drivers.name))
              LIMIT 1
            )
            WHERE truck_plate IS NULL
          `, (err2) => {
            if (err2) {
              console.error('Auto-link drivers to trucks error:', err2.message);
            }
            resolve();
          });
        });
      });
    }
  },
  {
    version: 20,
    name: 'create_driver_messages_table',
    description: 'Create driver_messages table for driver-operator messaging',
    up: (db) => {
      return new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS driver_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            sender_type TEXT NOT NULL CHECK(sender_type IN ('driver', 'operator')),
            sender_id TEXT,
            sender_name TEXT,
            message TEXT,
            image_path TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
          )
        `, (err) => {
          if (err) {
            console.error('Create driver_messages error:', err.message);
            return reject(err);
          }
          
          // Create indexes for faster queries
          db.run(`CREATE INDEX IF NOT EXISTS idx_driver_messages_driver_id ON driver_messages(driver_id)`, (indexErr) => {
            if (indexErr) console.error('Create index error:', indexErr.message);
          });
          
          db.run(`CREATE INDEX IF NOT EXISTS idx_driver_messages_created_at ON driver_messages(created_at)`, (indexErr2) => {
            if (indexErr2) console.error('Create index error:', indexErr2.message);
            resolve();
          });
        });
      });
    }
  },
  {
    version: 21,
    name: 'add_user_management_columns',
    description: 'Add is_active, last_login, and created_at columns to users table for admin panel',
    up: (db) => {
      return new Promise((resolve, reject) => {
        // Check if columns exist and add them if not
        const columns = [
          { name: 'is_active', sql: 'ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1' },
          { name: 'last_login', sql: 'ALTER TABLE users ADD COLUMN last_login TEXT' },
          { name: 'created_at', sql: 'ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime(\'now\'))' }
        ];

        let completed = 0;
        columns.forEach(col => {
          db.run(col.sql, (err) => {
            // Ignore "duplicate column" errors
            if (err && !err.message.includes('duplicate column')) {
              console.error(`Add column ${col.name} error:`, err.message);
            }
            completed++;
            if (completed === columns.length) {
              resolve();
            }
          });
        });
      });
    }
  },
  {
    version: 22,
    name: 'create_contracts_table',
    description: 'Create contracts table for managing PDF contract documents',
    up: (db) => {
      return new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users(id)
          )
        `, (err) => {
          if (err) {
            console.error('Create contracts table error:', err.message);
            return reject(err);
          }
          
          // Create index for faster queries
          db.run(`CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at)`, (indexErr) => {
            if (indexErr) console.error('Create contracts index error:', indexErr.message);
            resolve();
          });
        });
      });
    }
  },
  {
    version: 23,
    name: 'add_contracts_extended_fields',
    description: 'Add extended fields to contracts table (dates, type, status, value, party info)',
    up: (db) => {
      return new Promise((resolve, reject) => {
        const alterQueries = [
          `ALTER TABLE contracts ADD COLUMN start_date TEXT`,
          `ALTER TABLE contracts ADD COLUMN expiry_date TEXT`,
          `ALTER TABLE contracts ADD COLUMN contract_type TEXT DEFAULT 'taşımacılık'`,
          `ALTER TABLE contracts ADD COLUMN status TEXT DEFAULT 'aktif'`,
          `ALTER TABLE contracts ADD COLUMN contract_value REAL`,
          `ALTER TABLE contracts ADD COLUMN currency TEXT DEFAULT 'EUR'`,
          `ALTER TABLE contracts ADD COLUMN party_name TEXT`,
          `ALTER TABLE contracts ADD COLUMN party_contact TEXT`,
          `ALTER TABLE contracts ADD COLUMN party_email TEXT`
        ];
        
        let completed = 0;
        alterQueries.forEach(query => {
          db.run(query, (err) => {
            // Duplicate column hatası normaldir, yoksay
            if (err && !err.message.includes('duplicate column')) {
              console.error('ALTER contracts error:', err.message);
            }
            completed++;
            if (completed === alterQueries.length) {
              // Create indexes
              db.run(`CREATE INDEX IF NOT EXISTS idx_contracts_expiry_date ON contracts(expiry_date)`, () => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)`, () => {
                  db.run(`CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts(contract_type)`, () => {
                    resolve();
                  });
                });
              });
            }
          });
        });
      });
    }
  },
  {
    version: 24,
    name: 'create_contract_files_table',
    description: 'Create contract_files table for multiple PDF uploads per contract',
    up: (db) => {
      return new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS contract_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contract_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            description TEXT,
            version INTEGER DEFAULT 1,
            uploaded_at TEXT DEFAULT (datetime('now')),
            uploaded_by INTEGER,
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
          )
        `, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.error('Create contract_files table error:', err.message);
            return reject(err);
          }
          
          // Create indexes
          db.run(`CREATE INDEX IF NOT EXISTS idx_contract_files_contract_id ON contract_files(contract_id)`, () => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_contract_files_uploaded_at ON contract_files(uploaded_at DESC)`, () => {
              console.log('[Migration] contract_files table created');
              resolve();
            });
          });
        });
      });
    }
  }
];

/**
 * Create migrations tracking table
 */
function createMigrationsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Get applied migrations
 */
function getAppliedMigrations(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT version FROM _migrations ORDER BY version', [], (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []).map(r => r.version));
    });
  });
}

/**
 * Record a migration as applied
 */
function recordMigration(db, migration) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO _migrations (version, name, description) VALUES (?, ?, ?)',
      [migration.version, migration.name, migration.description],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Run all pending migrations
 */
async function runMigrations(db) {
  console.log('[Migrations] Starting migration check...');
  
  try {
    await createMigrationsTable(db);
    const applied = await getAppliedMigrations(db);
    
    const pending = migrations.filter(m => !applied.includes(m.version));
    
    if (pending.length === 0) {
      console.log('[Migrations] Database is up to date.');
      return { applied: 0, total: migrations.length };
    }
    
    console.log(`[Migrations] Found ${pending.length} pending migration(s).`);
    
    for (const migration of pending.sort((a, b) => a.version - b.version)) {
      console.log(`[Migrations] Running: ${migration.version} - ${migration.name}`);
      try {
        await migration.up(db);
        await recordMigration(db, migration);
        console.log(`[Migrations] Completed: ${migration.name}`);
      } catch (err) {
        console.error(`[Migrations] Failed: ${migration.name}`, err);
        throw err;
      }
    }
    
    console.log(`[Migrations] Successfully applied ${pending.length} migration(s).`);
    return { applied: pending.length, total: migrations.length };
    
  } catch (err) {
    console.error('[Migrations] Migration error:', err);
    throw err;
  }
}

/**
 * Get migration status
 */
async function getMigrationStatus(db) {
  try {
    await createMigrationsTable(db);
    const applied = await getAppliedMigrations(db);
    
    return migrations.map(m => ({
      version: m.version,
      name: m.name,
      description: m.description,
      applied: applied.includes(m.version)
    }));
  } catch (err) {
    console.error('[Migrations] Status check error:', err);
    return [];
  }
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  migrations
};
