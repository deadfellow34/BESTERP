// Stub for removed quote routes — return 410 Gone
const express = require('express');
const router = express.Router();

router.use((req, res) => res.status(410).send('Rate calculator feature removed'));

module.exports = router;
const express = require('express');
const router = express.Router();
const QuoteController = require('../controllers/quoteController');

router.get('/', QuoteController.form);
router.post('/calc', QuoteController.calculate);

module.exports = router;
