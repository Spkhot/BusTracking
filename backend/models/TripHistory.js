const mongoose = require('mongoose');

// NEW: Stores completed trip summaries for archiving
const tripHistorySchema = new mongoose.Schema({
  busNumber:      { type: String, required: true, uppercase: true },
  routeId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  conductorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Conductor' },
  conductorName:  { type: String },
  startedAt:      { type: Date, required: true },
  endedAt:        { type: Date },
  durationMinutes:{ type: Number },
  distanceKm:     { type: Number, default: 0 },
  totalUpdates:   { type: Number, default: 0 },
  endReason:      { type: String, enum: ['manual', 'timeout', 'auto'], default: 'manual' },
  // Archived after 24h — set by cleanup job
  archivedAt:     { type: Date }
}, { timestamps: true });

tripHistorySchema.index({ busNumber: 1, startedAt: -1 });
tripHistorySchema.index({ endedAt: 1 });

module.exports = mongoose.model('TripHistory', tripHistorySchema);
