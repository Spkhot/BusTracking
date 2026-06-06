// UPGRADED: Full live location API with status, history, route polyline
const router = require('express').Router();
const LiveLocation = require('../models/LiveLocation');
const TripLocation = require('../models/TripLocation');
const auth = require('../middleware/auth');

// GET all active buses (updated within 90s)
router.get('/active', async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 90 * 1000);
    const buses = await LiveLocation.find({ updatedAt: { $gte: cutoff } })
      .populate('routeId')
      .populate('conductorId', 'name username employeeId')
      .populate('variantId', 'name');
    res.json(buses);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET all live locations regardless of status (admin use)
router.get('/all', auth('admin'), async (req, res) => {
  try {
    const buses = await LiveLocation.find()
      .populate('routeId')
      .populate('conductorId', 'name username employeeId')
      .populate('variantId', 'name')
      .sort({ updatedAt: -1 });
    res.json(buses);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET specific bus
router.get('/bus/:busNumber', async (req, res) => {
  try {
    const loc = await LiveLocation.findOne({ busNumber: req.params.busNumber.toUpperCase() })
      .populate('routeId')
      .populate('conductorId', 'name username')
      .populate('variantId', 'name');
    if (!loc) return res.status(404).json({ message: 'Bus not active' });
    res.json(loc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET buses on a route
router.get('/route/:routeId', async (req, res) => {
  try {
    const buses = await LiveLocation.find({ routeId: req.params.routeId })
      .populate('routeId')
      .populate('conductorId', 'name username')
      .populate('variantId', 'name');
    res.json(buses);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET GPS history for a trip (polyline points)
router.get('/history/:tripId', async (req, res) => {
  try {
    const points = await TripLocation.find({ tripId: req.params.tripId })
      .sort({ timestamp: 1 })
      .select('latitude longitude speed timestamp -_id');
    res.json(points);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET GPS history for current active bus
router.get('/bus/:busNumber/history', async (req, res) => {
  try {
    const live = await LiveLocation.findOne({ busNumber: req.params.busNumber.toUpperCase() });
    if (!live || !live.tripId) return res.json([]);
    const points = await TripLocation.find({ tripId: live.tripId })
      .sort({ timestamp: 1 })
      .select('latitude longitude speed timestamp -_id')
      .limit(500);
    res.json(points);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
