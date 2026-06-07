const express = require('express');
const User = require('../models/User');
const { Booking, Product, Gallery, ManualPayment, Attendance, Payment } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

// ── TRAINERS ─────────────────────────────────
const trainerRouter = express.Router();

// GET /api/trainers — PUBLIC — only APPROVED trainers (shown on website & to members)
trainerRouter.get('/', async (req, res) => {
  try {
    const trainers = await User.find({
      role: 'trainer',
      isActive: true,
      'trainerProfile.applicationStatus': 'approved'
    }).select('-password').sort({ updatedAt: -1 });
    res.json({ success: true, trainers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/trainers/applications — ADMIN — all applications, filter by ?status=pending|approved|rejected|all
trainerRouter.get('/applications', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const q = { role: 'trainer' };
    if (status && status !== 'all') q['trainerProfile.applicationStatus'] = status;
    const trainers = await User.find(q).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, trainers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/trainers/:id/approve — ADMIN
trainerRouter.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndUpdate(
      req.params.id,
      { 'trainerProfile.applicationStatus': 'approved', isActive: true },
      { new: true }
    ).select('-password');
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    res.json({ success: true, message: `✅ ${trainer.firstName} approved! Now visible on website.`, trainer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/trainers/:id/reject — ADMIN
trainerRouter.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndUpdate(
      req.params.id,
      { 'trainerProfile.applicationStatus': 'rejected', 'trainerProfile.rejectionReason': req.body.reason || '' },
      { new: true }
    ).select('-password');
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    res.json({ success: true, message: `Trainer application rejected.`, trainer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/trainers/:id — ADMIN — permanently remove a trainer
trainerRouter.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndDelete(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    res.json({ success: true, message: '✅ Trainer permanently removed.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/trainers/:id/book — member books a PT session
trainerRouter.post('/:id/book', protect, async (req, res) => {
  try {
    const { date, notes } = req.body;
    const trainer = await User.findById(req.params.id);
    if (!trainer || trainer.role !== 'trainer')
      return res.status(404).json({ success: false, message: 'Trainer not found' });
    const booking = await Booking.create({
      user: req.user.id, class: '000000000000000000000000',
      trainer: req.params.id, date: new Date(date), type: 'pt_session', notes
    });
    res.status(201).json({ success: true, message: `✅ PT session booked with ${trainer.firstName}!`, booking });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/trainers/:id — ADMIN — general update (keep last for route order)
trainerRouter.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    res.json({ success: true, trainer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/trainers — ADMIN — create trainer directly (legacy, prefer application flow)
trainerRouter.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.create({ ...req.body, role: 'trainer' });
    res.status(201).json({ success: true, trainer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PRODUCTS ─────────────────────────────────
const productRouter = express.Router();

productRouter.get('/', async (req, res) => {
  try {
    const { cat, search } = req.query;
    const q = { isActive: true };
    if (cat && cat !== 'all') q.category = cat;
    if (search) q.name = { $regex: search, $options: 'i' };
    const products = await Product.find(q).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

productRouter.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    if (!req.body.name || !req.body.price)
      return res.status(400).json({ success: false, message: 'Name and price required' });
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, message: '✅ Product added!', product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

productRouter.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: '✅ Product updated!', product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

productRouter.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '✅ Deleted!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GALLERY ──────────────────────────────────
const galleryRouter = express.Router();

galleryRouter.get('/', async (req, res) => {
  try {
    const photos = await Gallery.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, photos });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

galleryRouter.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const photo = await Gallery.create({ ...req.body, addedBy: req.user.id });
    res.status(201).json({ success: true, photo });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

galleryRouter.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── MANUAL PAYMENTS ───────────────────────────
const manualPayRouter = express.Router();

manualPayRouter.post('/submit', protect, async (req, res) => {
  try {
    const { paymentMethod, plan, amount, referenceId, screenshot } = req.body;
    if (!paymentMethod || !plan || !amount)
      return res.status(400).json({ success: false, message: 'Method, plan and amount required' });
    if (!referenceId && !screenshot)
      return res.status(400).json({ success: false, message: 'Provide reference ID or screenshot' });
    const payment = await ManualPayment.create({ user: req.user.id, paymentMethod, plan, amount: +amount, referenceId: referenceId || '', screenshot: screenshot || '' });
    res.status(201).json({ success: true, message: '✅ Payment submitted! Admin will verify soon.', payment: { id: payment._id, status: payment.status } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

manualPayRouter.get('/my', protect, async (req, res) => {
  try {
    const payments = await ManualPayment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, payments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

manualPayRouter.get('/all', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const q = {}; if (status) q.status = status;
    const payments = await ManualPayment.find(q).populate('user','firstName lastName phone email').sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit);
    const total = await ManualPayment.countDocuments(q);
    const pending = await ManualPayment.countDocuments({ status: 'pending' });
    res.json({ success: true, total, pending, payments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

manualPayRouter.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await ManualPayment.findById(req.params.id).populate('user','firstName lastName phone email membership');
    if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, payment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

manualPayRouter.put('/:id/verify', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await ManualPayment.findById(req.params.id).populate('user');
    if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
    payment.status = 'verified'; payment.adminNote = req.body.adminNote || '';
    payment.verifiedBy = req.user.id; payment.verifiedAt = new Date();
    await payment.save();
    if (payment.user) {
      const user = await User.findById(payment.user._id);
      if (user) {
        const endDate = new Date(); endDate.setDate(endDate.getDate() + 30);
        user.membership = { plan: payment.plan, startDate: new Date(), endDate, isActive: true, memberId: user.membership?.memberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000+Math.random()*9000)}` };
        await user.save({ validateBeforeSave: false });
      }
    }
    res.json({ success: true, message: '✅ Verified & membership activated!', payment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

manualPayRouter.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await ManualPayment.findByIdAndUpdate(req.params.id, { status: 'rejected', adminNote: req.body.adminNote || 'Rejected', verifiedBy: req.user.id, verifiedAt: new Date() }, { new: true });
    if (!payment) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: '❌ Payment rejected.', payment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DASHBOARD ────────────────────────────────
const dashRouter = express.Router();

dashRouter.get('/public', async (req, res) => {
  try {
    const totalMembers = await User.countDocuments({ role: 'member' });
    const totalTrainers = await User.countDocuments({ role: 'trainer', 'trainerProfile.applicationStatus': 'approved' });
    res.json({ success: true, stats: { members: totalMembers, trainers: totalTrainers } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

dashRouter.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const totalMembers  = await User.countDocuments({ role: 'member' });
    const activeMembers = await User.countDocuments({ role: 'member', 'membership.isActive': true, 'membership.endDate': { $gte: new Date() } });
    const pendingTrainers = await User.countDocuments({ role: 'trainer', 'trainerProfile.applicationStatus': 'pending' });
    const today = new Date(); today.setHours(0,0,0,0);
    const todayAttend = await Attendance.countDocuments({ checkinAt: { $gte: today } });
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const revenueThis = await ManualPayment.aggregate([{ $match: { status: 'verified', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const pendingPayments = await ManualPayment.countDocuments({ status: 'pending' });
    res.json({ success: true, stats: {
      members:  { total: totalMembers, active: activeMembers },
      trainers: { pendingApplications: pendingTrainers },
      revenue:  { thisMonth: revenueThis[0]?.total || 0 },
      attendance: { today: todayAttend },
      payments: { pending: pendingPayments }
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

dashRouter.get('/member', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const attendance = await Attendance.find({ user: req.user.id }).sort({ checkinAt: -1 }).limit(20);
    const bookings = await Booking.find({ user: req.user.id }).sort({ date: -1 }).limit(10);
    const rawPayments = await ManualPayment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(10);

    // Compute days left in membership
    let daysLeft = 0;
    if (user.membership?.endDate && user.membership?.isActive) {
      const diff = new Date(user.membership.endDate) - new Date();
      daysLeft = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    // Map ManualPayment fields to expected frontend format
    const payments = rawPayments.map(p => ({
      _id: p._id,
      status: p.status === 'verified' ? 'completed' : p.status,
      description: (p.plan.charAt(0).toUpperCase() + p.plan.slice(1)) + ' Membership Plan',
      method: p.paymentMethod,
      totalAmount: p.amount,
      screenshot: p.screenshot,
      createdAt: p.createdAt
    }));

    res.json({ success: true, dashboard: { stats: user.stats, attendance, bookings, payments, membership: { daysLeft } } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── CONTACT ──────────────────────────────────
const contactRouter = express.Router();
contactRouter.post('/', async (req, res) => {
  try {
    const { name, phone, email, type, message } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone required' });
    console.log(`📩 Contact from ${name} (${phone}): ${message}`);
    res.json({ success: true, message: '✅ Message received! We will contact you soon.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── NOTICES (gym open/closed + announcements) ──────────────────
const noticesRouter = express.Router();
noticesRouter.get('/', (req, res) => {
  const day = new Date().getDay(); // 0=Sun, 6=Sat
  const hour = new Date().getHours();
  const notices = [];
  if (day === 6) {
    notices.push({ icon: '🔴', title: 'GYM IS CLOSED TODAY', content: 'We are closed on Saturdays. See you Sunday at 5:00 AM!' });
  } else if (hour < 5 || hour >= 21) {
    notices.push({ icon: '🌙', title: 'GYM IS CURRENTLY CLOSED', content: 'We open at 5:00 AM · Sun–Fri · See you soon!' });
  } else if (hour >= 11 && hour < 14) {
    notices.push({ icon: '⏸️', title: 'BREAK TIME (11AM – 2PM)', content: 'Gym resumes at 2:00 PM. All equipment available after break.' });
  } else {
    notices.push({ icon: '✅', title: 'GYM IS OPEN TODAY', content: '5:00 AM – 9:00 PM · All facilities available · Break: 11AM–2PM' });
    notices.push({ icon: '💪', title: 'TRAINER SESSIONS AVAILABLE', content: 'Book a personal training session through our member portal.' });
  }
  res.json({ success: true, notices });
});

module.exports = { trainerRouter, productRouter, galleryRouter, manualPayRouter, dashRouter, contactRouter, noticesRouter };


