// NEW: Full conductor CRUD — admin only
const router = require('express').Router();
const Conductor = require('../models/Conductor');
const auth = require('../middleware/auth');

// GET all conductors
router.get('/', auth('admin'), async (req, res) => {
  try {
    const conductors = await Conductor.find().sort({ createdAt: -1 });
    res.json(conductors);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET single conductor
router.get('/:id', auth('admin'), async (req, res) => {
  try {
    const c = await Conductor.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Conductor not found' });
    res.json(c);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST create conductor
router.post('/', auth('admin'), async (req, res) => {
  try {
    const { username, password, name, mobile, employeeId } = req.body;
    if (!username || !password || !name || !mobile || !employeeId)
      return res.status(400).json({ message: 'All fields required: username, password, name, mobile, employeeId' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const exists = await Conductor.findOne({ $or: [{ username: username.toLowerCase() }, { employeeId: employeeId.toUpperCase() }] });
    if (exists) return res.status(409).json({ message: 'Username or Employee ID already exists' });

    const conductor = await Conductor.create({ username, password, name, mobile, employeeId });
    res.status(201).json(conductor);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Duplicate username or employee ID' });
    res.status(400).json({ message: err.message });
  }
});

// PUT update conductor
router.put('/:id', auth('admin'), async (req, res) => {
  try {
    const { username, name, mobile, employeeId, isActive, password } = req.body;
    const conductor = await Conductor.findById(req.params.id);
    if (!conductor) return res.status(404).json({ message: 'Conductor not found' });

    if (username) conductor.username = username.toLowerCase();
    if (name) conductor.name = name;
    if (mobile) conductor.mobile = mobile;
    if (employeeId) conductor.employeeId = employeeId.toUpperCase();
    if (typeof isActive === 'boolean') conductor.isActive = isActive;
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      conductor.password = password; // pre-save hook hashes it
    }

    await conductor.save();
    res.json(conductor);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Duplicate username or employee ID' });
    res.status(400).json({ message: err.message });
  }
});

// DELETE conductor
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const LiveLocation = require('../models/LiveLocation');
    const active = await LiveLocation.findOne({ conductorId: req.params.id });
    if (active) return res.status(409).json({ message: 'Conductor has an active trip. Stop the trip first.' });
    await Conductor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Conductor deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
