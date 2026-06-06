const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Conductor = require('../models/Conductor');
const Admin = require('../models/Admin');

// UPGRADED: Returns conductorId + full name in token payload
router.post('/conductor/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });
  try {
    const conductor = await Conductor.findOne({ username: username.toLowerCase() });
    if (!conductor || !(await conductor.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid username or password' });
    if (!conductor.isActive)
      return res.status(403).json({ message: 'Account is disabled. Contact admin.' });
    const token = jwt.sign(
      { id: conductor._id, role: 'conductor', username: conductor.username, name: conductor.name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, username: conductor.username, name: conductor.name, id: conductor._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username and password required' });
  try {
    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid username or password' });
    const token = jwt.sign(
      { id: admin._id, role: 'admin', username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, username: admin.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Seed route — only works if no admin exists yet (safe to leave in)
router.post('/seed', async (req, res) => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) await Admin.create({ username: 'admin', password: 'ksrtc@2024' });

    const c1 = await Conductor.findOne({ username: 'conductor1' });
    if (!c1) {
      await Conductor.create({ username: 'conductor1', password: 'pass@123', name: 'Raju Patil', mobile: '9876543210', employeeId: 'EMP001' });
      await Conductor.create({ username: 'conductor2', password: 'pass@123', name: 'Suresh Kumar', mobile: '9876543211', employeeId: 'EMP002' });
    }
    res.json({ message: '✅ Seeded: admin/ksrtc@2024 | conductor1,conductor2 / pass@123' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
