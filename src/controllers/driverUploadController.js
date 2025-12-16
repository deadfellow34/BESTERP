// backend/src/controllers/driverUploadController.js
const DriverUploadModel = require('../models/driverUploadModel');
const LogModel = require('../models/logModel');
const NotificationService = require('../services/notificationService');
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const driverUploadController = {
  /**
   * GET /driver-upload/:token
   * Show the minimal upload page for drivers
   */
  showUploadPage(req, res) {
    const { token } = req.params;
    
    DriverUploadModel.validateToken(token, true, (err, result) => {
      if (err) {
        console.error('[DriverUpload] Token validation error:', err);
        return res.render('driver-upload/error', {
          layout: false,
          message: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.'
        });
      }
      
      if (!result.valid) {
        return res.render('driver-upload/error', {
          layout: false,
          message: result.reason || 'Geçersiz veya süresi dolmuş link.'
        });
      }
      
      // Token is valid, get load info for trailer plate
      const positionNo = result.token.position_no;
      
      db.get('SELECT trailer_plate, driver_name FROM loads WHERE position_no = ?', [positionNo], (loadErr, load) => {
        if (loadErr) {
          console.error('[DriverUpload] Load fetch error:', loadErr);
        }
        
        res.render('driver-upload/upload', {
          layout: false,
          token: token,
          positionNo: positionNo,
          trailerPlate: load?.trailer_plate || '',
          driverName: load?.driver_name || ''
        });
      });
    });
  },

  /**
   * POST /driver-upload/:token
   * Handle file upload from driver
   */
  handleUpload(req, res) {
    const { token } = req.params;
    
    // First validate token
    DriverUploadModel.validateToken(token, true, (err, result) => {
      if (err) {
        console.error('[DriverUpload] Token validation error:', err);
        return res.render('driver-upload/error', {
          layout: false,
          message: 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.'
        });
      }
      
      if (!result.valid) {
        return res.render('driver-upload/error', {
          layout: false,
          message: result.reason || 'Geçersiz veya süresi dolmuş link.'
        });
      }
      
      const tokenData = result.token;
      const positionNo = tokenData.position_no;
      const safePosNo = positionNo.replace(/\//g, '-');
      
      // Category for Teslim CMR is 'CMR'
      const category = 'CMR';
      const safeCategory = 'CMR';
      
      // Configure multer for file upload
      const uploadDir = path.join(__dirname, '../../uploads', safePosNo, safeCategory);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const storage = multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file.originalname);
          cb(null, 'driver-' + uniqueSuffix + ext);
        }
      });
      
      const maxUploadMb = parseInt(process.env.MAX_UPLOAD_MB, 10) || 50;
      const upload = multer({
        storage: storage,
        limits: { fileSize: maxUploadMb * 1024 * 1024 },
        fileFilter: function (req, file, cb) {
          // Accept images only
          const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Sadece resim dosyaları yüklenebilir'), false);
          }
        }
      }).array('files', 10);
      
      upload(req, res, function (uploadErr) {
        if (uploadErr) {
          console.error('[DriverUpload] Upload error:', uploadErr);
          let errorMessage = 'Dosya yükleme hatası.';
          if (uploadErr instanceof multer.MulterError) {
            if (uploadErr.code === 'LIMIT_FILE_SIZE') {
              errorMessage = 'Dosya çok büyük.';
            }
          } else if (uploadErr.message) {
            errorMessage = uploadErr.message;
          }
          return res.render('driver-upload/error', {
            layout: false,
            message: errorMessage
          });
        }
        
        if (!req.files || req.files.length === 0) {
          return res.render('driver-upload/error', {
            layout: false,
            message: 'Lütfen en az bir dosya seçin.'
          });
        }
        
        // Helper function to fix filename encoding
        function fixFilename(filename) {
          try {
            return Buffer.from(filename, 'latin1').toString('utf8');
          } catch (e) {
            return filename;
          }
        }
        
        // Get driver name from form
        const driverName = req.body.driverName || '';
        
        // Save each file to database
        let savedCount = 0;
        const totalFiles = req.files.length;
        
        req.files.forEach((file, index) => {
          const originalName = fixFilename(file.originalname);
          const filePathInDb = `${safePosNo}/${safeCategory}/${file.filename}`;
          
          const sql = `INSERT INTO documents (position_no, filename, original_name, category, type, uploaded_by, created_at) VALUES (?, ?, ?, ?, 'driver_upload', ?, datetime('now'))`;
          
          db.run(sql, [positionNo, filePathInDb, originalName, category, driverName], function(dbErr) {
            if (dbErr) {
              console.error('[DriverUpload] DB save error:', dbErr);
            } else {
              savedCount++;
              
              // Log the upload
              try {
                LogModel.create({
                  username: 'driver_upload',
                  role: 'driver',
                  entity: 'position',
                  entity_id: positionNo,
                  action: 'driver_upload_document',
                  field: 'documents',
                  old_value: null,
                  new_value: JSON.stringify({
                    id: this.lastID,
                    filename: filePathInDb,
                    original_name: originalName,
                    category: category,
                    token_id: tokenData.id
                  })
                });
              } catch (logErr) {
                console.error('[DriverUpload] Log error:', logErr);
              }
            }
            
            // When all files processed
            if (index === totalFiles - 1) {
              if (savedCount > 0) {
                // Get driver name from form
                const driverNameFromForm = req.body.driverName || 'Şoför';
                
                // Send notification to all users
                NotificationService.broadcast(
                  'document',
                  `${positionNo} - Teslim CMR Yüklendi`,
                  `"${driverNameFromForm}" tarafından ${savedCount} adet Teslim CMR yüklendi.`,
                  `/loads/position/${positionNo}`,
                  { positionNo, driverName: driverNameFromForm, fileCount: savedCount }
                ).catch(err => console.error('[DriverUpload] Notification error:', err));
                
                res.render('driver-upload/success', {
                  layout: false,
                  fileCount: savedCount,
                  positionNo: positionNo,
                  token: token
                });
              } else {
                res.render('driver-upload/error', {
                  layout: false,
                  message: 'Dosyalar kaydedilemedi. Lütfen tekrar deneyin.'
                });
              }
            }
          });
        });
      });
    });
  },

  /**
   * Check existing token (no creation)
   * GET /loads/position/:positionNo/check-driver-upload-link
   */
  checkExistingToken(req, res) {
    const positionNo = req.params.positionNo;
    
    DriverUploadModel.getActiveTokenForPosition(positionNo, (err, existingToken) => {
      if (err) {
        console.error('[DriverUpload] Error checking existing token:', err);
        return res.status(500).json({ success: false, message: 'Bir hata oluştu' });
      }
      
      if (existingToken) {
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const uploadUrl = `${baseUrl}/driver-upload/${existingToken.token}`;
        
        return res.json({
          success: true,
          hasToken: true,
          token: existingToken.token,
          uploadUrl: uploadUrl,
          expiresAt: existingToken.expires_at
        });
      }
      
      // No active token found
      return res.json({
        success: true,
        hasToken: false
      });
    });
  },

  /**
   * Create upload token (called from loadController)
   * POST /loads/position/:positionNo/create-driver-upload-link
   */
  createUploadToken(req, res) {
    const positionNo = req.params.positionNo;
    const username = req.session && req.session.user ? req.session.user.username : 'unknown';
    const expiresInHours = parseInt(req.body.expiresInHours) || 168; // 1 hafta = 168 saat
    
    // First check if there's an active token
    DriverUploadModel.getActiveTokenForPosition(positionNo, (err, existingToken) => {
      if (err) {
        console.error('[DriverUpload] Error checking existing token:', err);
        return res.status(500).json({ success: false, message: 'Bir hata oluştu' });
      }
      
      if (existingToken) {
        // Return existing active token
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const uploadUrl = `${baseUrl}/driver-upload/${existingToken.token}`;
        
        return res.json({
          success: true,
          token: existingToken.token,
          uploadUrl: uploadUrl,
          expiresAt: existingToken.expires_at,
          isExisting: true
        });
      }
      
      // Create new token
      DriverUploadModel.createToken(positionNo, username, expiresInHours, (createErr, newToken) => {
        if (createErr) {
          console.error('[DriverUpload] Error creating token:', createErr);
          return res.status(500).json({ success: false, message: 'Token oluşturulamadı' });
        }
        
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const uploadUrl = `${baseUrl}/driver-upload/${newToken.token}`;
        
        // Log the action
        try {
          LogModel.create({
            username: username,
            role: req.session && req.session.user ? req.session.user.role : null,
            entity: 'position',
            entity_id: positionNo,
            action: 'create_driver_upload_link',
            field: 'driver_upload_tokens',
            old_value: null,
            new_value: JSON.stringify({ token_id: newToken.id, expires_at: newToken.expires_at })
          });
        } catch (logErr) {
          console.error('[DriverUpload] Log error:', logErr);
        }
        
        res.json({
          success: true,
          token: newToken.token,
          uploadUrl: uploadUrl,
          expiresAt: newToken.expires_at,
          isExisting: false
        });
      });
    });
  },

  /**
   * Revoke upload token
   * POST /loads/position/:positionNo/revoke-driver-upload-link
   */
  revokeUploadToken(req, res) {
    const positionNo = req.params.positionNo;
    const username = req.session && req.session.user ? req.session.user.username : 'unknown';
    
    DriverUploadModel.revokeAllForPosition(positionNo, (err) => {
      if (err) {
        console.error('[DriverUpload] Error revoking tokens:', err);
        return res.status(500).json({ success: false, message: 'Bir hata oluştu' });
      }
      
      // Log the action
      try {
        LogModel.create({
          username: username,
          role: req.session && req.session.user ? req.session.user.role : null,
          entity: 'position',
          entity_id: positionNo,
          action: 'revoke_driver_upload_link',
          field: 'driver_upload_tokens',
          old_value: null,
          new_value: 'all_revoked'
        });
      } catch (logErr) {
        console.error('[DriverUpload] Log error:', logErr);
      }
      
      res.json({ success: true, message: 'Tüm linkler iptal edildi' });
    });
  },

  /**
   * GET /driver-uploads
   * Show the driver upload management page with all tokens and upload history
   */
  showManagementPage(req, res, next) {
    DriverUploadModel.getAllTokensWithStats((err, tokens) => {
      if (err) {
        console.error('[DriverUpload] Get all tokens error:', err);
        return next(err);
      }

      // Get upload details for each token
      const tokenIds = tokens.map(t => t.id);
      
      if (tokenIds.length === 0) {
        return res.render('driver-upload/management', {
          title: 'Şoför Link Yönetimi',
          tokens: [],
          uploads: []
        });
      }

      // Get all driver uploads (type = 'driver_upload')
      const sql = `
        SELECT 
          d.id,
          d.position_no,
          d.filename,
          d.original_name,
          d.category,
          d.uploaded_by as driver_name,
          d.created_at as upload_time,
          t.id as token_id,
          t.token,
          t.created_by,
          t.created_at as token_created_at
        FROM documents d
        INNER JOIN driver_upload_tokens t ON d.position_no = t.position_no
        WHERE d.type = 'driver_upload'
        ORDER BY d.created_at DESC
        LIMIT 500
      `;

      db.all(sql, [], (uploadErr, uploads) => {
        if (uploadErr) {
          console.error('[DriverUpload] Get uploads error:', uploadErr);
          return next(uploadErr);
        }

        res.render('driver-upload/management', {
          title: 'Şoför Link Yönetimi',
          tokens: tokens || [],
          uploads: uploads || []
        });
      });
    });
  }
};

module.exports = driverUploadController;
