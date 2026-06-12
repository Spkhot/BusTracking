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
module.exports = router;
