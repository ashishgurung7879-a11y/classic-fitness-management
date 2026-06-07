const express = require('express');
const router = express.Router();
const { Booking } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, async (req, res) => {
  try {
    const { classId, date, time, className, type = 'class', trainerId, notes } = req.body;
    const booking = await Booking.create({
      user: req.user.id,
      class: classId || '000000000000000000000000',
      trainer: trainerId || null,
      date: new Date(date),
      type, notes: notes || className, status: 'confirmed', className
    });
    res.status(201).json({ success: true, message: '✅ Booked successfully!', booking });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Already booked for this slot' });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate('trainer','firstName lastName').sort({ date: -1 }).limit(20);
    res.json({ success: true, bookings });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/trainer', protect, authorize('trainer','admin'), async (req, res) => {
  try {
    const query = { status: { $ne: 'cancelled' } };
    if (req.user.role === 'trainer') {
      query.trainer = req.user.id;
    }

    const bookings = await Booking.find(query)
      .populate('user','firstName lastName phone email')
      .populate('trainer','firstName lastName').sort({ date: -1 }).limit(100);
    res.json({ success: true, bookings });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user','firstName lastName phone')
      .populate('trainer','firstName lastName').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, bookings });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const b = await Booking.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { status: 'cancelled' }, { new: true });
    if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
