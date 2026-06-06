const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// UPGRADED: Added name, mobile, employeeId fields
const conductorSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:   { type: String, required: true },
  name:       { type: String, required: true, trim: true },
  mobile:     { type: String, required: true, trim: true, match: [/^\d{10}$/, 'Mobile must be 10 digits'] },
  employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
  isActive:   { type: Boolean, default: true }
}, { timestamps: true });

conductorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

conductorSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Never return password in JSON responses
conductorSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Conductor', conductorSchema);
