/**
 * Contract Controller
 * Handles contract CRUD operations
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ContractModel = require('../models/contractModel');
const LogModel = require('../models/logModel');

// Upload directory for contracts
const UPLOAD_DIR = path.join(__dirname, '../../uploads/contracts');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer configuration for contract file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function(req, file, cb) {
    // Sanitize original filename
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    // Create unique filename: timestamp-sanitized-name.pdf
    cb(null, `${timestamp}-${baseName}${ext}`);
  }
});

const fileFilter = function(req, file, cb) {
  // Accept only PDF files
  const allowedTypes = /pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = file.mimetype === 'application/pdf';
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Sadece PDF dosyaları yüklenebilir.'));
  }
};

const uploadMiddleware = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: fileFilter
}).single('file');

/**
 * Helper: Format date for display
 */
function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const options = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return d.toLocaleDateString('tr-TR', options);
  } catch (e) {
    return dateStr;
  }
}

/**
 * Helper: Calculate days until expiry
 */
function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diff = expiry - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * List all contracts
 * GET /contracts
 */
exports.listContracts = (req, res, next) => {
  const filters = {
    search: req.query.search,
    contract_type: req.query.contract_type,
    status: req.query.status,
    start_date_from: req.query.start_date_from,
    start_date_to: req.query.start_date_to,
    expiry_date_from: req.query.expiry_date_from,
    expiry_date_to: req.query.expiry_date_to
  };
  
  // Check if any filters are active
  const hasFilters = Object.values(filters).some(v => v && v !== 'all');
  
  // First update any expired contracts
  ContractModel.getExpired(() => {
    const fetchContracts = hasFilters 
      ? (cb) => ContractModel.search(filters, cb)
      : (cb) => ContractModel.getAll(cb);
    
    fetchContracts((err, contracts) => {
      if (err) {
        console.error('[Contracts] Error fetching contracts:', err);
        return next(err);
      }
      
      // Format contracts for display
      const formattedContracts = (contracts || []).map(contract => {
        const daysLeft = daysUntilExpiry(contract.expiry_date);
        let expiryStatus = 'normal';
        if (daysLeft !== null) {
          if (daysLeft < 0) expiryStatus = 'expired';
          else if (daysLeft <= 7) expiryStatus = 'critical';
          else if (daysLeft <= 30) expiryStatus = 'warning';
        }
        
        return {
          ...contract,
          created_at_formatted: formatDate(contract.created_at, true),
          start_date_formatted: formatDate(contract.start_date),
          expiry_date_formatted: formatDate(contract.expiry_date),
          contract_type_label: ContractModel.CONTRACT_TYPES[contract.contract_type] || contract.contract_type,
          status_label: ContractModel.CONTRACT_STATUSES[contract.status] || contract.status,
          days_until_expiry: daysLeft,
          expiry_status: expiryStatus,
          contract_value_formatted: contract.contract_value 
            ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(contract.contract_value) + ' ' + (contract.currency || 'EUR')
            : null
        };
      });
      
      // Get stats
      ContractModel.getStats((statsErr, stats) => {
        res.render('contracts/index', {
          title: 'Sözleşmeler',
          contracts: formattedContracts,
          stats: stats || { total: 0, active: 0, expired: 0, passive: 0, expiring_soon: 0 },
          contractTypes: ContractModel.CONTRACT_TYPES,
          contractStatuses: ContractModel.CONTRACT_STATUSES,
          currentUser: req.session.user,
          success: req.query.success,
          error: req.query.error,
          filters: filters || {}
        });
      });
    });
  });
};

/**
 * Show new contract form
 * GET /contracts/new
 */
exports.showNewContractForm = (req, res) => {
  res.render('contracts/new', {
    title: 'Yeni Sözleşme Ekle',
    currentUser: req.session.user,
    contractTypes: ContractModel.CONTRACT_TYPES,
    currencies: ContractModel.CURRENCIES,
    error: null,
    formData: {}
  });
};

/**
 * Create a new contract
 * POST /contracts
 */
exports.createContract = (req, res, next) => {
  // Use multer middleware
  uploadMiddleware(req, res, function(uploadErr) {
    if (uploadErr) {
      console.error('[Contracts] Upload error:', uploadErr);
      return res.render('contracts/new', {
        title: 'Yeni Sözleşme Ekle',
        currentUser: req.session.user,
        contractTypes: ContractModel.CONTRACT_TYPES,
        currencies: ContractModel.CURRENCIES,
        error: uploadErr.message || 'Dosya yükleme hatası',
        formData: req.body || {}
      });
    }
    
    const { 
      title, description, start_date, expiry_date, contract_type,
      contract_value, currency, party_name, party_contact, party_email 
    } = req.body;
    
    // Validation
    if (!title || title.trim() === '') {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.render('contracts/new', {
        title: 'Yeni Sözleşme Ekle',
        currentUser: req.session.user,
        contractTypes: ContractModel.CONTRACT_TYPES,
        currencies: ContractModel.CURRENCIES,
        error: 'Sözleşme adı zorunludur.',
        formData: req.body || {}
      });
    }

    if (!expiry_date) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.render('contracts/new', {
        title: 'Yeni Sözleşme Ekle',
        currentUser: req.session.user,
        contractTypes: ContractModel.CONTRACT_TYPES,
        currencies: ContractModel.CURRENCIES,
        error: 'Bitiş tarihi zorunludur.',
        formData: req.body || {}
      });
    }
    
    if (!req.file) {
      return res.render('contracts/new', {
        title: 'Yeni Sözleşme Ekle',
        currentUser: req.session.user,
        contractTypes: ContractModel.CONTRACT_TYPES,
        currencies: ContractModel.CURRENCIES,
        error: 'Sözleşme PDF dosyası zorunludur.',
        formData: req.body || {}
      });
    }
    
    // Prepare contract data
    const contractData = {
      title: title.trim(),
      description: description ? description.trim() : null,
      fileName: req.file.originalname,
      filePath: `/uploads/contracts/${req.file.filename}`,
      createdBy: req.session.user ? req.session.user.id : null,
      startDate: start_date || null,
      expiryDate: expiry_date,
      contractType: contract_type || 'other',
      status: 'active',
      contractValue: contract_value ? parseFloat(contract_value) : null,
      currency: currency || 'EUR',
      partyName: party_name ? party_name.trim() : null,
      partyContact: party_contact ? party_contact.trim() : null,
      partyEmail: party_email ? party_email.trim() : null
    };
    
    // Save to database
    ContractModel.create(contractData, (err, result) => {
      if (err) {
        console.error('[Contracts] Create error:', err);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.render('contracts/new', {
          title: 'Yeni Sözleşme Ekle',
          currentUser: req.session.user,
          contractTypes: ContractModel.CONTRACT_TYPES,
          currencies: ContractModel.CURRENCIES,
          error: 'Sözleşme kaydedilirken hata oluştu: ' + err.message,
          formData: req.body || {}
        });
      }
      
      // Log the creation
      try {
        LogModel.create({
          entity: 'contract',
          entity_id: result.id,
          entity_id_text: contractData.title,
          action: 'create',
          username: req.session.user ? req.session.user.username : 'system',
          details: JSON.stringify({
            title: contractData.title,
            fileName: contractData.fileName,
            expiryDate: contractData.expiryDate,
            contractType: contractData.contractType,
            partyName: contractData.partyName
          })
        }, () => {});
      } catch (logErr) {
        console.error('[Contracts] Log error:', logErr);
      }
      
      console.log(`[Contracts] Contract created: ${contractData.title} by ${req.session.user ? req.session.user.username : 'unknown'}`);
      
      res.redirect('/contracts?success=Sözleşme başarıyla eklendi');
    });
  });
};

/**
 * Show edit contract form
 * GET /contracts/:id/edit
 */
exports.showEditContractForm = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  
  if (isNaN(contractId)) {
    return res.redirect('/contracts?error=Geçersiz sözleşme ID');
  }
  
  ContractModel.getById(contractId, (err, contract) => {
    if (err || !contract) {
      return res.redirect('/contracts?error=Sözleşme bulunamadı');
    }
    
    res.render('contracts/edit', {
      title: 'Sözleşme Düzenle',
      currentUser: req.session.user,
      contract: contract,
      contractTypes: ContractModel.CONTRACT_TYPES,
      contractStatuses: ContractModel.CONTRACT_STATUSES,
      currencies: ContractModel.CURRENCIES,
      error: null
    });
  });
};

/**
 * Update a contract
 * POST /contracts/:id/edit
 */
exports.updateContract = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  
  if (isNaN(contractId)) {
    return res.redirect('/contracts?error=Geçersiz sözleşme ID');
  }
  
  const { 
    title, description, start_date, expiry_date, contract_type, status,
    contract_value, currency, party_name, party_contact, party_email 
  } = req.body;
  
  // Validation
  if (!title || title.trim() === '') {
    return res.redirect(`/contracts/${contractId}/edit?error=Sözleşme adı zorunludur`);
  }
  
  if (!expiry_date) {
    return res.redirect(`/contracts/${contractId}/edit?error=Bitiş tarihi zorunludur`);
  }
  
  const updateData = {
    title: title.trim(),
    description: description ? description.trim() : null,
    startDate: start_date || null,
    expiryDate: expiry_date,
    contractType: contract_type || 'other',
    status: status || 'active',
    contractValue: contract_value ? parseFloat(contract_value) : null,
    currency: currency || 'EUR',
    partyName: party_name ? party_name.trim() : null,
    partyContact: party_contact ? party_contact.trim() : null,
    partyEmail: party_email ? party_email.trim() : null
  };
  
  ContractModel.update(contractId, updateData, (err) => {
    if (err) {
      console.error('[Contracts] Update error:', err);
      return res.redirect(`/contracts/${contractId}/edit?error=Güncelleme hatası`);
    }
    
    // Log the update
    try {
      LogModel.create({
        entity: 'contract',
        entity_id: contractId,
        entity_id_text: updateData.title,
        action: 'update',
        username: req.session.user ? req.session.user.username : 'system',
        details: JSON.stringify(updateData)
      }, () => {});
    } catch (logErr) {
      console.error('[Contracts] Log error:', logErr);
    }
    
    res.redirect('/contracts?success=Sözleşme güncellendi');
  });
};

/**
 * Delete a contract
 * POST /contracts/:id/delete
 */
exports.deleteContract = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  
  if (isNaN(contractId)) {
    return res.redirect('/contracts?error=Geçersiz sözleşme ID');
  }
  
  // First get the contract to find the file path
  ContractModel.getById(contractId, (err, contract) => {
    if (err) {
      console.error('[Contracts] Error finding contract:', err);
      return res.redirect('/contracts?error=Sözleşme bulunamadı');
    }
    
    if (!contract) {
      return res.redirect('/contracts?error=Sözleşme bulunamadı');
    }
    
    // Delete from database
    ContractModel.deleteById(contractId, (deleteErr) => {
      if (deleteErr) {
        console.error('[Contracts] Delete error:', deleteErr);
        return res.redirect('/contracts?error=Sözleşme silinirken hata oluştu');
      }
      
      // Delete the file
      if (contract.file_path) {
        const fullPath = path.join(__dirname, '../../', contract.file_path);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch (e) {
          console.error('[Contracts] File delete error:', e);
        }
      }
      
      // Log the deletion
      try {
        LogModel.create({
          entity: 'contract',
          entity_id: contractId,
          entity_id_text: contract.title,
          action: 'delete',
          username: req.session.user ? req.session.user.username : 'system',
          details: JSON.stringify({ title: contract.title })
        }, () => {});
      } catch (logErr) {
        console.error('[Contracts] Log error:', logErr);
      }
      
      res.redirect('/contracts?success=Sözleşme silindi');
    });
  });
};

/**
 * Add file to existing contract
 * POST /contracts/:id/files
 */
exports.addContractFile = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  
  if (isNaN(contractId)) {
    return res.status(400).json({ success: false, error: 'Geçersiz sözleşme ID' });
  }
  
  uploadMiddleware(req, res, function(uploadErr) {
    if (uploadErr) {
      console.error('[Contracts] File upload error:', uploadErr);
      return res.status(400).json({ success: false, error: uploadErr.message || 'Dosya yükleme hatası' });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'PDF dosyası seçilmedi' });
    }
    
    const { description } = req.body;
    
    const fileData = {
      contractId: contractId,
      fileName: req.file.originalname,
      filePath: `/uploads/contracts/${req.file.filename}`,
      fileSize: req.file.size,
      description: description || null,
      uploadedBy: req.session.user ? req.session.user.id : null
    };
    
    ContractModel.addFile(fileData, (err, result) => {
      if (err) {
        console.error('[Contracts] Add file error:', err);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(500).json({ success: false, error: 'Dosya kaydedilemedi' });
      }
      
      console.log(`[Contracts] File added to contract ${contractId}: ${fileData.fileName}`);
      
      // Return JSON for AJAX
      res.json({ 
        success: true, 
        message: 'Dosya başarıyla eklendi',
        file: {
          id: result.id,
          file_name: fileData.fileName,
          file_path: fileData.filePath,
          description: fileData.description,
          version: result.version,
          uploaded_at: result.uploadedAt
        }
      });
    });
  });
};

/**
 * Delete file from contract
 * POST /contracts/:id/files/:fileId/delete
 */
exports.deleteContractFile = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  const fileId = parseInt(req.params.fileId, 10);
  
  if (isNaN(contractId) || isNaN(fileId)) {
    return res.status(400).json({ success: false, error: 'Geçersiz ID' });
  }
  
  ContractModel.deleteFile(fileId, (err, filePath) => {
    if (err) {
      console.error('[Contracts] Delete file error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Dosya silinemedi' });
    }
    
    // Delete physical file
    if (filePath) {
      const fullPath = path.join(__dirname, '../../', filePath);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (e) {
        console.error('[Contracts] File delete error:', e);
      }
    }
    
    console.log(`[Contracts] File ${fileId} deleted from contract ${contractId}`);
    
    res.json({ success: true, message: 'Dosya silindi' });
  });
};

/**
 * Get files for a contract (AJAX)
 * GET /contracts/:id/files
 */
exports.getContractFiles = (req, res, next) => {
  const contractId = parseInt(req.params.id, 10);
  
  if (isNaN(contractId)) {
    return res.status(400).json({ success: false, error: 'Geçersiz sözleşme ID' });
  }
  
  ContractModel.getFilesByContractId(contractId, (err, files) => {
    if (err) {
      console.error('[Contracts] Get files error:', err);
      return res.status(500).json({ success: false, error: 'Dosyalar alınamadı' });
    }
    
    // Format dates
    const formattedFiles = (files || []).map(f => ({
      ...f,
      uploaded_at_formatted: formatDate(f.uploaded_at, true)
    }));
    
    res.json({ success: true, files: formattedFiles });
  });
};

/**
 * Search/filter contracts
 * GET /contracts with query params
 */
exports.searchContracts = (req, res, next) => {
  const filters = {
    search: req.query.search,
    contract_type: req.query.contract_type,
    status: req.query.status,
    start_date_from: req.query.start_date_from,
    start_date_to: req.query.start_date_to,
    expiry_date_from: req.query.expiry_date_from,
    expiry_date_to: req.query.expiry_date_to
  };
  
  // Check if any filters are active
  const hasFilters = Object.values(filters).some(v => v && v !== 'all');
  
  if (!hasFilters) {
    // No filters, use regular listContracts
    return exports.listContracts(req, res, next);
  }
  
  // Update expired contracts first
  ContractModel.getExpired(() => {
    ContractModel.search(filters, (err, contracts) => {
      if (err) {
        console.error('[Contracts] Search error:', err);
        return next(err);
      }
      
      // Format contracts for display
      const formattedContracts = (contracts || []).map(contract => {
        const daysLeft = daysUntilExpiry(contract.expiry_date);
        let expiryStatus = 'normal';
        if (daysLeft !== null) {
          if (daysLeft < 0) expiryStatus = 'expired';
          else if (daysLeft <= 7) expiryStatus = 'critical';
          else if (daysLeft <= 30) expiryStatus = 'warning';
        }
        
        return {
          ...contract,
          created_at_formatted: formatDate(contract.created_at, true),
          start_date_formatted: formatDate(contract.start_date),
          expiry_date_formatted: formatDate(contract.expiry_date),
          contract_type_label: ContractModel.CONTRACT_TYPES[contract.contract_type] || contract.contract_type,
          status_label: ContractModel.CONTRACT_STATUSES[contract.status] || contract.status,
          days_until_expiry: daysLeft,
          expiry_status: expiryStatus,
          contract_value_formatted: contract.contract_value 
            ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(contract.contract_value) + ' ' + (contract.currency || 'EUR')
            : null
        };
      });
      
      // Get stats
      ContractModel.getStats((statsErr, stats) => {
        res.render('contracts/index', {
          title: 'Sözleşmeler',
          contracts: formattedContracts,
          stats: stats || { total: 0, active: 0, expired: 0, passive: 0, expiring_soon: 0 },
          contractTypes: ContractModel.CONTRACT_TYPES,
          contractStatuses: ContractModel.CONTRACT_STATUSES,
          currentUser: req.session.user,
          success: req.query.success,
          error: req.query.error,
          filters: filters // Pass filters back for form persistence
        });
      });
    });
  });
};
