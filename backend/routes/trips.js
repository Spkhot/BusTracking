// NEW: Trip history API
const router = require('express').Router();
const TripHistory = require('../models/TripHistory');
const TripLocation = require('../models/TripLocation');
const auth = require('../middleware/auth');

// GET all trip history (admin)
router.get('/', auth('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trips = await TripHistory.find()
      .populate('routeId', 'source destination')
      .populate('conductorId', 'name username')
      .sort({ startedAt: -1 })
      .limit(limit);
    res.json(trips);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET specific trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await TripHistory.findById(req.params.id)
      .populate('routeId')
      .populate('conductorId', 'name username');
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json(trip);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
