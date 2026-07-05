const express = require('express');
const axios = require('axios');
const { query, transaction } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');
const { sendMembershipActivatedNotification } = require('../utils/notifications');

const isProduction = process.env.NODE_ENV === 'production';
const MAX_IMAGE_DATA_LENGTH = 4_500_000;
const PLACEHOLDER_FRONTEND_URL = 'https://your-domain.com';
const QR_SETTINGS_KEY = 'qr_payment_methods';

const legacyQrMethodMap = {
  esewa: 'esewa',
  prabhu: 'prabhu_bank',
  prabhu_bank: 'prabhu_bank',
  khalti: 'khalti',
};

const defaultQrMethods = {
  esewa: {
    label: 'eSewa',
    color: '#0f9d58',
    helper: 'Scan with eSewa and submit the transaction screenshot below.',
    imageUrl: '',
    isActive: true,
  },
  prabhu_bank: {
    label: 'Bank',
    color: '#cc0000',
    helper: 'Use a banking app that supports the Bank QR and keep the receipt screenshot.',
    imageUrl: '',
    isActive: true,
  },
  khalti: {
    label: 'Khalti',
    color: '#5c2d91',
    helper: 'Khalti is supported for proof submissions even if you paid outside this page.',
    imageUrl: '',
    isActive: true,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateImageData(imageData) {
  if (!imageData) return null;
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return 'A valid image upload is required';
  }
  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return 'Image too large. Max 3MB.';
  }
  return null;
}

function normalizeActivationOptions(body = {}) {
  const options = {};
  if (body.approvedStartDate !== undefined && body.approvedStartDate !== null && body.approvedStartDate !== '') {
    const approvedStartDate = new Date(body.approvedStartDate);
    if (!Number.isNaN(approvedStartDate.getTime())) {
      options.approvedStartDate = approvedStartDate;
    }
  }
  if (body.duration !== undefined) {
    const duration = Number(body.duration);
    if (Number.isFinite(duration)) {
      options.duration = Math.max(1, Math.floor(duration));
    }
  }
  return options;
}

function resolveMembershipWindow({ approvedStartDate, duration, isYearly }) {
  const parsedStartDate = approvedStartDate ? new Date(approvedStartDate) : new Date();
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;
  const totalDays = Math.max(1, Number(duration) || (isYearly ? 365 : 30));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + totalDays);
  return { startDate, endDate };
}

function resolvePlanFromPayment(payment) {
  const desc = String(payment.description || payment.plan || '').toLowerCase();
  if (desc.includes('elite')) return 'elite';
  if (desc.includes('pro')) return 'pro';
  return payment.plan || 'starter';
}

function resolveAmountForPlan(plan, fallbackAmount) {
  if (Number(fallbackAmount) > 0) return Number(fallbackAmount);
  const prices = { starter: 1500, pro: 2000, elite: 3000 };
  return prices[String(plan || 'starter').toLowerCase()] || 0;
}

function normalizeGatewayMethod(method = '') {
  if (method === 'prabhu') return 'prabhu_bank';
  if (method === 'khalti') return 'khalti';
  if (method === 'cash') return 'cash';
  return 'esewa';
}

function mergeQrMethods(storedMethods = {}) {
  return Object.entries(defaultQrMethods).reduce((methods, [key, defaults]) => {
    const stored = storedMethods[key] || {};
    methods[key] = {
      ...defaults,
      ...stored,
      imageUrl: typeof stored.imageUrl === 'string' ? stored.imageUrl : '',
      isActive: stored.isActive === false ? false : true,
    };
    return methods;
  }, {});
}

function resolveFrontendBaseUrl(req) {
  const configuredUrl = String(process.env.FRONTEND_URL || '').trim();
  if (configuredUrl && configuredUrl !== PLACEHOLDER_FRONTEND_URL) {
    return configuredUrl.replace(/\/+$/, '');
  }
  const requestOrigin = req.get('origin');
  if (requestOrigin && requestOrigin !== 'null') {
    return requestOrigin.replace(/\/+$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function buildPaymentReturnUrl(req, payment, gateway, status) {
  const url = new URL('/payment', `${resolveFrontendBaseUrl(req)}/`);
  url.searchParams.set('gateway', gateway);
  url.searchParams.set('status', status);
  url.searchParams.set('pid', payment.id || payment._id || '');
  url.searchParams.set('plan', resolvePlanFromPayment(payment));
  if (payment.totalAmount || payment.amount) {
    url.searchParams.set('amount', String(payment.totalAmount || payment.amount));
  }
  return url.toString();
}

function mapPaymentRow(row = {}) {
  let gateway = {};
  try { gateway = JSON.parse(row.gateway_json || '{}'); } catch { gateway = {}; }
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    user: row.user_mongo_id || String(row.user_id || ''),
    type: row.type || 'membership',
    description: row.description || '',
    amount: Number(row.amount || 0),
    totalAmount: Number(row.total_amount || 0),
    method: row.method,
    status: row.status,
    gateway,
    billingPeriod: { isYearly: !!row.billing_is_yearly },
    verifiedAt: row.verified_at || null,
    verifiedBy: row.verified_by_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    plan: row.plan || null,
  };
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

function mapPaymentForClient(payment) {
  return {
    _id: payment._id,
    status: payment.status,
    description: payment.description || '',
    method: payment.method,
    totalAmount: payment.totalAmount,
    screenshot: payment.gateway?.screenshotFull || payment.gateway?.screenshot || '',
    createdAt: payment.createdAt,
    user: payment.user,
  };
}

function mapManualPaymentForClient(payment) {
  const plan = String(payment.plan || 'starter');
  return {
    _id: payment._id,
    status: payment.status === 'verified' ? 'completed' : payment.status,
    description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Membership Plan`,
    method: payment.paymentMethod,
    totalAmount: payment.amount,
    screenshot: payment.screenshot,
    createdAt: payment.createdAt,
    user: payment.user,
  };
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

// ── Get a payment row by public id ────────────────────────────────────────────
async function getPaymentById(id) {
  const rows = await query(
    `SELECT p.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id
     FROM payments p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN users vb ON vb.id = p.verified_by
     WHERE (p.mongo_id = ? OR p.id = ?) LIMIT 1`,
    [String(id), Number(id) || 0]
  );
  return rows[0] ? mapPaymentRow(rows[0]) : null;
}

async function getManualPaymentById(id) {
  const rows = await query(
    `SELECT mp.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id,
            u.first_name, u.last_name, u.phone, u.email
     FROM manual_payments mp
     LEFT JOIN users u ON u.id = mp.user_id
     LEFT JOIN users vb ON vb.id = mp.verified_by
     WHERE (mp.mongo_id = ? OR mp.id = ?) LIMIT 1`,
    [String(id), Number(id) || 0]
  );
  return rows[0] || null;
}

// ── Activate membership after payment ─────────────────────────────────────────
async function activateMembership(payment, options = {}) {
  if (payment.type !== 'membership') return;
  const userRow = await resolveUserSqlId(payment.user);
  if (!userRow) return;

  const plan = resolvePlanFromPayment(payment);
  const { startDate, endDate } = resolveMembershipWindow({
    approvedStartDate: options.approvedStartDate,
    duration: options.duration,
    isYearly: payment.billingPeriod?.isYearly,
  });

  // Get existing memberId if any
  const membershipRows = await query(
    'SELECT member_id FROM user_memberships WHERE user_id = ? LIMIT 1',
    [userRow.id]
  );
  const existingMemberId = membershipRows[0]?.member_id;
  const memberId = existingMemberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await query(
    `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
     VALUES (?, ?, ?, ?, 1, ?, 'morning', 0, 0)
     ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date),
       is_active=1, member_id=COALESCE(member_id, VALUES(member_id))`,
    [userRow.id, plan, startDate, endDate, memberId]
  );

  const userForNotif = {
    _id: userRow.mongo_id || String(userRow.id),
    id: userRow.mongo_id || String(userRow.id),
    firstName: userRow.first_name || '',
    phone: userRow.phone || '',
  };

  await sendMembershipActivatedNotification({
    user: userForNotif,
    plan,
    amount: resolveAmountForPlan(plan, payment.totalAmount || payment.amount),
    startDate,
    endDate,
    paymentId: payment._id,
    triggeredBy: options.triggeredBy || payment.verifiedBy || null,
  });
}

async function activateManualMembership(payment, options = {}) {
  const userPublicId = payment.user_mongo_id || String(payment.user_id || payment.user || '');
  const userRow = await resolveUserSqlId(userPublicId);
  if (!userRow) return;

  const plan = resolvePlanFromPayment({ plan: payment.plan, description: payment.plan });
  const { startDate, endDate } = resolveMembershipWindow({
    approvedStartDate: options.approvedStartDate,
    duration: options.duration,
    isYearly: false,
  });

  const membershipRows = await query(
    'SELECT member_id FROM user_memberships WHERE user_id = ? LIMIT 1',
    [userRow.id]
  );
  const existingMemberId = membershipRows[0]?.member_id;
  const memberId = existingMemberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  await query(
    `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
     VALUES (?, ?, ?, ?, 1, ?, 'morning', 0, 0)
     ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date),
       is_active=1, member_id=COALESCE(member_id, VALUES(member_id))`,
    [userRow.id, plan, startDate, endDate, memberId]
  );

  const userForNotif = {
    _id: userRow.mongo_id || String(userRow.id),
    id: userRow.mongo_id || String(userRow.id),
    firstName: userRow.first_name || '',
    phone: userRow.phone || '',
  };

  await sendMembershipActivatedNotification({
    user: userForNotif,
    plan,
    amount: resolveAmountForPlan(plan, payment.amount),
    startDate,
    endDate,
    paymentId: payment.mongo_id || String(payment.id || ''),
    triggeredBy: options.triggeredBy || null,
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const payRouter = express.Router();

// ── eSewa initiate ────────────────────────────────────────────────────────────
payRouter.post('/esewa/initiate', protect, async (req, res) => {
  try {
    const { amount, type, description, billingYearly } = req.body;
    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'User not found' });

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO payments (mongo_id, user_id, type, description, amount, total_amount, method, status, billing_is_yearly, gateway_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'esewa', 'pending', ?, '{}', NOW(), NOW())`,
      [mongoId, userRow.id, type || 'membership', description || '', +amount, +amount, billingYearly ? 1 : 0]
    );

    const payment = await getPaymentById(mongoId);

    const params = {
      amt: +amount,
      txAmt: 0,
      psc: 0,
      pdc: 0,
      tAmt: +amount,
      pid: payment._id,
      scd: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
      su: buildPaymentReturnUrl(req, payment, 'esewa', 'success'),
      fu: buildPaymentReturnUrl(req, payment, 'esewa', 'failed'),
    };

    res.json({
      success: true,
      payment: { id: payment._id, amount: payment.totalAmount },
      esewa: { url: process.env.ESEWA_URL || 'https://uat.esewa.com.np/epay/main', params },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── eSewa verify ──────────────────────────────────────────────────────────────
payRouter.post('/esewa/verify', protect, async (req, res) => {
  try {
    const { oid, refId } = req.body;
    const payment = await getPaymentById(oid);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    if (String(payment.user) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You cannot verify another user's payment" });
    }
    if (payment.method !== 'esewa') {
      return res.status(400).json({ success: false, message: 'Invalid payment method for this verification route' });
    }
    if (payment.status === 'completed') return res.json({ success: true, message: 'Already verified', payment });

    if (isProduction) {
      return res.status(409).json({
        success: false,
        message: 'Automatic eSewa verification is disabled until a real gateway verification step is configured.',
      });
    }

    const updatedGateway = JSON.stringify({ ...(payment.gateway || {}), esewaRefId: refId });
    await query(
      `UPDATE payments SET status='completed', gateway_json=?, verified_at=NOW(), updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [updatedGateway, String(oid), Number(oid) || 0]
    );
    const updatedPayment = await getPaymentById(oid);
    await activateMembership(updatedPayment);
    res.json({ success: true, message: 'Payment verified!', payment: updatedPayment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Khalti initiate ───────────────────────────────────────────────────────────
payRouter.post('/khalti/initiate', protect, async (req, res) => {
  try {
    const { amount, type, description, billingYearly } = req.body;
    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'User not found' });

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO payments (mongo_id, user_id, type, description, amount, total_amount, method, status, billing_is_yearly, gateway_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'khalti', 'pending', ?, '{}', NOW(), NOW())`,
      [mongoId, userRow.id, type || 'membership', description || '', +amount, +amount, billingYearly ? 1 : 0]
    );
    const payment = await getPaymentById(mongoId);

    let pidx = `test_${payment._id}`;
    let paymentUrl = `https://test-pay.khalti.com/?pidx=${pidx}`;

    try {
      const frontendBaseUrl = resolveFrontendBaseUrl(req);
      const response = await axios.post(
        'https://a.khalti.com/api/v2/epayment/initiate/',
        {
          return_url: buildPaymentReturnUrl(req, payment, 'khalti', 'success'),
          website_url: frontendBaseUrl,
          amount: +amount * 100,
          purchase_order_id: payment._id,
          purchase_order_name: description,
        },
        { headers: { Authorization: `Key ${process.env.KHALTI_SECRET_KEY}` } }
      );
      pidx = response.data.pidx;
      paymentUrl = response.data.payment_url;
    } catch (err) {
      console.log('Khalti API (using test mode):', err.message);
    }

    const updatedGateway = JSON.stringify({ ...(payment.gateway || {}), pidx });
    await query(
      `UPDATE payments SET gateway_json=?, updated_at=NOW() WHERE (mongo_id=? OR id=?)`,
      [updatedGateway, mongoId, 0]
    );

    res.json({
      success: true,
      payment: { id: payment._id, amount: payment.totalAmount },
      khalti: { pidx, paymentUrl },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Khalti verify ─────────────────────────────────────────────────────────────
payRouter.post('/khalti/verify', protect, async (req, res) => {
  try {
    const { pidx, paymentId } = req.body;
    const payment = await getPaymentById(paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    if (String(payment.user) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "You cannot verify another user's payment" });
    }
    if (payment.method !== 'khalti') {
      return res.status(400).json({ success: false, message: 'Invalid payment method for this verification route' });
    }
    if (payment.status === 'completed') return res.json({ success: true, message: 'Already verified', payment });

    if (isProduction) {
      return res.status(409).json({
        success: false,
        message: 'Automatic Khalti verification is disabled until a real gateway verification step is configured.',
      });
    }

    const updatedGateway = JSON.stringify({ ...(payment.gateway || {}), khaltiIdx: pidx });
    await query(
      `UPDATE payments SET status='completed', gateway_json=?, verified_at=NOW(), updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [updatedGateway, String(paymentId), Number(paymentId) || 0]
    );
    const updatedPayment = await getPaymentById(paymentId);
    await activateMembership(updatedPayment);
    res.json({ success: true, message: 'Khalti payment verified!', payment: updatedPayment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Cash payment (admin) ──────────────────────────────────────────────────────
payRouter.post('/cash', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId, amount, type, description, billingYearly } = req.body;
    const numericAmount = Number(amount);
    if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'User and a valid amount are required' });
    }

    const userRow = await resolveUserSqlId(userId);
    if (!userRow) return res.status(404).json({ success: false, message: 'User not found' });

    const verifierRow = await resolveUserSqlId(req.user.id);
    const mongoId = generatePublicId();

    await query(
      `INSERT INTO payments (mongo_id, user_id, type, description, amount, total_amount, method, status, billing_is_yearly, gateway_json, verified_at, verified_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'cash', 'completed', ?, '{}', NOW(), ?, NOW(), NOW())`,
      [mongoId, userRow.id, type || 'membership', description || '', numericAmount, numericAmount, billingYearly ? 1 : 0, verifierRow?.id || null]
    );

    const payment = await getPaymentById(mongoId);
    await activateMembership(payment, { triggeredBy: req.user.id });
    res.status(201).json({ success: true, message: 'Cash payment recorded', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── My payments ───────────────────────────────────────────────────────────────
payRouter.get('/my', protect, async (req, res) => {
  try {
    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) return res.json({ success: true, payments: [] });

    const [paymentRows, manualRows] = await Promise.all([
      query(
        `SELECT p.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN users vb ON vb.id = p.verified_by
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC LIMIT 20`,
        [userRow.id]
      ),
      query(
        `SELECT mp.*, u.mongo_id AS user_mongo_id, vb.mongo_id AS verified_by_mongo_id
         FROM manual_payments mp
         LEFT JOIN users u ON u.id = mp.user_id
         LEFT JOIN users vb ON vb.id = mp.verified_by
         WHERE mp.user_id = ?
         ORDER BY mp.created_at DESC LIMIT 20`,
        [userRow.id]
      ),
    ]);

    const payments = paymentRows.map(mapPaymentRow);
    const manualPayments = manualRows.map(mapManualPaymentRow);

    const merged = [
      ...payments.map(mapPaymentForClient),
      ...manualPayments.map(mapManualPaymentForClient),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.json({ success: true, payments: merged });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All payments (admin) ──────────────────────────────────────────────────────
payRouter.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, method, page = 1, limit = 20 } = req.query;

    const payWhere = ['1=1'];
    const manWhere = ['1=1'];
    const payParams = [];
    const manParams = [];

    if (status) {
      payWhere.push('p.status = ?');
      payParams.push(status);
      const manStatus = status === 'completed' ? 'verified' : status === 'failed' ? 'rejected' : status;
      manWhere.push('mp.status = ?');
      manParams.push(manStatus);
    }
    if (method) {
      payWhere.push('p.method = ?');
      payParams.push(method);
      manWhere.push('mp.payment_method = ?');
      manParams.push(normalizeGatewayMethod(method));
    }

    const [paymentRows, manualRows, payRevRows, manRevRows] = await Promise.all([
      query(
        `SELECT p.*, u.mongo_id AS user_mongo_id, u.first_name, u.last_name, u.phone, vb.mongo_id AS verified_by_mongo_id
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN users vb ON vb.id = p.verified_by
         WHERE ${payWhere.join(' AND ')}
         ORDER BY p.created_at DESC`,
        payParams
      ),
      query(
        `SELECT mp.*, u.mongo_id AS user_mongo_id, u.first_name, u.last_name, u.phone, vb.mongo_id AS verified_by_mongo_id
         FROM manual_payments mp
         LEFT JOIN users u ON u.id = mp.user_id
         LEFT JOIN users vb ON vb.id = mp.verified_by
         WHERE ${manWhere.join(' AND ')}
         ORDER BY mp.created_at DESC`,
        manParams
      ),
      query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM payments WHERE status = 'completed'`),
      query(`SELECT COALESCE(SUM(amount), 0) AS total FROM manual_payments WHERE status = 'verified'`),
    ]);

    const payments = paymentRows.map((row) => ({
      ...mapPaymentForClient(mapPaymentRow(row)),
      user: {
        id: row.user_mongo_id || String(row.user_id || ''),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
      },
    }));

    const manualPayments = manualRows.map((row) => ({
      ...mapManualPaymentForClient(mapManualPaymentRow(row)),
      user: {
        id: row.user_mongo_id || String(row.user_id || ''),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
      },
    }));

    const merged = [...payments, ...manualPayments].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const numericLimit = Math.max(1, Number(limit) || 20);
    const numericPage = Math.max(1, Number(page) || 1);
    const startIndex = (numericPage - 1) * numericLimit;

    res.json({
      success: true,
      total: merged.length,
      payments: merged.slice(startIndex, startIndex + numericLimit),
      totalRevenue: (Number(payRevRows[0]?.total) || 0) + (Number(manRevRows[0]?.total) || 0),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Verify payment (admin) ────────────────────────────────────────────────────
payRouter.put('/:id/verify', protect, authorize('admin'), async (req, res) => {
  try {
    const verifierRow = await resolveUserSqlId(req.user.id);
    await query(
      `UPDATE payments SET status='completed', verified_at=NOW(), verified_by=?, updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );
    const payment = await getPaymentById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    await activateMembership(payment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
    res.json({ success: true, message: 'Payment verified', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Approve payment (admin) ───────────────────────────────────────────────────
payRouter.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const verifierRow = await resolveUserSqlId(req.user.id);

    // Try payments table first
    const payment = await getPaymentById(req.params.id);
    if (payment) {
      await query(
        `UPDATE payments SET status='completed', verified_at=NOW(), verified_by=?, updated_at=NOW()
         WHERE (mongo_id=? OR id=?)`,
        [verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
      );
      const updatedPayment = await getPaymentById(req.params.id);
      await activateMembership(updatedPayment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
      return res.json({ success: true, message: 'Payment approved and membership activated', payment: updatedPayment });
    }

    // Try manual_payments table
    const manRow = await getManualPaymentById(req.params.id);
    if (!manRow) return res.status(404).json({ success: false, message: 'Payment not found' });

    const adminNote = req.body?.adminNote || manRow.admin_note || '';
    await query(
      `UPDATE manual_payments SET status='verified', admin_note=?, verified_at=NOW(), verified_by=?, updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [adminNote, verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );
    const updatedManRow = await getManualPaymentById(req.params.id);
    await activateManualMembership(updatedManRow, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });

    return res.json({
      success: true,
      message: 'Payment approved and membership activated',
      payment: mapManualPaymentRow(updatedManRow),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Approved (alias) ──────────────────────────────────────────────────────────
payRouter.put('/:id/approved', protect, authorize('admin'), async (req, res) => {
  try {
    const verifierRow = await resolveUserSqlId(req.user.id);

    const payment = await getPaymentById(req.params.id);
    if (payment) {
      await query(
        `UPDATE payments SET status='completed', verified_at=NOW(), verified_by=?, updated_at=NOW()
         WHERE (mongo_id=? OR id=?)`,
        [verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
      );
      const updatedPayment = await getPaymentById(req.params.id);
      await activateMembership(updatedPayment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
      return res.json({ success: true, message: 'Payment approved and membership activated', payment: updatedPayment });
    }

    const manRow = await getManualPaymentById(req.params.id);
    if (!manRow) return res.status(404).json({ success: false, message: 'Payment not found' });

    const adminNote = req.body?.adminNote || manRow.admin_note || '';
    await query(
      `UPDATE manual_payments SET status='verified', admin_note=?, verified_at=NOW(), verified_by=?, updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [adminNote, verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );
    const updatedManRow = await getManualPaymentById(req.params.id);
    await activateManualMembership(updatedManRow, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });

    return res.json({
      success: true,
      message: 'Payment approved and membership activated',
      payment: mapManualPaymentRow(updatedManRow),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Reject payment (admin) ────────────────────────────────────────────────────
payRouter.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const verifierRow = await resolveUserSqlId(req.user.id);

    const payment = await getPaymentById(req.params.id);
    if (payment) {
      const updatedGateway = JSON.stringify({
        ...(payment.gateway || {}),
        rejectReason: req.body?.reason || 'Payment rejected',
      });
      await query(
        `UPDATE payments SET status='failed', gateway_json=?, verified_at=NOW(), verified_by=?, updated_at=NOW()
         WHERE (mongo_id=? OR id=?)`,
        [updatedGateway, verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
      );
      const updatedPayment = await getPaymentById(req.params.id);
      return res.json({ success: true, message: 'Payment rejected', payment: updatedPayment });
    }

    const manRow = await getManualPaymentById(req.params.id);
    if (!manRow) return res.status(404).json({ success: false, message: 'Payment not found' });

    const adminNote = req.body?.reason || req.body?.adminNote || 'Payment rejected';
    await query(
      `UPDATE manual_payments SET status='rejected', admin_note=?, verified_at=NOW(), verified_by=?, updated_at=NOW()
       WHERE (mongo_id=? OR id=?)`,
      [adminNote, verifierRow?.id || null, String(req.params.id), Number(req.params.id) || 0]
    );
    const updatedManRow = await getManualPaymentById(req.params.id);
    return res.json({ success: true, message: 'Payment rejected', payment: mapManualPaymentRow(updatedManRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Screenshot payment ────────────────────────────────────────────────────────
payRouter.post('/screenshot', protect, async (req, res) => {
  try {
    const { amount, method, description, screenshot, type } = req.body;
    if (!screenshot) return res.status(400).json({ success: false, message: 'Screenshot required' });
    const screenshotError = validateImageData(screenshot);
    if (screenshotError) return res.status(400).json({ success: false, message: screenshotError });
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'A valid amount is required' });
    }

    const userRow = await resolveUserSqlId(req.user.id);
    if (!userRow) return res.status(404).json({ success: false, message: 'User not found' });

    const mongoId = generatePublicId();
    const gatewayJson = JSON.stringify({
      screenshot: screenshot.substring(0, 500) + '...',
      screenshotFull: screenshot.length > 1000000 ? screenshot.substring(0, 1000000) : screenshot,
    });

    await query(
      `INSERT INTO payments (mongo_id, user_id, type, description, amount, total_amount, method, status, gateway_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [mongoId, userRow.id, type || 'membership', description || '', numericAmount, numericAmount, normalizeGatewayMethod(method), gatewayJson]
    );

    const payment = await getPaymentById(mongoId);
    res.status(201).json({
      success: true,
      message: 'Payment screenshot submitted! Admin will verify soon.',
      payment: { id: payment._id, amount: payment.totalAmount, status: 'pending' },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Upload QR code (admin) ────────────────────────────────────────────────────
payRouter.post('/qr/:gateway', protect, authorize('admin'), async (req, res) => {
  try {
    const { gateway } = req.params;
    const method = legacyQrMethodMap[gateway];
    const imageData = String(req.body?.imageData || '');
    const imageError = validateImageData(imageData);

    if (!method) return res.status(404).json({ success: false, message: 'Unknown gateway' });
    if (imageError) return res.status(400).json({ success: false, message: imageError });

    // Load existing settings
    const settingRows = await query(
      `SELECT ps.*, GROUP_CONCAT(
         CONCAT_WS('|', psm.method_key, psm.label, psm.color, psm.helper, psm.image_url, psm.is_active)
         ORDER BY psm.method_key SEPARATOR ';;'
       ) AS methods_raw
       FROM payment_settings ps
       LEFT JOIN payment_setting_methods psm ON psm.payment_setting_id = ps.id
       WHERE ps.setting_key = ? GROUP BY ps.id LIMIT 1`,
      [QR_SETTINGS_KEY]
    );

    let storedMethods = {};
    if (settingRows[0]?.methods_raw) {
      settingRows[0].methods_raw.split(';;').forEach((part) => {
        const [key, label, color, helper, imageUrl, isActive] = part.split('|');
        if (key) {
          storedMethods[key] = {
            label: label || key,
            color: color || '',
            helper: helper || '',
            imageUrl: imageUrl || '',
            isActive: isActive === '1',
          };
        }
      });
    }

    const methods = mergeQrMethods(storedMethods);
    methods[method] = { ...methods[method], imageUrl: imageData, isActive: true };

    const verifierRow = await resolveUserSqlId(req.user.id);
    const settingMongoId = generatePublicId();

    await transaction(async (conn) => {
      const [settingResult] = await conn.execute(
        `INSERT INTO payment_settings (mongo_id, setting_key, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE updated_by=VALUES(updated_by), id=LAST_INSERT_ID(id)`,
        [settingMongoId, QR_SETTINGS_KEY, verifierRow?.id || null]
      );

      await conn.execute(
        'DELETE FROM payment_setting_methods WHERE payment_setting_id = ?',
        [settingResult.insertId]
      );

      for (const [methodKey, m] of Object.entries(methods)) {
        await conn.execute(
          `INSERT INTO payment_setting_methods (payment_setting_id, method_key, label, color, helper, image_url, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [settingResult.insertId, methodKey, m.label || methodKey, m.color || '', m.helper || '', m.imageUrl || '', m.isActive ? 1 : 0]
        );
      }
    });

    const freshSettings = await query(
      'SELECT updated_at FROM payment_settings WHERE setting_key = ? LIMIT 1',
      [QR_SETTINGS_KEY]
    );

    res.status(201).json({
      success: true,
      message: `${methods[method].label} QR updated`,
      qr: { gateway, method, updatedAt: freshSettings[0]?.updated_at || null },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get QR code (public) ──────────────────────────────────────────────────────
payRouter.get('/qr/:gateway', async (req, res) => {
  try {
    const { gateway } = req.params;
    const method = legacyQrMethodMap[gateway];
    if (!method) return res.status(404).json({ success: false, message: 'Unknown gateway' });

    const settingRows = await query(
      `SELECT ps.updated_at, psm.image_url, psm.is_active
       FROM payment_settings ps
       JOIN payment_setting_methods psm ON psm.payment_setting_id = ps.id
       WHERE ps.setting_key = ? AND psm.method_key = ? LIMIT 1`,
      [QR_SETTINGS_KEY, method]
    );

    const qr = settingRows[0];
    if (!qr?.image_url) {
      return res.status(404).json({ success: false, message: `${gateway} QR not uploaded yet. Ask admin.` });
    }

    res.json({
      success: true,
      qr: {
        gateway,
        method,
        imageData: qr.image_url,
        updatedAt: qr.updated_at || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Submit payment ────────────────────────────────────────────────────────────
payRouter.post('/submit', protect, async (req, res) => {
  try {
    const { amount, description, method, screenshot, requestedStartDate, userId, type, duration, billingYearly } = req.body;

    if (!amount || !method) {
      return res.status(400).json({ success: false, message: 'Amount and method required' });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a valid positive number' });
    }

    if (req.user.role === 'admin' && userId) {
      const screenshotError = validateImageData(screenshot);
      if (screenshotError) return res.status(400).json({ success: false, message: screenshotError });

      const targetUserRow = await resolveUserSqlId(userId);
      if (!targetUserRow) return res.status(404).json({ success: false, message: 'Target user not found' });

      const mongoId = generatePublicId();
      const gatewayJson = screenshot
        ? JSON.stringify({ screenshotFull: screenshot, screenshot: screenshot.slice(0, 500) + '...' })
        : '{}';

      await query(
        `INSERT INTO payments (mongo_id, user_id, type, description, amount, total_amount, method, status, billing_is_yearly, gateway_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(), NOW())`,
        [mongoId, targetUserRow.id, type || 'membership', description || 'Membership Plan', numericAmount, numericAmount,
          normalizeGatewayMethod(method), billingYearly ? 1 : 0, gatewayJson]
      );

      const payment = await getPaymentById(mongoId);
      return res.status(201).json({
        success: true,
        message: 'Payment created for approval.',
        payment: { id: payment._id, status: payment.status, duration: Number(duration) || 1 },
      });
    }

    // Member submitting manual payment proof
    const desc = String(description || '').toLowerCase();
    const plan = desc.includes('pro') ? 'pro' : desc.includes('elite') ? 'elite' : 'starter';
    const paymentMethod = normalizeGatewayMethod(method);
    const screenshotError = validateImageData(screenshot);
    if (screenshotError) return res.status(400).json({ success: false, message: screenshotError });

    const memberRow = await resolveUserSqlId(req.user.id);
    if (!memberRow) return res.status(404).json({ success: false, message: 'User not found' });

    const mongoId = generatePublicId();
    await query(
      `INSERT INTO manual_payments (mongo_id, user_id, payment_method, plan, amount, screenshot, reference_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [mongoId, memberRow.id, paymentMethod, plan, numericAmount, screenshot || '', requestedStartDate || '']
    );

    const manualRow = await getManualPaymentById(mongoId);
    res.status(201).json({
      success: true,
      message: 'Payment submitted! Admin will verify soon.',
      payment: { id: manualRow.mongo_id || String(manualRow.id), status: manualRow.status },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { payRouter };
