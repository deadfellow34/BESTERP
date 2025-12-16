const express = require('express');
const { ensureAuth } = require('../middleware/authMiddleware');
const gpsController = require('../controllers/gpsController');

const router = express.Router();
router.use(ensureAuth);

router.get('/', gpsController.index);
router.get('/live', gpsController.livePage);
router.get('/vehicle/:vehicleId', gpsController.vehiclePage);
router.get('/tachograph', gpsController.tachographPage);

const apiRouter = express.Router();
apiRouter.use(ensureAuth);

apiRouter.get('/live', gpsController.apiLive);
apiRouter.post('/refresh', gpsController.apiRefresh);
apiRouter.get('/vehicle/:vehicleId/report', gpsController.apiDriveStopReport);

module.exports = { router, apiRouter };
