const mongoose = require('mongoose');

// Each stop belongs to a RouteVariant and has an order position.
// Coordinates are NOT entered by admin — they come from StopMaster via geocoding.
const stopSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RouteVariant',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    required: true  // 1-based
  },
  // Coordinates — copied from StopMaster when stop is created/updated.
  // null until geocoding completes.
  latitude:  { type: Number, default: null },
  longitude: { type: Number, default: null },
  // Link to StopMaster for reference
  stopMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StopMaster',
    default: null
  }
}, { timestamps: true });

stopSchema.index({ variantId: 1, order: 1 });

module.exports = mongoose.model('Stop', stopSchema);
