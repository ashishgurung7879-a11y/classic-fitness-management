const express = require('express');
const User = require('../models/User');
const { Notification } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');
const { sendCustomSmsNotification, runExpiryReminderScan } = require('../utils/notifications');
const { normalizePhone } = require('../utils/userFields');

const router = express.Router();

router.get('/my', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/my/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { readAt: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, type, limit = 25 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    const notifications = await Notification.find(query)
      .populate('user', 'firstName lastName phone membership')
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Number(limit) || 25));
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/expiring', protect, authorize('admin'), async (req, res) => {
  try {
    const members = await User.find({
      role: 'member',
      isActive: true,
      approvalStatus: 'approved',
      'membership.isActive': true,
      'membership.endDate': { $exists: true, $ne: null }
    })
      .select('firstName lastName phone membership')
      .sort({ 'membership.endDate': 1 });

    const now = new Date();
    const expiringMembers = members
      .map(member => {
        const endDate = new Date(member.membership?.endDate);
        const daysLeft = Number.isNaN(endDate.getTime()) ? null : Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
        return { member, daysLeft };
      })
      .filter(item => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 7)
      .map(item => ({
        _id: item.member._id,
        firstName: item.member.firstName,
        lastName: item.member.lastName,
        phone: item.member.phone,
        membership: item.member.membership,
        daysLeft: item.daysLeft
      }));

    res.json({ success: true, members: expiringMembers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/send-custom', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId, phone, title, message } = req.body;
    const normalizedPhone = phone ? normalizePhone(phone) : '';
    if (!message || (!userId && !phone)) {
      return res.status(400).json({ success: false, message: 'User or phone and message are required' });
    }

    const user = userId ? await User.findById(userId).select('firstName phone') : await User.findOne({ phone: normalizedPhone }).select('firstName phone');
    if (!user) return res.status(404).json({ success: false, message: 'Member not found for this phone number' });

    const notification = await sendCustomSmsNotification({
      user,
      phone: normalizedPhone || user.phone,
      title: title || 'Classic Fitness Park',
      message,
      triggeredBy: req.user.id
    });

    if (!notification) {
      return res.status(400).json({ success: false, message: 'Could not queue SMS notification' });
    }

    res.json({ success: true, message: 'SMS notification processed', notification });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/run-expiry-reminders', protect, authorize('admin'), async (req, res) => {
  try {
    const daysBefore = Math.max(1, Number(req.body?.daysBefore) || 3);
    const notifications = await runExpiryReminderScan({ triggeredBy: req.user.id, daysBefore });
    res.json({
      success: true,
      message: `Processed ${notifications.length} membership reminder${notifications.length === 1 ? '' : 's'}.`,
      total: notifications.length,
      notifications
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
