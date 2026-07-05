const express = require('express');
const router = express.Router();
const { query } = require('../db/mysql');
const { protect, authorize } = require('../middleware/auth');

function mapPaymentForMember(row) {
  return {
    _id: row.mongo_id || String(row.id),
    status: row.status,
    description: row.description || '',
    method: row.method,
    totalAmount: Number(row.total_amount || 0),
    screenshot: row.gateway_screenshot_full || row.gateway_screenshot || '',
    createdAt: row.created_at
  };
}

function mapManualPaymentForMember(row) {
  const plan = String(row.plan || 'starter');
  return {
    _id: row.mongo_id || String(row.id),
    status: row.status === 'verified' ? 'completed' : row.status,
    description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Membership Plan`,
    method: row.payment_method,
    totalAmount: Number(row.amount || 0),
    screenshot: row.screenshot || '',
    createdAt: row.created_at
  };
}

async function getActiveUserRecord(publicId) {
  const rows = await query(
    `
      SELECT
        u.id,
        u.mongo_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.role,
        u.photo,
        u.gender,
        u.date_of_birth,
        u.address,
        u.is_active,
        u.approval_status,
        u.qr_code_id,
        u.last_login,
        u.two_factor_enabled,
        u.created_at,
        u.updated_at,
        um.plan AS membership_plan,
        um.start_date AS membership_start_date,
        um.end_date AS membership_end_date,
        um.is_active AS membership_is_active,
        um.member_id AS membership_member_id,
        um.shift AS membership_shift,
        um.due_amount AS membership_due_amount,
        um.paid_amount AS membership_paid_amount,
        tp.application_status AS trainer_application_status,
        tp.experience AS trainer_experience,
        tp.bio AS trainer_bio
      FROM users u
      LEFT JOIN user_memberships um ON um.user_id = u.id
      LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
      WHERE u.mongo_id = ? OR u.id = ?
      LIMIT 1
    `,
    [publicId, Number(publicId) || 0]
  );

  return rows[0] || null;
}

router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalMembersRows,
      activeMembersRows,
      pendingMembersRows,
      pendingTrainersRows,
      paymentRevenueMonthRows,
      manualRevenueMonthRows,
      paymentRevenueTotalRows,
      manualRevenueTotalRows,
      pendingPaymentsRows,
      pendingManualPaymentsRows,
      todayAttendanceRows
    ] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM users WHERE role = 'member' AND approval_status = 'approved'", []),
      query("SELECT COUNT(*) AS total FROM users u LEFT JOIN user_memberships um ON um.user_id = u.id WHERE u.role = 'member' AND u.approval_status = 'approved' AND u.is_active = 1 AND um.is_active = 1 AND um.end_date >= ?", [now]),
      query("SELECT COUNT(*) AS total FROM users WHERE role = 'member' AND approval_status = 'pending'", []),
      query("SELECT COUNT(*) AS total FROM users u LEFT JOIN trainer_profiles tp ON tp.user_id = u.id WHERE u.role = 'trainer' AND tp.application_status = 'pending'", []),
      query("SELECT SUM(total_amount) AS total FROM payments WHERE status = 'completed' AND created_at >= ?", [startOfMonth]),
      query("SELECT SUM(amount) AS total FROM manual_payments WHERE status = 'verified' AND created_at >= ?", [startOfMonth]),
      query("SELECT SUM(total_amount) AS total FROM payments WHERE status = 'completed'", []),
      query("SELECT SUM(amount) AS total FROM manual_payments WHERE status = 'verified'", []),
      query("SELECT COUNT(*) AS total FROM payments WHERE status = 'pending'", []),
      query("SELECT COUNT(*) AS total FROM manual_payments WHERE status = 'pending'", []),
      query("SELECT COUNT(*) AS total FROM attendance WHERE checkin_at >= ?", [todayStart])
    ]);

    const paymentRevenueMonth = Number(paymentRevenueMonthRows[0]?.total || 0);
    const manualRevenueMonth = Number(manualRevenueMonthRows[0]?.total || 0);
    const paymentRevenueTotal = Number(paymentRevenueTotalRows[0]?.total || 0);
    const manualRevenueTotal = Number(manualRevenueTotalRows[0]?.total || 0);
    const totalMembers = Number(totalMembersRows[0]?.total || 0);
    const activeMembers = Number(activeMembersRows[0]?.total || 0);

    res.json({
      success: true,
      stats: {
        members: {
          total: totalMembers,
          active: activeMembers,
          inactive: Math.max(0, totalMembers - activeMembers),
          pendingApplications: Number(pendingMembersRows[0]?.total || 0)
        },
        trainers: {
          pendingApplications: Number(pendingTrainersRows[0]?.total || 0)
        },
        revenue: {
          thisMonth: paymentRevenueMonth + manualRevenueMonth,
          total: paymentRevenueTotal + manualRevenueTotal
        },
        payments: {
          pending: Number(pendingPaymentsRows[0]?.total || 0) + Number(pendingManualPaymentsRows[0]?.total || 0)
        },
        attendance: {
          today: Number(todayAttendanceRows[0]?.total || 0)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/member', protect, async (req, res) => {
  try {
    const userRow = await getActiveUserRecord(req.user.id);
    
    if (!userRow) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [payments, manualPayments, bookings, attendance] = await Promise.all([
      query("SELECT id, mongo_id, status, description, method, total_amount, JSON_UNQUOTE(JSON_EXTRACT(gateway_json, '$.screenshotFull')) as gateway_screenshot_full, JSON_UNQUOTE(JSON_EXTRACT(gateway_json, '$.screenshot')) as gateway_screenshot, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [userRow.id]),
      query("SELECT id, mongo_id, status, plan, payment_method, amount, screenshot, created_at FROM manual_payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", [userRow.id]),
      query("SELECT id, mongo_id, booking_at as date, type, status, notes, class_name as className FROM bookings WHERE user_id = ? ORDER BY booking_at DESC LIMIT 10", [userRow.id]),
      query("SELECT id, mongo_id as _id, checkin_at as checkinAt, checkout_at as checkoutAt, method FROM attendance WHERE user_id = ? ORDER BY checkin_at DESC LIMIT 20", [userRow.id])
    ]);


    const user = {
      _id: userRow.mongo_id || String(userRow.id),
      id: userRow.mongo_id || String(userRow.id),
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      email: userRow.email,
      phone: userRow.phone,
      role: userRow.role,
      photo: userRow.photo,
      membership: {
        plan: userRow.membership_plan || 'none',
        startDate: userRow.membership_start_date || null,
        endDate: userRow.membership_end_date || null,
        isActive: !!userRow.membership_is_active,
        memberId: userRow.membership_member_id || null,
        shift: userRow.membership_shift || 'morning',
        dueAmount: Number(userRow.membership_due_amount || 0),
        paidAmount: Number(userRow.membership_paid_amount || 0),
      },
      trainerProfile: userRow.trainer_application_status ? {
        applicationStatus: userRow.trainer_application_status,
        experience: Number(userRow.trainer_experience || 0),
        bio: userRow.trainer_bio || '',
      } : null,
      approvalStatus: userRow.approval_status || 'approved',
      twoFactorEnabled: !!userRow.two_factor_enabled,
      isActive: !!userRow.is_active,
      dateOfBirth: userRow.date_of_birth || null,
      gender: userRow.gender || 'male',
      qrCodeId: userRow.qr_code_id || null,
      lastLogin: userRow.last_login || null,
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
    };

    const membership = user.membership || {};
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
    const [membersResult, trainersResult] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM users WHERE role = 'member'", []).then((rows) => Number(rows[0]?.total || 0)),
      query("SELECT COUNT(*) AS total FROM users u LEFT JOIN trainer_profiles tp ON tp.user_id = u.id WHERE u.role = 'trainer' AND u.is_active = 1 AND tp.application_status = 'approved'", []).then((rows) => Number(rows[0]?.total || 0))
    ]);

    res.json({ success: true, stats: { members: membersResult, trainers: trainersResult } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
