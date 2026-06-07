const mongoose = require('mongoose');

// ── ATTENDANCE ────────────────────────────────
const AttendanceSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  checkinAt:  { type: Date, default: Date.now },
  checkoutAt: { type: Date },
  duration:   { type: Number }, // minutes
  method:     { type: String, enum: ['qr','manual','app'], default: 'qr' },
  markedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// ── BOOKING ───────────────────────────────────
const BookingSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  class:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  trainer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date:      { type: Date, required: true },
  type:      { type: String, enum: ['class','pt_session'], default: 'class' },
  status:    { type: String, enum: ['confirmed','cancelled','completed'], default: 'confirmed' },
  notes:     { type: String },
  className: { type: String }
}, { timestamps: true });

const ClassSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  type:        { type: String, default: 'general' },
  description: { type: String, default: '' },
  trainer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  schedule: {
    dayOfWeek: { type: Number, min: 0, max: 6 },
    startTime: { type: String, default: '' },
    endTime:   { type: String, default: '' },
    duration:  { type: Number, default: 60 }
  },
  capacity: { type: Number, default: 20 },
  enrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ── PAYMENT ───────────────────────────────────
const PaymentSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, enum: ['membership','product','pt_session'], default: 'membership' },
  description:   { type: String },
  amount:        { type: Number, required: true },
  totalAmount:   { type: Number, required: true },
  method:        { type: String, enum: ['esewa','khalti','cash','prabhu_bank'], required: true },
  status:        { type: String, enum: ['pending','completed','failed','refunded'], default: 'pending' },
  gateway:       { type: Object, default: {} },
  billingPeriod: { isYearly: { type: Boolean, default: false } },
  verifiedAt:    { type: Date },
  verifiedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ── MANUAL PAYMENT ────────────────────────────
const ManualPaymentSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentMethod: { type: String, enum: ['esewa','prabhu_bank','khalti'], required: true },
  plan:          { type: String, enum: ['starter','pro','elite'], required: true },
  amount:        { type: Number, required: true },
  referenceId:   { type: String, trim: true },
  screenshot:    { type: String },
  status:        { type: String, enum: ['pending','verified','rejected'], default: 'pending' },
  adminNote:     { type: String },
  verifiedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:    { type: Date }
}, { timestamps: true });

// ── PRODUCT ───────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel:     { type: String, enum: ['sms'], default: 'sms' },
  type:        { type: String, enum: ['login_welcome', 'member_approved', 'membership_activated', 'membership_expiring', 'password_reset', 'custom'], required: true },
  title:       { type: String, required: true, trim: true },
  message:     { type: String, required: true, trim: true },
  sentTo:      { type: String, required: true, trim: true },
  status:      { type: String, enum: ['pending', 'sent', 'skipped', 'failed'], default: 'pending' },
  sentAt:      { type: Date },
  readAt:      { type: Date },
  error:       { type: String, default: '' },
  dedupeKey:   { type: String, default: '' },
  meta:        { type: Object, default: {} },
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const ProductSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  price:       { type: Number, required: true, min: 0 },
  salePrice:   { type: Number, default: null },
  description: { type: String, default: '' },
  category:    { type: String, enum: ['protein','vitamins','gear','apparel','drinks','other'], default: 'other' },
  emoji:       { type: String, default: '' },
  imageUrl:    { type: String, default: '' },
  badge:       { type: String, default: '' },
  stock:       { type: Number, default: 50 },
  isActive:    { type: Boolean, default: true },
  rating:      { avg: { type: Number, default: 4.5 }, count: { type: Number, default: 0 } }
}, { timestamps: true });

// ── GALLERY ───────────────────────────────────
const GallerySchema = new mongoose.Schema({
  title:    { type: String },
  imageUrl: { type: String, required: true },
  category: { type: String, default: 'gym' },
  isActive: { type: Boolean, default: true },
  addedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const NoticeSchema = new mongoose.Schema({
  type:    { type: String, default: 'announcement' },
  title:   { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  color:   { type: String, default: '#CC0000' },
  emoji:   { type: String, default: '' }
}, { timestamps: true });

// ── TRAINER SCHEDULE ──────────────────────────
const TrainerScheduleSchema = new mongoose.Schema({
  trainer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dayOfWeek:   { type: Number, min: 0, max: 6 },
  startTime:   { type: String },
  endTime:     { type: String },
  isAvailable: { type: Boolean, default: true },
  bookedSlots: { type: Number, default: 0 },
  maxSlots:    { type: Number, default: 5 }
});

const ContactLeadSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, trim: true, default: '' },
  email:     { type: String, trim: true, lowercase: true, default: '' },
  type:      { type: String, trim: true, default: 'general' },
  message:   { type: String, required: true, trim: true },
  status:    { type: String, enum: ['new', 'in_progress', 'closed'], default: 'new' },
  adminNote: { type: String, trim: true, default: '' },
  source:    { type: String, default: 'website' }
}, { timestamps: true });

module.exports = {
  Attendance:      mongoose.model('Attendance',      AttendanceSchema),
  Booking:         mongoose.model('Booking',         BookingSchema),
  Class:           mongoose.model('Class',           ClassSchema),
  Payment:         mongoose.model('Payment',         PaymentSchema),
  ManualPayment:   mongoose.model('ManualPayment',   ManualPaymentSchema),
  Notification:    mongoose.model('Notification',    NotificationSchema),
  Product:         mongoose.model('Product',         ProductSchema),
  Gallery:         mongoose.model('Gallery',         GallerySchema),
  Notice:          mongoose.model('Notice',          NoticeSchema),
  ContactLead:     mongoose.model('ContactLead',     ContactLeadSchema),
  TrainerSchedule: mongoose.model('TrainerSchedule', TrainerScheduleSchema),
};
