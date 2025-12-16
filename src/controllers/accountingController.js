const fs = require('fs');
const path = require('path');
const multer = require('multer');
const LogModel = require('../models/logModel');
const db = require('../config/db');
const NotificationService = require('../services/notificationService');

// Dosya yükleme klasörü
const UPLOAD_DIR = path.join(__dirname, '../../uploads/accounting');

// Klasörleri oluştur
const documentTypes = ['export-ameta', 'import-ameta', 't1', 'cmr'];

// Evrakların tamamlanıp tamamlanmadığını kontrol et
function checkDocumentsComplete(positionNo, username, callback) {
  // Mevcut evrakları kontrol et
  db.all(
    "SELECT DISTINCT type FROM documents WHERE position_no = ? AND type IS NOT NULL AND trim(type) <> ''",
    [positionNo],
    (err, docs) => {
      if (err) return callback(err);
      
      const present = new Set();
      (docs || []).forEach(d => {
        if (d.type) present.add(d.type);
      });
      
      // T1-GMR klasöründe dosya var mı kontrol et
      const safePosNo = (positionNo || '').replace(/\//g, '-');
      const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
      let hasT1Files = false;
      
      // Position klasörlerini kontrol et
      if (fs.existsSync(UPLOAD_ROOT)) {
        const dirents = fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true });
        for (const d of dirents) {
          if (!d.isDirectory()) continue;
          if (d.name === safePosNo || d.name.includes(safePosNo)) {
            const t1Paths = [
              path.join(UPLOAD_ROOT, d.name, 'T1-GMR'),
              path.join(UPLOAD_ROOT, d.name, 'T1')
            ];
            for (const t1Path of t1Paths) {
              if (fs.existsSync(t1Path)) {
                const files = fs.readdirSync(t1Path);
                if (files.length > 0) {
                  hasT1Files = true;
                  break;
                }
              }
            }
            break;
          }
        }
      }
      
      // T1 dosyası varsa hem t1 hem cmr tipini mevcut say (sayfa mantığıyla aynı)
      if (hasT1Files) {
        present.add('t1');
        present.add('cmr');
      }
      
      // Tüm tipler mevcut mu kontrol et
      const allComplete = documentTypes.every(t => present.has(t));
      
      callback(null, allComplete);
    }
  );
}

documentTypes.forEach(type => {
  const dir = path.join(UPLOAD_DIR, type);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer configuration - temporary storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(UPLOAD_DIR, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const uploadMiddleware = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Geçersiz dosya türü'));
    }
  }
}).array('files', 10); // make this the actual middleware handler for field name 'files'

// Accounting index - list positions and show missing documents
exports.index = (req, res) => {
  // Get year from query or use current year
  const year = req.query.year || res.locals.year || new Date().getFullYear();
  const yearPrefix = String(year).slice(-2); // 2025 -> "25"
  
  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  
  // get recent positions (one row per position_no): prefer the latest row that has a non-empty ihr_poz,
  // otherwise fall back to the latest row for that position.
  // Filter by year prefix
  const countSql = `
    SELECT COUNT(DISTINCT position_no) as total
    FROM loads
    WHERE position_no LIKE ?
  `;
  
  const sql = `
    SELECT l.position_no, l.ihr_poz, l.truck_plate, l.trailer_plate, l.id
    FROM loads l
    JOIN (
      SELECT position_no,
        COALESCE(
          MAX(CASE WHEN ihr_poz IS NOT NULL AND trim(ihr_poz) <> '' THEN id END),
          MAX(id)
        ) AS pick_id
      FROM loads
      WHERE position_no LIKE ?
      GROUP BY position_no
    ) mx ON l.position_no = mx.position_no AND l.id = mx.pick_id
    ORDER BY 
      CAST(SUBSTR(l.position_no, 4, INSTR(SUBSTR(l.position_no, 4), '-') - 1) AS INTEGER) DESC,
      CAST(SUBSTR(l.position_no, 4 + INSTR(SUBSTR(l.position_no, 4), '-')) AS INTEGER) DESC
    LIMIT ? OFFSET ?
  `;
  
  const yearPattern = yearPrefix + '/%';
  
  // First get total count for pagination
  db.get(countSql, [yearPattern], (countErr, countRow) => {
    const totalPositions = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(totalPositions / limit);
    
    db.all(sql, [yearPattern, limit, offset], (err, rows) => {
    if (err) {
      console.error('Error fetching positions for accounting:', err);
      // 25-200-552 pozisyonuna yüklenen T1 ve CMR belgelerini oku
      const t1Dir = path.join(__dirname, '../../uploads/25-200-552/T1-GMR');
      const cmrDir = path.join(__dirname, '../../uploads/25-200-552/Evraklar');
      let t1Files = [];
      let cmrFiles = [];
      try {
        if (fs.existsSync(t1Dir)) {
          t1Files = fs.readdirSync(t1Dir).map(f => ({
            filename: f,
            original_name: f,
            url: `/uploads/25-200-552/T1-GMR/${f}`
          }));
        }
        if (fs.existsSync(cmrDir)) {
          // Sadece CMR dosyalarını filtrele (ör: ismi CMR içerenler veya tümü)
          cmrFiles = fs.readdirSync(cmrDir)
            .filter(f => f.toLowerCase().includes('cmr') || f.toLowerCase().endsWith('.pdf'))
            .map(f => ({
              filename: f,
              original_name: f,
              url: `/uploads/25-200-552/Evraklar/${f}`
            }));
        }
      } catch (e) {
        t1Files = [];
        cmrFiles = [];
      }
      return res.render('accounting/index', {
        currentUser: req.session.user,
        positions: [],
        isReadOnly: req.session.user && req.session.user.role === 'accounting_readonly',
        t1Files_552: t1Files,
        cmrFiles_552: cmrFiles,
        year: year,
        currentPage: page,
        totalPages: totalPages,
        totalPositions: totalPositions
      });
    }

    if (!rows || rows.length === 0) {
      return res.render('accounting/index', { 
        currentUser: req.session.user, 
        positions: [], 
        isReadOnly: req.session.user && req.session.user.role === 'accounting_readonly',
        year: year,
        currentPage: page,
        totalPages: totalPages,
        totalPositions: totalPositions
      });
    }

    const displayName = {
      'export-ameta': 'İhracat AMETA',
      'import-ameta': 'İthalat AMETA',
      't1': 'T1',
      'cmr': 'CMR'
    };

    const positions = rows.map(r => ({ position_no: r.position_no, ihr_poz: r.ihr_poz, truck_plate: r.truck_plate || null, trailer_plate: r.trailer_plate || null, missing_documents: [] }));
    let remaining = positions.length;
    const PositionKmModel = require('../models/positionKmModel');

    // Tüm KM verilerini tek seferde çek
    PositionKmModel.getAll((kmErr, kmRows) => {
      const kmMap = {};
      if (kmRows && Array.isArray(kmRows)) {
        kmRows.forEach(km => { kmMap[km.position_no] = km; });
      }

      positions.forEach((p, idx) => {
        // Only consider documents that were uploaded via the accounting UI (have a non-empty `type`).
        // Position uploads (other parts of the app) do not set `type` and should not count toward accounting's "missing documents".
        db.all("SELECT DISTINCT type, category FROM documents WHERE position_no = ? AND type IS NOT NULL AND trim(type) <> ''", [p.position_no], (dErr, docs) => {
          try {
            const present = new Set();
            (docs || []).forEach(d => {
              if (d.type) present.add(d.type);
              else if (d.category) {
                // best-effort map category to a type
                const c = (d.category || '').toLowerCase();
                if (c.includes('t1')) present.add('t1');
                else if (c.includes('cmr')) present.add('cmr');
                else present.add('export-ameta');
              }
            });

            const missing = [];
            documentTypes.forEach(t => { if (!present.has(t)) missing.push(displayName[t] || t); });
            positions[idx].missing_documents = missing;
            // KM verisini ekle
            positions[idx].km = kmMap[p.position_no] || null;
            // Plate display: prefer truck_plate, then trailer; show both if present
            try {
              const tp = positions[idx].truck_plate || '';
              const trp = positions[idx].trailer_plate || '';
              let plateStr = '-';
              if (tp && trp) plateStr = `${tp} / ${trp}`;
              else if (tp) plateStr = tp;
              else if (trp) plateStr = trp;
              positions[idx].plate = plateStr;
            } catch (e) {
              positions[idx].plate = '-';
            }
          } catch (e) {
            console.error('Error computing missing docs for position', p.position_no, e);
            positions[idx].missing_documents = [];
            positions[idx].km = null;
          }

          remaining -= 1;
          if (remaining === 0) {
            // For each position, detect if there are T1/GMR files present in the uploads/<posDir>/T1-GMR or T1 folders
            try {
              const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
              positions.forEach(p => { p.has_t1_files = false; });
              if (fs.existsSync(UPLOAD_ROOT)) {
                const rootDirents = fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true });
                positions.forEach(p => {
                  try {
                    let posDirName = null;
                    for (const d of rootDirents) {
                      if (!d.isDirectory()) continue;
                      const name = d.name;
                      if (name === 'accounting' || name === 'mail_attachments') continue;
                      if (p.ihr_poz) {
                        const ihr = String(p.ihr_poz);
                        const variants = [
                          ihr,
                          ihr.replace(/[\\/\s]+/g, '-'),
                          ihr.replace(/[\\/\s]+/g, '_'),
                          ihr.replace(/[\\/]+/g, '')
                        ];
                        if (variants.includes(name) || variants.some(v => v && name.indexOf(v) !== -1)) {
                          posDirName = name;
                          break;
                        }
                      }
                      const pHyphen = String(p.position_no).replace(/[\\/\s]+/g, '-');
                      if (name.indexOf(pHyphen) !== -1 || name.indexOf(String(p.position_no)) !== -1) {
                        posDirName = name;
                        break;
                      }
                    }

                    if (posDirName) {
                      const t1Paths = [path.join(UPLOAD_ROOT, posDirName, 'T1-GMR'), path.join(UPLOAD_ROOT, posDirName, 'T1')];
                      for (const tp of t1Paths) {
                        if (fs.existsSync(tp)) {
                          const files = fs.readdirSync(tp).filter(f => f && f.trim() !== '');
                          if (files.length > 0) {
                            p.has_t1_files = true;
                            break;
                          }
                        }
                      }
                    }
                  } catch (e) {
                    // ignore per-position errors
                  }
                });
              }
            } catch (e) {
              console.error('Error detecting position T1 files:', e);
            }

            return res.render('accounting/index', { 
              currentUser: req.session.user, 
              positions, 
              isReadOnly: req.session.user && req.session.user.role === 'accounting_readonly',
              year: year,
              currentPage: page,
              totalPages: totalPages,
              totalPositions: totalPositions
            });
          }
        });
      });
    });
  });
  });
};

// Dosya yükleme (opsiyonel position_no ile)
exports.upload = (req, res) => {
  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: 'Yükleme hatası: ' + err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Dosya seçilmedi!' });
    }

    const type = req.body.type;
    if (!documentTypes.includes(type)) {
      // Temp dosyaları temizle
      req.files.forEach(file => fs.unlinkSync(file.path));
      return res.status(400).json({ success: false, error: 'Geçersiz belge tipi!' });
    }

    // Helper to sanitize folder name from ihr_poz
    function sanitizeFolderName(name) {
      if (!name) return null;
      return String(name).replace(/[\\/\?%\*:|"<> ]+/g, '_').replace(/__+/g, '_').substring(0, 200);
    }

    const movedFiles = [];
    const positionNo = req.body.position_no;

    // Function that moves files to a targetDir, records movedFiles and optionally inserts documents
    function moveFilesAndRecord(targetDir, callback) {
      try {
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        req.files.forEach(file => {
          const targetPath = path.join(targetDir, file.filename);
          // Cross-device move: try rename, fallback to copy+unlink
          try {
            fs.renameSync(file.path, targetPath);
          } catch (renameErr) {
            if (renameErr.code === 'EXDEV') {
              fs.copyFileSync(file.path, targetPath);
              fs.unlinkSync(file.path);
            } else {
              throw renameErr;
            }
          }
          movedFiles.push({ name: file.filename, originalName: file.originalname, path: targetPath });
        });

        // If positionNo present, insert into documents table using mapped category
        if (positionNo) {
          const typeToCategory = {
            'export-ameta': 'Evraklar',
            'import-ameta': 'Evraklar',
            't1': 'T1/GMR',
            'cmr': 'CMR'
          };
          const category = typeToCategory[type] || 'Evraklar';

          try {
            const stmt = db.prepare(`INSERT INTO documents (position_no, filename, original_name, category, type) VALUES (?, ?, ?, ?, ?)`);
            movedFiles.forEach(f => {
              try {
                stmt.run(positionNo, f.name, f.originalName, category, type);
                // Log the upload action
                try {
                  LogModel.create({
                    username: req.session && req.session.user ? req.session.user.username : null,
                    role: req.session && req.session.user ? req.session.user.role : null,
                    entity: 'position',
                    entity_id: positionNo,
                    action: 'upload_document',
                    field: 'document',
                    old_value: null,
                    new_value: JSON.stringify({ filename: f.name, original_name: f.originalName, category, type })
                  });
                } catch (e) {
                  console.error('Log create error (upload):', e);
                }
              } catch (e) {
                console.error('Error inserting document record:', e);
              }
            });
          } catch (e) {
            console.error('Error preparing document insert statement:', e);
          }
        }

        return callback(null);
      } catch (err) {
        return callback(err);
      }
    }

    // Evrak tipi görünen adları
    const displayName = {
      'export-ameta': 'İhracat Ameta',
      'import-ameta': 'İthalat Ameta',
      't1': 'T1',
      'cmr': 'CMR'
    };

    // If position_no given, try to lookup ihr_poz for folder naming
    if (positionNo) {
      db.get('SELECT ihr_poz FROM loads WHERE position_no = ? LIMIT 1', [positionNo], (qErr, row) => {
        if (qErr) {
          console.error('Error fetching ihr_poz for position:', qErr);
          // fallback to default type folder
          const targetDir = path.join(UPLOAD_DIR, type);
          moveFilesAndRecord(targetDir, (mErr) => {
            if (mErr) {
              console.error('File move error:', mErr);
              return res.status(500).json({ success: false, error: 'Dosya taşıma hatası: ' + mErr.message });
            }
            // Evraklar tamamlandı mı kontrol et ve bildirim gönder
            checkDocumentsComplete(positionNo, req.session?.user?.username, (chkErr, isComplete) => {
              console.log('[Documents] Complete check for', positionNo, '- isComplete:', isComplete);
              if (!chkErr && isComplete) {
                console.log('[Documents] ✅ All docs complete! Sending notification...');
                const lastFile = movedFiles.length > 0 ? movedFiles[movedFiles.length - 1].originalName : null;
                const folderName = displayName[type] || type;
                NotificationService.notifyDocumentsComplete(positionNo, req.session?.user?.username, lastFile, folderName)
                  .then(() => console.log('[Documents] Notification sent!'))
                  .catch(err => console.error('[Notification] Documents complete error:', err));
              }
            });
            return res.json({ success: true, message: `${movedFiles.length} dosya başarıyla yüklendi`, files: movedFiles });
          });
        } else {
          const ihr = row && row.ihr_poz ? sanitizeFolderName(row.ihr_poz) : null;
          // Store files directly under uploads/accounting/<ihr_poz>/ (no type subfolder)
          const targetDir = ihr ? path.join(UPLOAD_DIR, ihr) : path.join(UPLOAD_DIR, type);
          moveFilesAndRecord(targetDir, (mErr) => {
            if (mErr) {
              console.error('File move error:', mErr);
              return res.status(500).json({ success: false, error: 'Dosya taşıma hatası: ' + mErr.message });
            }
            // Evraklar tamamlandı mı kontrol et ve bildirim gönder
            checkDocumentsComplete(positionNo, req.session?.user?.username, (chkErr, isComplete) => {
              console.log('[Documents] Complete check for', positionNo, '- isComplete:', isComplete);
              if (!chkErr && isComplete) {
                console.log('[Documents] ✅ All docs complete! Sending notification...');
                const lastFile = movedFiles.length > 0 ? movedFiles[movedFiles.length - 1].originalName : null;
                const folderName = displayName[type] || type;
                NotificationService.notifyDocumentsComplete(positionNo, req.session?.user?.username, lastFile, folderName)
                  .then(() => console.log('[Documents] Notification sent!'))
                  .catch(err => console.error('[Notification] Documents complete error:', err));
              }
            });
            return res.json({ success: true, message: `${movedFiles.length} dosya başarıyla yüklendi`, files: movedFiles });
          });
        }
      });
    } else {
      // No positionNo -> standard type folder
      // No positionNo -> keep previous behavior: type folder
      const targetDir = path.join(UPLOAD_DIR, type);
      moveFilesAndRecord(targetDir, (mErr) => {
        if (mErr) {
          console.error('File move error:', mErr);
          return res.status(500).json({ success: false, error: 'Dosya taşıma hatası: ' + mErr.message });
        }
        return res.json({ success: true, message: `${movedFiles.length} dosya başarıyla yüklendi`, files: movedFiles });
      });
    }
  });
};

// List documents for a specific position, grouped by category/type
exports.positionFiles = (req, res) => {
  const positionNo = req.params.positionNo;
  if (!positionNo) return res.json({ success: true, files: [] });

  // Only return documents that were uploaded via the accounting UI (have a non-empty 'type').
  // Additionally, include files that exist under the uploads/<ihr_poz>/... folders (T1-GMR, CMR, Evraklar)
  const sql = `SELECT id, filename, original_name, category, type, created_at FROM documents WHERE position_no = ? AND type IS NOT NULL AND trim(type) <> '' ORDER BY created_at DESC`;

  db.all(sql, [positionNo], (err, rows) => {
    if (err) {
      console.error('Error fetching documents for position:', err);
      // continue and still try to read filesystem files
      rows = [];
    }

    const files = Array.isArray(rows) ? rows.slice() : [];

    // find ihr_poz for this position to locate filesystem folder
    db.get('SELECT ihr_poz FROM loads WHERE position_no = ? LIMIT 1', [positionNo], (qErr, loadRow) => {
      try {
        const ihr = loadRow && loadRow.ihr_poz ? String(loadRow.ihr_poz) : null;
        const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
        let posDirName = null;

        // enumerate uploads root directories and try to match by several strategies
        if (fs.existsSync(UPLOAD_ROOT)) {
          const dirents = fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true });
          for (const d of dirents) {
            if (!d.isDirectory()) continue;
            const name = d.name;
            if (name === 'accounting' || name === 'mail_attachments') continue;
            if (ihr) {
              const variants = [
                ihr,
                ihr.replace(/[\\/\s]+/g, '-'),
                ihr.replace(/[\\/\s]+/g, '_'),
                ihr.replace(/[\\/]+/g, ''),
              ];
              if (variants.includes(name) || variants.some(v => v && name.indexOf(v) !== -1)) {
                posDirName = name;
                break;
              }
            }
            // fallback: if directory name contains the numeric part of positionNo (use positions with hyphen)
            const pHyphen = String(positionNo).replace(/[\\/\s]+/g, '-');
            if (name.indexOf(pHyphen) !== -1 || name.indexOf(positionNo) !== -1) {
              posDirName = name;
              break;
            }
          }
        }

        if (posDirName) {
          const posDir = path.join(UPLOAD_ROOT, posDirName);
          // Only include T1/GMR and CMR subfolders from position folders — do NOT include general Evraklar
          const candidateSubdirs = [ 'T1-GMR', 'T1', 'CMR' ];
          const addedFilenames = new Set(files.map(f => f.filename));

          candidateSubdirs.forEach(sub => {
            const subPath = path.join(posDir, sub);
            if (!fs.existsSync(subPath)) return;
            try {
              fs.readdirSync(subPath).forEach(fname => {
                if (addedFilenames.has(fname)) return;
                const stat = fs.statSync(path.join(subPath, fname));
                const category = sub.toLowerCase().includes('t1') ? 'T1/GMR' : (sub.toLowerCase().includes('cmr') ? 'CMR' : 'Evraklar');
                files.push({ filename: fname, original_name: fname, category: category, type: null, created_at: stat.mtime, _fs_path: `/uploads/${posDirName}/${sub}/${fname}` });
                addedFilenames.add(fname);
              });
            } catch (e) {
              console.error('Error reading position subfolder', subPath, e);
            }
          });
        }

        // Return combined result (documents from DB first, then filesystem ones)
        return res.json({ success: true, files });
      } catch (e) {
        console.error('Error assembling position files:', e);
        return res.json({ success: true, files: rows || [] });
      }
    });
  });
};

// Dosyaları listeleme
exports.listFiles = (req, res) => {
  const { type } = req.params;

  if (!documentTypes.includes(type)) {
    return res.status(400).json({ success: false, error: 'Geçersiz belge tipi!' });
  }

  try {
    const files = [];

    // Check base folder uploads/accounting/<type>
    const baseDir = path.join(UPLOAD_DIR, type);
    if (fs.existsSync(baseDir)) {
      fs.readdirSync(baseDir).forEach(filename => {
        const stat = fs.statSync(path.join(baseDir, filename));
        files.push({ name: filename, uploadDate: stat.mtime });
      });
    }

    // Check subfolders uploads/accounting/<ihr_poz>/ (no type subfolder)
    fs.readdirSync(UPLOAD_DIR, { withFileTypes: true }).forEach(dirent => {
      if (dirent.isDirectory()) {
        const subDirPath = path.join(UPLOAD_DIR, dirent.name);
        // Skip known type folders (e.g., export-ameta) which are at root
        if (documentTypes.includes(dirent.name)) return;
        if (fs.existsSync(subDirPath)) {
          fs.readdirSync(subDirPath).forEach(filename => {
            const stat = fs.statSync(path.join(subDirPath, filename));
            files.push({ name: filename, uploadDate: stat.mtime, folder: dirent.name });
          });
        }
      }
    });

    // Tarihe göre sırala (en yeni en üstte)
    files.sort((a, b) => b.uploadDate - a.uploadDate);

    res.json({ success: true, files });
  } catch (error) {
    console.error('List files error:', error);
    res.json({ success: true, files: [] });
  }
};

// Dosya görüntüleme
exports.viewFile = (req, res) => {
  const { type, filename } = req.params;

  if (!documentTypes.includes(type)) {
    return res.status(400).send('Geçersiz belge tipi!');
  }
  // Try base folder first (legacy)
  let filePath = path.join(UPLOAD_DIR, type, filename);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);

  // Then search per-IHR_POZ subfolders: uploads/accounting/<ihr_poz>/<filename>
  const dirents = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true });
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      // skip known type folders at root
      if (documentTypes.includes(dirent.name)) continue;
      const candidate = path.join(UPLOAD_DIR, dirent.name, filename);
      if (fs.existsSync(candidate)) {
        return res.sendFile(candidate);
      }
    }
  }

  return res.status(404).send('Dosya bulunamadı!');
};

// Dosya silme
exports.deleteFile = (req, res) => {
  const { type, filename } = req.params;

  if (!documentTypes.includes(type)) {
    return res.status(400).json({ success: false, error: 'Geçersiz belge tipi!' });
  }

  const legacyPath = path.join(UPLOAD_DIR, type, filename);

  // Read document row once, then perform deletion checks inside callback to avoid races
  db.get('SELECT id, position_no, filename, original_name FROM documents WHERE filename = ? LIMIT 1', [filename], (getErr, docRow) => {
    if (getErr) console.error('Error reading document for log:', getErr);

    try {
      if (fs.existsSync(legacyPath)) {
        try { fs.unlinkSync(legacyPath); } catch (fsErr) { console.error('File unlink error:', fsErr); }
        db.run('DELETE FROM documents WHERE filename = ?', [filename], (dErr) => { if (dErr) console.error('Error deleting document record:', dErr); });
        try {
          LogModel.create({
            username: req.session && req.session.user ? req.session.user.username : null,
            role: req.session && req.session.user ? req.session.user.role : null,
            entity: 'position',
            entity_id: docRow ? docRow.position_no : null,
            action: 'delete_document',
            field: 'document',
            old_value: JSON.stringify({ filename: filename, original_name: docRow ? docRow.original_name : null, category: docRow ? docRow.category : null, type: docRow ? docRow.type : null }),
            new_value: null
          });
        } catch (e) { console.error('Log create error (delete):', e); }
        return res.json({ success: true, message: 'Dosya silindi' });
      }

      // Search per-IHR_POZ subfolders uploads/accounting/<ihr_poz>/<filename>
      const dirents = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true });
      for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue;
        if (documentTypes.includes(dirent.name)) continue;
        const candidate = path.join(UPLOAD_DIR, dirent.name, filename);
        if (fs.existsSync(candidate)) {
          try { fs.unlinkSync(candidate); } catch (fsErr) { console.error('File unlink error:', fsErr); }
          db.run('DELETE FROM documents WHERE filename = ?', [filename], (dErr) => { if (dErr) console.error('Error deleting document record:', dErr); });
          try {
            LogModel.create({
              username: req.session && req.session.user ? req.session.user.username : null,
              role: req.session && req.session.user ? req.session.user.role : null,
              entity: 'position',
              entity_id: docRow ? docRow.position_no : null,
              action: 'delete_document',
              field: 'document',
              old_value: JSON.stringify({ filename: filename, original_name: docRow ? docRow.original_name : null, category: docRow ? docRow.category : null, type: docRow ? docRow.type : null }),
              new_value: null
            });
          } catch (e) { console.error('Log create error (delete):', e); }
          return res.json({ success: true, message: 'Dosya silindi' });
        }
      }

      return res.status(404).json({ success: false, error: 'Dosya bulunamadı!' });
    } catch (error) {
      console.error('Delete file error:', error);
      return res.status(500).json({ success: false, error: 'Silme hatası: ' + error.message });
    }
  });
};
