const router = require('express').Router();
const Route = require('../models/Route');
const auth = require('../middleware/auth');

router.get('/', async (req, res) => {
  try { res.json(await Route.find().sort({ source: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth('admin'), async (req, res) => {
  try {
    const route = await Route.create({ source: req.body.source, destination: req.body.destination });
    res.status(201).json(route);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth('admin'), async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source?.trim() || !destination?.trim())
      return res.status(400).json({ message: 'source and destination required' });
    const route = await Route.findByIdAndUpdate(
      req.params.id,
      { source: source.trim(), destination: destination.trim() },
      { new: true }
    );
    if (!route) return res.status(404).json({ message: 'Route not found' });
    res.json(route);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    // Cascade delete variants and stops
    const RouteVariant = require('../models/RouteVariant');
    const Stop = require('../models/Stop');
    const variants = await RouteVariant.find({ routeId: req.params.id });
    for (const v of variants) {
      await Stop.deleteMany({ variantId: v._id });
    }
    await RouteVariant.deleteMany({ routeId: req.params.id });
    await Route.findByIdAndDelete(req.params.id);
    res.json({ message: 'Route and all variants/stops deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
