const express = require('express');
const router = express.Router();
const VehicleController = require('../controllers/vehicleController');

router.get('/', VehicleController.index);
router.get('/:id', VehicleController.show);
router.post('/:id/notes', VehicleController.addNote);
router.put('/:id/notes/:noteId', VehicleController.updateNote);
router.delete('/:id/notes/:noteId', VehicleController.deleteNote);

module.exports = router;
