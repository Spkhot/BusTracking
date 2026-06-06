const router = require('express').Router();
const Timetable = require('../models/Timetable');
const auth = require('../middleware/auth');

router.get('/', async (req, res) => {
  try { res.json(await Timetable.find().populate('routeId').sort({ departureTime: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/route/:routeId', async (req, res) => {
  try { res.json(await Timetable.find({ routeId: req.params.routeId }).sort({ departureTime: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth('admin'), async (req, res) => {
  try {
    const t = await Timetable.create({ routeId: req.body.routeId, departureTime: req.body.departureTime });
    res.status(201).json(await t.populate('routeId'));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth('admin'), async (req, res) => {
  try {
    const t = await Timetable.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('routeId');
    res.json(t);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ message: 'Timetable entry deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
