const express = require('express');
const router = express.Router();
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');
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

// ── Resolve internal SQL id from a public id ──────────────────────────────────
async function resolveUserSqlId(publicId) {
  if (!publicId) return null;
  const rows = await query(
    'SELECT id, mongo_id, first_name, phone FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
    [String(publicId), Number(publicId) || 0]
  );
  return rows[0] || null;
}

function mapManualPaymentRow(row = {}) {
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    user: row.user_mongo_id || String(row.user_id || ''),
    paymentMethod: row.payment_method,
    plan: row.plan,
    amount: Number(row.amount || 0),
    referenceId: row.reference_id || '',
    screenshot: row.screenshot || '',
    status: row.status,
    adminNote: row.admin_note || '',
    verifiedBy: row.verified_by_mongo_id || null,
    verifiedAt: row.verified_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getManualPaymentById(id) {
  const rows = await query(
    `SELECT mp.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id,
            u.first_name, u.last_name, u.phone, u.email,
            um.plan AS membership_plan, um.start_date AS membership_start_date, um.end_date AS membership_end_date, um.is_active AS membership_is_active, um.member_id AS membership_member_id
     FROM manual_payments mp
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN user_memberships um ON um.user_id = mp.user_id
     LEFT JOIN users vb ON vb.id = mp.verified_by
     WHERE (mp.mongo_id = ? OR mp.id = ?) LIMIT 1`,
    [String(id), Number(id) || 0]
  );
  
  if (!rows[0]) return null;
  const row = rows[0];
  
  const payment = mapManualPaymentRow(row);
  payment.user = {
    _id: row.user_mongo_id || String(row.user_id || ''),
    id: row.user_mongo_id || String(row.user_id || ''),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    phone: row.phone || '',
    email: row.email || '',
    membership: {
      plan: row.membership_plan || null,
      startDate: row.membership_start_date || null,
      endDate: row.membership_end_date || null,
      isActive: !!row.membership_is_active,
      memberId: row.membership_member_id || null
    }
  };
  return payment;
}

// ── MANUAL PAYMENT SCHEMA ─────────────────────────────────────
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

    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO manual_payments (mongo_id, user_id, payment_method, plan, amount, screenshot, reference_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [mongoId, userRow.id, paymentMethod, plan, numericAmount, screenshot || '', referenceId || '']
    );

    const payment = await getManualPaymentById(mongoId);

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
    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) {
      return res.json({ success: true, payments: [] });
    }

    const rows = await query(
      `SELECT mp.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id
       FROM manual_payments mp
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN users vb ON vb.id = mp.verified_by
       WHERE mp.user_id = ?
       ORDER BY mp.created_at DESC LIMIT 20`,
      [userRow.id]
    );

    res.json({ success: true, payments: rows.map(mapManualPaymentRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get all payments ───────────────────────────────────
router.get('/all', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND mp.status = ?';
      params.push(status);
    }

    const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    
    params.push(Math.max(1, Number(limit)));
    params.push(offset);

    const rows = await query(
      `SELECT mp.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id,
              u.first_name, u.last_name, u.phone, u.email
       FROM manual_payments mp
       LEFT JOIN users u ON u.id = mp.user_id
       LEFT JOIN users vb ON vb.id = mp.verified_by
       WHERE ${whereClause}
       ORDER BY mp.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const payments = rows.map(row => {
      const payment = mapManualPaymentRow(row);
      payment.user = {
        _id: row.user_mongo_id || String(row.user_id || ''),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        email: row.email || ''
      };
      return payment;
    });

    let countWhereClause = '1=1';
    const countParams = [];
    if (status) {
      countWhereClause += ' AND status = ?';
      countParams.push(status);
    }

    const totalRows = await query(`SELECT COUNT(*) as count FROM manual_payments WHERE ${countWhereClause}`, countParams);
    const pendingRows = await query(`SELECT COUNT(*) as count FROM manual_payments WHERE status = 'pending'`);

    res.json({ success: true, total: totalRows[0]?.count || 0, pending: pendingRows[0]?.count || 0, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: View single payment with screenshot ────────────────
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await getManualPaymentById(req.params.id);
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
    
    const verifierRow = await resolveUserSqlId(req.user.id);
    
    const payment = await getManualPaymentById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    await query(
      `UPDATE manual_payments SET status = 'verified', admin_note = ?, verified_by = ?, verified_at = NOW(), updated_at = NOW()
       WHERE (mongo_id = ? OR id = ?)`,
      [adminNote || '', verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );

    // Activate membership
    if (payment.user && payment.user._id) {
       const userRow = await resolveUserSqlId(payment.user._id);
       if (userRow) {
         const days = 30;
         const startDate = new Date();
         const endDate = new Date(startDate);
         endDate.setDate(endDate.getDate() + days);
         
         const memberId = payment.user.membership?.memberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

         await query(
           `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
            VALUES (?, ?, ?, ?, 1, ?, 'morning', 0, 0)
            ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date), is_active=1, member_id=COALESCE(member_id, VALUES(member_id))`,
           [userRow.id, payment.plan, startDate, endDate, memberId]
         );
       }
    }
    
    const updatedPayment = await getManualPaymentById(req.params.id);

    res.json({ success: true, message: '✅ Payment verified & membership activated!', payment: updatedPayment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Reject payment ─────────────────────────────────────
router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const { adminNote } = req.body;
    
    const verifierRow = await resolveUserSqlId(req.user.id);

    const result = await query(
      `UPDATE manual_payments SET status = 'rejected', admin_note = ?, verified_by = ?, verified_at = NOW(), updated_at = NOW()
       WHERE (mongo_id = ? OR id = ?)`,
      [adminNote || 'Payment rejected', verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );

    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Payment not found' });
    
    const payment = await getManualPaymentById(req.params.id);

    res.json({ success: true, message: '❌ Payment rejected.', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
