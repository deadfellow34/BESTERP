const express = require('express');
const router = express.Router();

// Help page - accessible without authentication for first-time users
router.get('/', (req, res) => {
  res.render('help', {});
});

module.exports = router;
