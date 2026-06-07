const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { normalizeOptionalEmail, normalizePhone } = require('../utils/userFields');

function stripSensitiveUserFields(_doc, ret) {
  delete ret.password;
  delete ret.resetOTP;
  delete ret.resetOTPExpiry;
  delete ret.twoFactorCode;
  delete ret.twoFactorExpiresAt;
  return ret;
}

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: undefined, set: normalizeOptionalEmail },
  phone: { type: String, required: true, unique: true, set: normalizePhone },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['member', 'trainer', 'admin'], default: 'member' },
  photo: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  dateOfBirth: { type: Date },
  address: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  resetOTP: { type: String, select: false, default: '' },
  resetOTPExpiry: { type: Date, select: false, default: null },
  membership: {
    plan: { type: String, enum: ['none', 'starter', 'pro', 'elite'], default: 'none' },
    startDate: Date,
    endDate: Date,
    isActive: { type: Boolean, default: false },
    memberId: { type: String },
    shift: { type: String, enum: ['morning', 'afternoon', 'evening', 'night', 'multi'], default: 'morning' },
    dueAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 }
  },
  trainerProfile: {
    applicationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    experience: { type: Number, default: 0 },
    specialities: { type: [String], default: [] },
    certifications: { type: String, default: '' },
    bio: { type: String, default: '' },
    appliedAt: { type: Date },
    approvedAt: { type: Date },
    rejectionReason: { type: String, default: '' }
  },
  fitnessData: { height: Number, weight: Number, goal: String },
  stats: {
    totalWorkouts: { type: Number, default: 0 },
    attendanceDays: { type: Number, default: 0 },
    caloriesBurned: { type: Number, default: 0 },
    totalClasses: { type: Number, default: 0 }
  },
  qrCodeId: { type: String, unique: true, sparse: true },
  lastLogin: { type: Date },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorCode: { type: String, select: false, default: '' },
  twoFactorExpiresAt: { type: Date, select: false, default: null }
}, {
  timestamps: true,
  toJSON: { transform: stripSensitiveUserFields },
  toObject: { transform: stripSensitiveUserFields }
});

UserSchema.index({ email: 1 }, { unique: true, sparse: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  if (!this.qrCodeId) {
    this.qrCodeId = `CFP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

UserSchema.methods.getToken = function () {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or too weak. Set a strong secret in Backend/.env');
  }
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
};

module.exports = mongoose.model('User', UserSchema);
