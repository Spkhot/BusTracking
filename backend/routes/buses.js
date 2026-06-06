const router = require('express').Router();
const Bus = require('../models/Bus');
const auth = require('../middleware/auth');

router.get('/', async (req, res) => {
  try { res.json(await Bus.find().sort({ busNumber: 1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth('admin'), async (req, res) => {
  try {
    const bus = await Bus.create({ busNumber: req.body.busNumber });
    res.status(201).json(bus);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    await Bus.findByIdAndDelete(req.params.id);
    res.json({ message: 'Bus deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
