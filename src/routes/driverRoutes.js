// Drivers routes removed — placeholder to avoid require errors
const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.redirect('/'));
router.get('/:id', (req, res) => res.redirect('/'));
module.exports = router;
