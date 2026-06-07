const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { Payment, ManualPayment, Booking, Attendance } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

function mapPaymentForMember(payment) {
  return {
    _id: payment._id,
    status: payment.status,
    description: payment.description || '',
    method: payment.method,
    totalAmount: payment.totalAmount,
    screenshot: payment.gateway?.screenshotFull || payment.gateway?.screenshot || '',
    createdAt: payment.createdAt
  };
}

function mapManualPaymentForMember(payment) {
  const plan = String(payment.plan || 'starter');
  return {
    _id: payment._id,
    status: payment.status === 'verified' ? 'completed' : payment.status,
    description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Membership Plan`,
    method: payment.paymentMethod,
    totalAmount: payment.amount,
    screenshot: payment.screenshot || '',
    createdAt: payment.createdAt
  };
}

router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalMembers,
      activeMembers,
      pendingMembers,
      pendingTrainers,
      paymentRevenueMonth,
      manualRevenueMonth,
      paymentRevenueTotal,
      manualRevenueTotal,
      pendingPayments,
      pendingManualPayments,
      todayAttendance
    ] = await Promise.all([
      User.countDocuments({ role: 'member', approvalStatus: 'approved' }),
      User.countDocuments({
        role: 'member',
        approvalStatus: 'approved',
        isActive: true,
        'membership.isActive': true,
        'membership.endDate': { $gte: now }
      }),
      User.countDocuments({ role: 'member', approvalStatus: 'pending' }),
      User.countDocuments({ role: 'trainer', 'trainerProfile.applicationStatus': 'pending' }),
      Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      ManualPayment.aggregate([
        { $match: { status: 'verified', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      ManualPayment.aggregate([
        { $match: { status: 'verified' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.countDocuments({ status: 'pending' }),
      ManualPayment.countDocuments({ status: 'pending' }),
      Attendance.countDocuments({ checkinAt: { $gte: todayStart } })
    ]);

    res.json({
      success: true,
      stats: {
        members: {
          total: totalMembers,
          active: activeMembers,
          inactive: Math.max(0, totalMembers - activeMembers),
          pendingApplications: pendingMembers
        },
        trainers: {
          pendingApplications: pendingTrainers
        },
        revenue: {
          thisMonth: (paymentRevenueMonth[0]?.total || 0) + (manualRevenueMonth[0]?.total || 0),
          total: (paymentRevenueTotal[0]?.total || 0) + (manualRevenueTotal[0]?.total || 0)
        },
        payments: {
          pending: pendingPayments + pendingManualPayments
        },
        attendance: {
          today: todayAttendance
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/member', protect, async (req, res) => {
  try {
    const [user, payments, manualPayments, bookings, attendance] = await Promise.all([
      User.findById(req.user.id).select('-password'),
      Payment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(10).lean(),
      ManualPayment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(10).lean(),
      Booking.find({ user: req.user.id }).sort({ date: -1 }).limit(10),
      Attendance.find({ user: req.user.id }).sort({ checkinAt: -1 }).limit(20)
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const membership = user.membership?.toObject?.() || user.membership || {};
    const hasActiveMembership = membership.isActive && membership.endDate;
    const daysLeft = hasActiveMembership
      ? Math.max(0, Math.ceil((new Date(membership.endDate) - new Date()) / 86400000))
      : 0;

    const mergedPayments = [
      ...payments.map(mapPaymentForMember),
      ...manualPayments.map(mapManualPaymentForMember)
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    res.json({
      success: true,
      dashboard: {
        user,
        stats: user.stats || {},
        membership: {
          ...membership,
          daysLeft
        },
        payments: mergedPayments,
        bookings,
        attendance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/public', async (req, res) => {
  try {
    const [members, trainers] = await Promise.all([
      User.countDocuments({ role: 'member' }),
      User.countDocuments({
        role: 'trainer',
        isActive: true,
        'trainerProfile.applicationStatus': 'approved'
      })
    ]);

    res.json({ success: true, stats: { members, trainers } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
