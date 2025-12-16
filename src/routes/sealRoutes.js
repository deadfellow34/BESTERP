const express = require('express');
const router = express.Router();
const sealController = require('../controllers/sealController');

// simple auth guard used elsewhere in routes
function ensureAuth(req, res, next) {
	if (req.session && req.session.user) {
		res.locals.currentUser = req.session.user;
		return next();
	}
	return res.redirect('/login');
}

router.get('/', ensureAuth, sealController.list);
router.get('/new', ensureAuth, sealController.showCreateForm);
router.post('/', ensureAuth, sealController.create);
router.post('/:id/use', ensureAuth, sealController.markUsed);

module.exports = router;
