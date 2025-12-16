/**
 * Driver API Routes
 * 
 * REST API endpoints for the Android driver app.
 * These routes handle:
 * - Driver authentication (login with ID + PIN)
 * - GPS location submission
 * 
 * The Android app (android-driver-app) uses these endpoints:
 * - POST /api/driver/login - Authenticate driver
 * - POST /api/driver/location - Submit GPS location
 * 
 * All routes are prefixed with /api/driver in server.js
 */

const express = require('express');
const router = express.Router();
const driverApiController = require('../controllers/driverApiController');

/**
 * POST /api/driver/login
 * 
 * Authenticates a driver using their ID/name and PIN.
 * Returns an auth token on success.
 * 
 * Request body:
 * {
 *   "driverId": "123" or "Driver Name",
 *   "pin": "1234"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "authToken": "abc123...",
 *   "driverName": "Driver Name",
 *   "message": "Giriş başarılı"
 * }
 */
router.post('/login', driverApiController.login);

/**
 * POST /api/driver/location
 * 
 * Receives GPS location from the Android app.
 * Requires valid authToken in the request body.
 * 
 * Request body:
 * {
 *   "driverId": "123",
 *   "lat": 41.0123,
 *   "lng": 29.1234,
 *   "speed": 78.5,
 *   "timestamp": "2025-12-06T10:15:00Z",
 *   "authToken": "abc123..."
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Konum kaydedildi"
 * }
 */
router.post('/location', driverApiController.receiveLocation);

/**
 * GET /api/driver/status
 * 
 * Get driver's current tracking status (for app sync).
 * Requires authToken query parameter.
 */
router.get('/status', driverApiController.getStatus);

/**
 * POST /api/driver/logout
 * 
 * Logs out the driver and sets is_tracking = 0.
 * 
 * Request body:
 * {
 *   "driverId": "123",
 *   "authToken": "abc123..."
 * }
 */
router.post('/logout', driverApiController.logout);

// ============================================
// MESSAGING ENDPOINTS (for Android App)
// ============================================

/**
 * GET /api/driver/messages
 * 
 * Get messages for a driver.
 * 
 * Query params:
 * - driverId: Driver ID (required)
 * - authToken: Auth token (required)
 * - since: Optional timestamp to get only new messages
 */
router.get('/messages', driverApiController.getMessages);

/**
 * POST /api/driver/messages
 * 
 * Send a message from driver to operator.
 * 
 * Request body:
 * {
 *   "driverId": "123",
 *   "authToken": "abc123...",
 *   "message": "Mesaj içeriği",
 *   "image": "base64 encoded image data (optional)"
 * }
 */
router.post('/messages', driverApiController.sendMessage);

/**
 * POST /api/driver/messages/read
 * 
 * Mark messages as read by driver.
 * 
 * Request body:
 * {
 *   "driverId": "123",
 *   "authToken": "abc123..."
 * }
 */
router.post('/messages/read', driverApiController.markMessagesRead);

/**
 * GET /api/driver/messages/unread
 * 
 * Get unread message count for a driver.
 * 
 * Query params:
 * - driverId: Driver ID (required)
 * - authToken: Auth token (required)
 */
router.get('/messages/unread', driverApiController.getUnreadCount);

// ============================================
// POSITION ENDPOINTS (for Android App)
// ============================================

/**
 * GET /api/driver/active-position
 * 
 * Get the active position/load assigned to driver's truck.
 * 
 * Query params:
 * - driverId: Driver ID (required)
 * - authToken: Auth token (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "hasPosition": true,
 *   "truckPlate": "34ABC123",
 *   "position": {
 *     "id": 1,
 *     "positionNo": "25/200-546",
 *     "customerName": "Sender Company",
 *     "consigneeName": "Receiver Company",
 *     "loadingCountry": "Germany",
 *     "loadingCity": "Berlin",
 *     "unloadingCountry": "Turkey",
 *     "unloadingCity": "Istanbul",
 *     ...
 *   }
 * }
 */
router.get('/active-position', driverApiController.getActivePosition);

/**
 * GET /api/driver/position-loads
 * 
 * Get all loads for a specific position (detail view).
 * 
 * Query params:
 * - positionNo: Position number (required)
 * - authToken: Auth token (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "positionNo": "25/200-585",
 *   "loads": [
 *     {
 *       "id": 1,
 *       "customerName": "...",
 *       "consigneeName": "...",
 *       "loadingCity": "...",
 *       "unloadingCountry": "...",
 *       "unloadingCity": "...",
 *       "packages": 5,
 *       "grossWeight": 1000,
 *       "goodsDescription": "..."
 *     }
 *   ],
 *   "totalLoads": 7
 * }
 */
router.get('/position-loads', driverApiController.getPositionLoads);

/**
 * GET /api/driver/position-documents
 * 
 * Get documents (Evraklar and T1/GMR) for a specific position.
 * 
 * Query params:
 * - positionNo: Position number (required)
 * - authToken: Auth token (required)
 * 
 * Response:
 * {
 *   "success": true,
 *   "positionNo": "25/200-585",
 *   "documents": [
 *     {
 *       "id": 1,
 *       "filename": "25-200-585/T1-GMR/document.pdf",
 *       "originalName": "T1_Belgium.pdf",
 *       "category": "T1/GMR",
 *       "createdAt": "2025-12-06T10:00:00Z"
 *     }
 *   ],
 *   "totalDocuments": 5,
 *   "t1GmrCount": 2,
 *   "evraklarCount": 3
 * }
 */
router.get('/position-documents', driverApiController.getPositionDocuments);

module.exports = router;
