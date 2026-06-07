// ============================================================
// MANUAL QR PAYMENT ROUTES — NEW FEATURE (Non-breaking)
// ============================================================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// Use existing mongoose
const mongoose = require('mongoose');
const MAX_IMAGE_DATA_LENGTH = 4_500_000;

function validateScreenshotInput(screenshot) {
  if (!screenshot) return null;
  if (typeof screenshot !== 'string' || !screenshot.startsWith('data:image/')) {
    return 'Screenshot must be an image upload';
  }
  if (screenshot.length > MAX_IMAGE_DATA_LENGTH) {
    return 'Screenshot too large. Max 3MB.';
  }
  return null;
}

// ── MANUAL PAYMENT SCHEMA ─────────────────────────────────────
const ManualPaymentSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentMethod: { type: String, enum: ['esewa', 'prabhu_bank', 'khalti'], required: true },
  plan:          { type: String, enum: ['starter', 'pro', 'elite'], required: true },
  amount:        { type: Number, required: true },
  referenceId:   { type: String, trim: true },
  screenshot:    { type: String }, // base64 or URL
  status:        { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  adminNote:     { type: String },
  verifiedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:    { type: Date },
  createdAt:     { type: Date, default: Date.now }
});
const ManualPayment = mongoose.models.ManualPayment ||
  mongoose.model('ManualPayment', ManualPaymentSchema);

// ── MEMBER: Submit payment proof ─────────────────────────────
router.post('/submit', protect, async (req, res) => {
  try {
    const { paymentMethod, plan, amount, referenceId, screenshot } = req.body;

    if (!paymentMethod || !plan || !amount) {
      return res.status(400).json({ success: false, message: 'Payment method, plan and amount are required' });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a valid positive number' });
    }
    if (!referenceId && !screenshot) {
      return res.status(400).json({ success: false, message: 'Please provide reference ID or payment screenshot' });
    }
    const screenshotError = validateScreenshotInput(screenshot);
    if (screenshotError) {
      return res.status(400).json({ success: false, message: screenshotError });
    }

    const payment = await ManualPayment.create({
      user: req.user.id,
      paymentMethod,
      plan,
      amount: numericAmount,
      referenceId: referenceId || '',
      screenshot: screenshot || '',
    });

    res.status(201).json({
      success: true,
      message: '✅ Payment submitted! Admin will verify within a few hours.',
      payment: { id: payment._id, status: payment.status }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── MEMBER: Get own payment history ──────────────────────────
router.get('/my', protect, async (req, res) => {
  try {
    const payments = await ManualPayment.find({ user: req.user.id })
      .sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get all payments ───────────────────────────────────
router.get('/all', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const q = {};
    if (status) q.status = status;

    const payments = await ManualPayment.find(q)
      .populate('user', 'firstName lastName phone email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit);

    const total = await ManualPayment.countDocuments(q);
    const pending = await ManualPayment.countDocuments({ status: 'pending' });

    res.json({ success: true, total, pending, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: View single payment with screenshot ────────────────
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await ManualPayment.findById(req.params.id)
      .populate('user', 'firstName lastName phone email membership');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Verify payment ─────────────────────────────────────
router.put('/:id/verify', protect, authorize('admin'), async (req, res) => {
  try {
    const { adminNote } = req.body;
    const payment = await ManualPayment.findById(req.params.id)
      .populate('user');

    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    payment.status = 'verified';
    payment.adminNote = adminNote || '';
    payment.verifiedBy = req.user.id;
    payment.verifiedAt = new Date();
    await payment.save();

    // Activate membership
    if (payment.user) {
      const User = require('../models/User');
      const user = await User.findById(payment.user._id);
      if (user) {
        const days = 30;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
        user.membership = {
          plan: payment.plan,
          startDate: new Date(),
          endDate,
          isActive: true,
          memberId: user.membership?.memberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
        };
        await user.save({ validateBeforeSave: false });
      }
    }

    res.json({ success: true, message: '✅ Payment verified & membership activated!', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Reject payment ─────────────────────────────────────
router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const { adminNote } = req.body;
    const payment = await ManualPayment.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', adminNote: adminNote || 'Payment rejected', verifiedBy: req.user.id, verifiedAt: new Date() },
      { new: true }
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, message: '❌ Payment rejected.', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
