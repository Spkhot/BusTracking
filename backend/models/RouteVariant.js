const mongoose = require('mongoose');

// A Route (Nippani→Ichalkaranji) can have multiple variants
// e.g. "Via Sadalaga Bypass", "Via Chikodi Bypass"
const routeVariantSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
    // e.g. "Via Sadalaga Bypass"
  }
}, { timestamps: true });

// Unique variant name per route
routeVariantSchema.index({ routeId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('RouteVariant', routeVariantSchema);
