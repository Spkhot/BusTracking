// Route Variants & Stops API — v5
// CRITICAL: /search/stops and /geocode-status MUST be before /:id
const router = require('express').Router();
const RouteVariant    = require('../models/RouteVariant');
const Stop            = require('../models/Stop');
const StopMaster      = require('../models/StopMaster');
const Route           = require('../models/Route');
const LiveLocation     = require('../models/LiveLocation');
const auth            = require('../middleware/auth');
const mongoose        = require('mongoose');
const { resolveStopCoords, retryGeocode } = require('../services/geocoder');
const { invalidateStopCache } = require('../services/stopDetector');

// ════════════════════════════════════════════════════════════════
// STOP-BASED PASSENGER SEARCH  ← MUST BE FIRST (before /:id)
// GET /api/variants/search/stops?from=Nippani&to=Kurli
// ════════════════════════════════════════════════════════════════
router.get('/search/stops', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from?.trim() || !to?.trim())
      return res.status(400).json({ message: 'from and to query params required' });

    const esc = s => s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [fromStops, toStops] = await Promise.all([
      Stop.find({ name: new RegExp('^' + esc(from) + '$', 'i') }),
      Stop.find({ name: new RegExp('^' + esc(to)   + '$', 'i') })
    ]);

    const fromMap = {}, toMap = {};
    fromStops.forEach(s => { fromMap[s.variantId.toString()] = s.order; });
    toStops.forEach(s =>   { toMap[s.variantId.toString()]   = s.order; });

    // from.order must be < to.order (forward direction only)
    const validVariantIds = Object.keys(fromMap).filter(
      vid => toMap[vid] !== undefined && fromMap[vid] < toMap[vid]
    );

    if (!validVariantIds.length)
      return res.json({ buses: [], variants: [], message: 'No matching routes' });

    const oids = validVariantIds.map(id => new mongoose.Types.ObjectId(id));
    const liveBuses = await LiveLocation.find({ variantId: { $in: oids } })
      .populate('routeId', 'source destination')
      .populate('conductorId', 'name')
      .populate('variantId', 'name');

    const variants = await RouteVariant.find({ _id: { $in: oids } })
      .populate('routeId', 'source destination');
    const variantDetails = await Promise.all(variants.map(async v => {
      const stops = await Stop.find({ variantId: v._id }).sort({ order: 1 });
      return { ...v.toObject(), stops };
    }));

    res.json({ buses: liveBuses, variants: variantDetails });
  } catch (err) {
    console.error('search/stops:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET geocode status for all stops in a variant (admin use)
// MUST be before /:id
router.get('/geocode-status/:variantId', auth('admin'), async (req, res) => {
  try {
    const stops = await Stop.find({ variantId: req.params.variantId })
      .sort({ order: 1 })
      .populate('stopMasterId', 'geocodeStatus geocodeAttempts');
    res.json(stops.map(s => ({
      _id: s._id,
      name: s.name,
      order: s.order,
      latitude: s.latitude,
      longitude: s.longitude,
      geocodeStatus: s.stopMasterId?.geocodeStatus || (s.latitude ? 'found' : 'pending')
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// STOP MASTER — public read (for admin UI)
// ════════════════════════════════════════════════════════════════
router.get('/stop-master', auth('admin'), async (req, res) => {
  try {
    const masters = await StopMaster.find().sort({ name: 1 });
    res.json(masters);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// VARIANTS CRUD
// ════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const filter = req.query.routeId ? { routeId: req.query.routeId } : {};
    const variants = await RouteVariant.find(filter)
      .populate('routeId', 'source destination')
      .sort({ createdAt: 1 });
    res.json(variants);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const variant = await RouteVariant.findById(req.params.id)
      .populate('routeId', 'source destination');
    if (!variant) return res.status(404).json({ message: 'Variant not found' });
    const stops = await Stop.find({ variantId: req.params.id }).sort({ order: 1 });
    res.json({ ...variant.toObject(), stops });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
      return res.status(409).json({ message: 'Variant name already exists for this route' });
    res.status(400).json({ message: err.message });
  }
});

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

router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const live = await LiveLocation.findOne({ variantId: req.params.id });
    if (live)
      return res.status(409).json({ message: `Bus ${live.busNumber} is running this variant. Stop the trip first.` });
    await Stop.deleteMany({ variantId: req.params.id });
    await RouteVariant.findByIdAndDelete(req.params.id);
    res.json({ message: 'Variant and stops deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// STOPS CRUD — with automatic geocoding
// ════════════════════════════════════════════════════════════════

// GET stops for a variant
router.get('/:id/stops', async (req, res) => {
  try {
    const stops = await Stop.find({ variantId: req.params.id }).sort({ order: 1 });
    res.json(stops);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST add stop — geocoding happens automatically in background
router.post('/:id/stops', auth('admin'), async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Stop name required' });

    const variant = await RouteVariant.findById(req.params.id).populate('routeId', 'source destination');
    if (!variant) return res.status(404).json({ message: 'Variant not found' });

    // Determine order
    let stopOrder = order;
    if (!stopOrder) {
      const last = await Stop.findOne({ variantId: req.params.id }).sort({ order: -1 });
      stopOrder = last ? last.order + 1 : 1;
    } else {
      await Stop.updateMany(
        { variantId: req.params.id, order: { $gte: stopOrder } },
        { $inc: { order: 1 } }
      );
    }

    // Create stop immediately (with null coords) so admin sees it right away
    const stop = await Stop.create({
      variantId: req.params.id,
      name: name.trim(),
      order: stopOrder,
      latitude: null,
      longitude: null
    });

    // Geocode asynchronously — don't block the response
    setImmediate(async () => {
      try {
        // Use route source city as state hint for better accuracy
        const hint = variant.routeId?.source || 'Karnataka';
        const { master, latitude, longitude } = await resolveStopCoords(name.trim(), hint);
        if (latitude !== null) {
          await Stop.findByIdAndUpdate(stop._id, {
            latitude, longitude, stopMasterId: master._id
          });
        } else {
          await Stop.findByIdAndUpdate(stop._id, { stopMasterId: master._id });
        }
      } catch (e) {
        console.error('Async geocode failed for stop:', name, e.message);
      }
    });

    // Invalidate the in-memory stop cache so next GPS ping reloads fresh stops
    invalidateStopCache(req.params.id);

    res.status(201).json(stop);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PUT edit stop name (triggers re-geocode if name changed) or order
router.put('/:variantId/stops/:stopId', auth('admin'), async (req, res) => {
  try {
    const { name, order } = req.body;
    const stop = await Stop.findOne({ _id: req.params.stopId, variantId: req.params.variantId });
    if (!stop) return res.status(404).json({ message: 'Stop not found' });

    const nameChanged = name?.trim() && name.trim().toLowerCase() !== stop.name.toLowerCase();

    if (name?.trim()) stop.name = name.trim();

    if (order && order !== stop.order) {
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

    if (nameChanged) {
      // Clear old coords — will be re-geocoded
      stop.latitude  = null;
      stop.longitude = null;
      stop.stopMasterId = null;
    }

    await stop.save();
    invalidateStopCache(req.params.variantId);

    // Re-geocode if name changed
    if (nameChanged) {
      setImmediate(async () => {
        try {
          const { master, latitude, longitude } = await resolveStopCoords(stop.name);
          if (latitude !== null) {
            await Stop.findByIdAndUpdate(stop._id, { latitude, longitude, stopMasterId: master._id });
          }
        } catch (e) {
          console.error('Re-geocode failed:', e.message);
        }
      });
    }

    res.json(stop);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// DELETE stop
router.delete('/:variantId/stops/:stopId', auth('admin'), async (req, res) => {
  try {
    const stop = await Stop.findOneAndDelete({ _id: req.params.stopId, variantId: req.params.variantId });
    if (!stop) return res.status(404).json({ message: 'Stop not found' });
    await Stop.updateMany(
      { variantId: req.params.variantId, order: { $gt: stop.order } },
      { $inc: { order: -1 } }
    );
    invalidateStopCache(req.params.variantId);
    res.json({ message: 'Stop deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT bulk reorder
router.put('/:id/stops/reorder/bulk', auth('admin'), async (req, res) => {
  try {
    const { stops } = req.body;
    if (!Array.isArray(stops)) return res.status(400).json({ message: 'stops array required' });
    const ops = stops.map(s => ({
      updateOne: { filter: { _id: s._id, variantId: req.params.id }, update: { $set: { order: s.order } } }
    }));
    await Stop.bulkWrite(ops);
    invalidateStopCache(req.params.id);
    res.json(await Stop.find({ variantId: req.params.id }).sort({ order: 1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST retry geocoding for a specific stop (admin manual trigger)
router.post('/:variantId/stops/:stopId/geocode', auth('admin'), async (req, res) => {
  try {
    const stop = await Stop.findOne({ _id: req.params.stopId, variantId: req.params.variantId });
    if (!stop) return res.status(404).json({ message: 'Stop not found' });

    const { master, latitude, longitude } = await retryGeocode(stop.name);
    if (latitude !== null) {
      await Stop.findByIdAndUpdate(stop._id, { latitude, longitude, stopMasterId: master._id });
      res.json({ success: true, latitude, longitude, message: `Geocoded: ${stop.name}` });
    } else {
      res.json({ success: false, message: `Could not geocode "${stop.name}". Try a different name.` });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
