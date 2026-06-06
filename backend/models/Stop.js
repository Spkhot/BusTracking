const mongoose = require('mongoose');

// Each stop belongs to a RouteVariant and has an order position
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
    required: true
    // 1-based integer: 1=first stop, 2=second, etc.
  }
}, { timestamps: true });

// Compound index: fast lookup of ordered stops for a variant
stopSchema.index({ variantId: 1, order: 1 });

module.exports = mongoose.model('Stop', stopSchema);
