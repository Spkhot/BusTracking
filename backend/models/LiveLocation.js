const mongoose = require('mongoose');

const liveLocationSchema = new mongoose.Schema({
  busNumber:    { type: String, required: true, unique: true, uppercase: true },
  routeId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  // NEW: optional variant — set when conductor selects a specific variant
  variantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'RouteVariant', default: null },
  conductorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Conductor' },
  conductorName:{ type: String },
  latitude:     { type: Number, required: true },
  longitude:    { type: Number, required: true },
  speed:        { type: Number, default: 0 },
  currentStopIdx: { type: Number, default: 0 }, // 0-based index of current/nearest stop
  heading:      { type: Number, default: 0 },
  accuracy:     { type: Number, default: 0 },
  status:       { type: String, default: 'active', enum: ['active', 'offline', 'disconnected'] },
  tripId:       { type: mongoose.Schema.Types.ObjectId, ref: 'TripHistory' },
  startedAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now }
});

liveLocationSchema.index({ updatedAt: 1 });
liveLocationSchema.index({ status: 1 });
liveLocationSchema.index({ variantId: 1 });   // for stop-based search

module.exports = mongoose.model('LiveLocation', liveLocationSchema);
