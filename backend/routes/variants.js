// Route Variants & Stops API
// All write operations: admin only. Read operations: public.
const router = require('express').Router();
const RouteVariant = require('../models/RouteVariant');
const Stop = require('../models/Stop');
const Route = require('../models/Route');
const LiveLocation = require('../models/LiveLocation');
const auth = require('../middleware/auth');

// ── VARIANTS ──────────────────────────────────────────────────────────────

// GET all variants (optionally filter by routeId)
router.get('/', async (req, res) => {
  try {
    const filter = req.query.routeId ? { routeId: req.query.routeId } : {};
    const variants = await RouteVariant.find(filter)
      .populate('routeId', 'source destination')
      .sort({ createdAt: 1 });
    res.json(variants);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET single variant with its stops
router.get('/:id', async (req, res) => {
  try {
    const variant = await RouteVariant.findById(req.params.id)
      .populate('routeId', 'source destination');
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    const stops = await Stop.find({ variantId: req.params.id }).sort({ order: 1 });
    res.json({ ...variant.toObject(), stops });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST create variant
router.post('/', auth('admin'), async (req, res) => {
  try {
    const { routeId, name } = req.body;
    if (!routeId || !name?.trim())
      return res.status(400).json({ message: 'routeId and name are required' });
    const route = await Route.findById(routeId);
    if (!route) return res.status(404).json({ message: 'Route not found' });
    const variant = await RouteVariant.create({ routeId, name: name.trim() });
    res.status(201).json(await variant.populate('routeId', 'source destination'));
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'A variant with this name already exists for this route' });
    res.status(400).json({ message: err.message });
  }
});

// PUT update variant name
router.put('/:id', auth('admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'name is required' });
    const variant = await RouteVariant.findByIdAndUpdate(
      req.params.id, { name: name.trim() }, { new: true }
    ).populate('routeId', 'source destination');
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    res.json(variant);
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'Variant name already used for this route' });
    res.status(400).json({ message: err.message });
  }
});

// DELETE variant (cascades to stops)
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    // Block delete if a live bus is using this variant
    const live = await LiveLocation.findOne({ variantId: req.params.id });
    if (live) return res.status(409).json({ message: `Bus ${live.busNumber} is actively running this variant. Stop the trip first.` });
    await Stop.deleteMany({ variantId: req.params.id });
    await RouteVariant.findByIdAndDelete(req.params.id);
    res.json({ message: 'Variant and its stops deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── STOPS ─────────────────────────────────────────────────────────────────

// GET stops for a variant (ordered)
router.get('/:id/stops', async (req, res) => {
  try {
    const stops = await Stop.find({ variantId: req.params.id }).sort({ order: 1 });
    res.json(stops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST add stop to variant
router.post('/:id/stops', auth('admin'), async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Stop name required' });

    const variant = await RouteVariant.findById(req.params.id);
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    // If order not given, append at end
    let stopOrder = order;
    if (!stopOrder) {
      const last = await Stop.findOne({ variantId: req.params.id }).sort({ order: -1 });
      stopOrder = last ? last.order + 1 : 1;
    } else {
      // Shift existing stops >= order up by 1
      await Stop.updateMany(
        { variantId: req.params.id, order: { $gte: stopOrder } },
        { $inc: { order: 1 } }
      );
    }
    const stop = await Stop.create({ variantId: req.params.id, name: name.trim(), order: stopOrder });
    res.status(201).json(stop);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PUT edit stop name or order
router.put('/:variantId/stops/:stopId', auth('admin'), async (req, res) => {
  try {
    const { name, order } = req.body;
    const stop = await Stop.findOne({ _id: req.params.stopId, variantId: req.params.variantId });
    if (!stop) return res.status(404).json({ message: 'Stop not found' });

    if (name?.trim()) stop.name = name.trim();
    if (order && order !== stop.order) {
      // Reorder: shift others to make room
      if (order > stop.order) {
        await Stop.updateMany(
          { variantId: req.params.variantId, order: { $gt: stop.order, $lte: order } },
          { $inc: { order: -1 } }
        );
      } else {
        await Stop.updateMany(
          { variantId: req.params.variantId, order: { $gte: order, $lt: stop.order } },
          { $inc: { order: 1 } }
        );
      }
      stop.order = order;
    }
    await stop.save();
    res.json(stop);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// DELETE stop
router.delete('/:variantId/stops/:stopId', auth('admin'), async (req, res) => {
  try {
    const stop = await Stop.findOneAndDelete({ _id: req.params.stopId, variantId: req.params.variantId });
    if (!stop) return res.status(404).json({ message: 'Stop not found' });
    // Compact order numbers after deletion
    await Stop.updateMany(
      { variantId: req.params.variantId, order: { $gt: stop.order } },
      { $inc: { order: -1 } }
    );
    res.json({ message: 'Stop deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── REORDER (bulk) ────────────────────────────────────────────────────────
// Accepts: { stops: [ { _id, order }, ... ] }
router.put('/:id/stops/reorder/bulk', auth('admin'), async (req, res) => {
  try {
    const { stops } = req.body;
    if (!Array.isArray(stops)) return res.status(400).json({ message: 'stops array required' });
    const ops = stops.map(s => ({
      updateOne: { filter: { _id: s._id, variantId: req.params.id }, update: { order: s.order } }
    }));
    await Stop.bulkWrite(ops);
    const updated = await Stop.find({ variantId: req.params.id }).sort({ order: 1 });
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── STOP-BASED SEARCH ─────────────────────────────────────────────────────
// GET /api/variants/search?from=Nippani&to=Kurli
// Returns active buses whose variant contains both stops in correct order
router.get('/search/stops', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: 'from and to query params required' });

    // 1. Find all variants that have BOTH stops
    const fromStops = await Stop.find({ name: new RegExp(from, 'i') });
    const toStops   = await Stop.find({ name: new RegExp(to,   'i') });

    const fromMap = {}; // variantId → fromStop.order
    fromStops.forEach(s => { fromMap[s.variantId.toString()] = s.order; });
    const toMap   = {}; // variantId → toStop.order
    toStops.forEach(s => { toMap[s.variantId.toString()] = s.order; });

    // 2. Find variants where from.order < to.order (direction valid)
    const validVariantIds = Object.keys(fromMap).filter(vid =>
      toMap[vid] !== undefined && fromMap[vid] < toMap[vid]
    );

    if (!validVariantIds.length) return res.json({ buses: [], variants: [] });

    // 3. Find live buses running on any of these variants
    const mongoose = require('mongoose');
    const liveBuses = await LiveLocation.find({
      variantId: { $in: validVariantIds.map(id => new mongoose.Types.ObjectId(id)) }
    })
      .populate('routeId', 'source destination')
      .populate('conductorId', 'name');

    // 4. Fetch the variant details for context
    const variants = await RouteVariant.find({ _id: { $in: validVariantIds } })
      .populate('routeId', 'source destination');

    const variantDetails = await Promise.all(variants.map(async v => {
      const stops = await Stop.find({ variantId: v._id }).sort({ order: 1 });
      return { ...v.toObject(), stops };
    }));

    res.json({ buses: liveBuses, variants: variantDetails });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
