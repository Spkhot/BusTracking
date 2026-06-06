const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  source: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema);
