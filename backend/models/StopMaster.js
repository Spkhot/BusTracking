const mongoose = require('mongoose');

// Master stop coordinates cache.
// When admin adds a stop by name, we geocode it once and store here.
// All future uses of the same stop name reuse these coordinates.
const stopMasterSchema = new mongoose.Schema({
  // Normalized name for lookup (lowercase, trimmed)
  nameKey: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // Display name (original casing from admin)
  name: {
    type: String,
    required: true,
    trim: true
  },
  latitude:  { type: Number, default: null },
  longitude: { type: Number, default: null },
  // geocodeStatus: 'pending' | 'found' | 'failed' | 'manual'
  geocodeStatus: { type: String, default: 'pending' },
  geocodeAttempts: { type: Number, default: 0 },
  // Optional: state hint used in Nominatim query for better accuracy
  stateHint: { type: String, default: 'Karnataka' }
}, { timestamps: true });

module.exports = mongoose.model('StopMaster', stopMasterSchema);
