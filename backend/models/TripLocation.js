const mongoose = require('mongoose');

// NEW: Every GPS ping stored here for route history / polyline display
const tripLocationSchema = new mongoose.Schema({
  tripId:    { type: mongoose.Schema.Types.ObjectId, ref: 'TripHistory', required: true, index: true },
  busNumber: { type: String, required: true, uppercase: true },
  latitude:  { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed:     { type: Number, default: 0 },
  accuracy:  { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now, index: true }
});

// Compound index for efficient polyline queries
tripLocationSchema.index({ tripId: 1, timestamp: 1 });

// Auto-delete after 7 days to keep DB lean
tripLocationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

module.exports = mongoose.model('TripLocation', tripLocationSchema);
