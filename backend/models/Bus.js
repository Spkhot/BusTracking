const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  busNumber: { type: String, required: true, unique: true, trim: true, uppercase: true }
}, { timestamps: true });

module.exports = mongoose.model('Bus', busSchema);
