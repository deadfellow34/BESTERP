/**
 * Contract Routes
 * Handles contract management routes
 */

const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { ensureAuth } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(ensureAuth);

// GET /contracts - List all contracts (with optional filters)
router.get('/', contractController.listContracts);

// GET /contracts/new - Show new contract form
router.get('/new', contractController.showNewContractForm);

// POST /contracts - Create new contract
router.post('/', contractController.createContract);

// GET /contracts/:id/edit - Show edit contract form
router.get('/:id/edit', contractController.showEditContractForm);

// POST /contracts/:id/edit - Update contract
router.post('/:id/edit', contractController.updateContract);

// POST /contracts/:id/delete - Delete contract
router.post('/:id/delete', contractController.deleteContract);

// ==================== FILE MANAGEMENT ====================

// GET /contracts/:id/files - Get contract files (AJAX)
router.get('/:id/files', contractController.getContractFiles);

// POST /contracts/:id/files - Add file to contract
router.post('/:id/files', contractController.addContractFile);

// POST /contracts/:id/files/:fileId/delete - Delete file from contract
router.post('/:id/files/:fileId/delete', contractController.deleteContractFile);

module.exports = router;
