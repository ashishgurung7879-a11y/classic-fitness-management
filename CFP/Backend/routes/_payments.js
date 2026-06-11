const express = require('express');
const axios = require('axios');
const { Payment, ManualPayment, PaymentSetting } = require('../models/models');
const User = require('../models/User');
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
  url.searchParams.set('pid', payment._id.toString());
  url.searchParams.set('plan', resolvePlanFromPayment(payment));

  if (payment.totalAmount || payment.amount) {
    url.searchParams.set('amount', String(payment.totalAmount || payment.amount));
  }

  return url.toString();
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
    user: payment.user
  };
}

function mapManualPaymentForClient(payment) {
  return {
    _id: payment._id,
    status: payment.status === 'verified' ? 'completed' : payment.status,
    description: `${payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} Membership Plan`,
    method: payment.paymentMethod,
    totalAmount: payment.amount,
    screenshot: payment.screenshot,
    createdAt: payment.createdAt,
    user: payment.user
  };
}

async function activateMembership(payment, options = {}) {
  if (payment.type !== 'membership') return;
  const user = await User.findById(payment.user);
  if (!user) return;
  const plan = resolvePlanFromPayment(payment);
  const { startDate, endDate } = resolveMembershipWindow({
    approvedStartDate: options.approvedStartDate,
    duration: options.duration,
    isYearly: payment.billingPeriod?.isYearly
  });

  user.membership = {
    plan,
    startDate,
    endDate,
    isActive: true,
    memberId: user.membership?.memberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  };
  await user.save({ validateBeforeSave: false });

  await sendMembershipActivatedNotification({
    user,
    plan,
    amount: resolveAmountForPlan(plan, payment.totalAmount || payment.amount),
    startDate,
    endDate,
    paymentId: payment._id,
    triggeredBy: options.triggeredBy || payment.verifiedBy || null
  });
}

async function activateManualMembership(payment, options = {}) {
  const user = await User.findById(payment.user);
  if (!user) return;
  const plan = resolvePlanFromPayment(payment);
  const { startDate, endDate } = resolveMembershipWindow({
    approvedStartDate: options.approvedStartDate,
    duration: options.duration,
    isYearly: false
  });

  user.membership = {
    plan,
    startDate,
    endDate,
    isActive: true,
    memberId: user.membership?.memberId || `CFP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  };
  await user.save({ validateBeforeSave: false });

  await sendMembershipActivatedNotification({
    user,
    plan,
    amount: resolveAmountForPlan(plan, payment.amount),
    startDate,
    endDate,
    paymentId: payment._id,
    triggeredBy: options.triggeredBy || payment.verifiedBy || null
  });
}

const payRouter = express.Router();

payRouter.post('/esewa/initiate', protect, async (req, res) => {
  try {
    const { amount, type, description, billingYearly } = req.body;
    const payment = await Payment.create({
      user: req.user.id,
      type,
      description,
      amount: +amount,
      totalAmount: +amount,
      method: 'esewa',
      status: 'pending',
      billingPeriod: { isYearly: billingYearly }
    });

    const params = {
      amt: +amount,
      txAmt: 0,
      psc: 0,
      pdc: 0,
      tAmt: +amount,
      pid: payment._id.toString(),
      scd: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
      su: buildPaymentReturnUrl(req, payment, 'esewa', 'success'),
      fu: buildPaymentReturnUrl(req, payment, 'esewa', 'failed')
    };

    res.json({
      success: true,
      payment: { id: payment._id, amount: payment.totalAmount },
      esewa: { url: process.env.ESEWA_URL || 'https://uat.esewa.com.np/epay/main', params }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.post('/esewa/verify', protect, async (req, res) => {
  try {
    const { oid, refId } = req.body;
    const payment = await Payment.findById(oid);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (String(payment.user) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You cannot verify another user\'s payment' });
    }
    if (payment.method !== 'esewa') {
      return res.status(400).json({ success: false, message: 'Invalid payment method for this verification route' });
    }
    if (payment.status === 'completed') return res.json({ success: true, message: 'Already verified', payment });
    if (isProduction) {
      return res.status(409).json({
        success: false,
        message: 'Automatic eSewa verification is disabled until a real gateway verification step is configured.'
      });
    }
    payment.status = 'completed';
    payment.gateway = { ...(payment.gateway || {}), esewaRefId: refId };
    payment.verifiedAt = new Date();
    await payment.save();
    await activateMembership(payment);
    res.json({ success: true, message: 'Payment verified!', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.post('/khalti/initiate', protect, async (req, res) => {
  try {
    const { amount, type, description, billingYearly } = req.body;
    const payment = await Payment.create({
      user: req.user.id,
      type,
      description,
      amount: +amount,
      totalAmount: +amount,
      method: 'khalti',
      status: 'pending',
      billingPeriod: { isYearly: billingYearly }
    });

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
          purchase_order_id: payment._id.toString(),
          purchase_order_name: description,
          customer_info: {
            name: req.user.firstName,
            email: req.user.email,
            phone: req.user.phone
          }
        },
        { headers: { Authorization: `Key ${process.env.KHALTI_SECRET_KEY}` } }
      );
      pidx = response.data.pidx;
      paymentUrl = response.data.payment_url;
    } catch (err) {
      console.log('Khalti API (using test mode):', err.message);
    }

    payment.gateway = { ...(payment.gateway || {}), pidx };
    await payment.save();

    res.json({
      success: true,
      payment: { id: payment._id, amount: payment.totalAmount },
      khalti: { pidx, paymentUrl }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.post('/khalti/verify', protect, async (req, res) => {
  try {
    const { pidx, paymentId } = req.body;
    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (String(payment.user) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You cannot verify another user\'s payment' });
    }
    if (payment.method !== 'khalti') {
      return res.status(400).json({ success: false, message: 'Invalid payment method for this verification route' });
    }
    if (payment.status === 'completed') return res.json({ success: true, message: 'Already verified', payment });
    if (isProduction) {
      return res.status(409).json({
        success: false,
        message: 'Automatic Khalti verification is disabled until a real gateway verification step is configured.'
      });
    }
    payment.status = 'completed';
    payment.gateway = { ...(payment.gateway || {}), khaltiIdx: pidx };
    payment.verifiedAt = new Date();
    await payment.save();
    await activateMembership(payment);
    res.json({ success: true, message: 'Khalti payment verified!', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.post('/cash', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId, amount, type, description, billingYearly } = req.body;
    const numericAmount = Number(amount);
    if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'User and a valid amount are required' });
    }
    const payment = await Payment.create({
      user: userId,
      type,
      description,
      amount: numericAmount,
      totalAmount: numericAmount,
      method: 'cash',
      status: 'completed',
      verifiedAt: new Date(),
      verifiedBy: req.user.id,
      billingPeriod: { isYearly: billingYearly }
    });
    await activateMembership(payment, { triggeredBy: req.user.id });
    res.status(201).json({ success: true, message: 'Cash payment recorded', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.get('/my', protect, async (req, res) => {
  try {
    const [payments, manualPayments] = await Promise.all([
      Payment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20).lean(),
      ManualPayment.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20).lean()
    ]);

    const mergedPayments = [
      ...payments.map(mapPaymentForClient),
      ...manualPayments.map(mapManualPaymentForClient)
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.json({ success: true, payments: mergedPayments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, method, page = 1, limit = 20 } = req.query;
    const paymentQuery = {};
    const manualPaymentQuery = {};

    if (status) {
      paymentQuery.status = status;
      manualPaymentQuery.status = status === 'completed' ? 'verified' : status === 'failed' ? 'rejected' : status;
    }
    if (method) {
      paymentQuery.method = method;
      manualPaymentQuery.paymentMethod = normalizeGatewayMethod(method);
    }

    const [payments, manualPayments, paymentRevenue, manualRevenue] = await Promise.all([
      Payment.find(paymentQuery).populate('user', 'firstName lastName phone').lean(),
      ManualPayment.find(manualPaymentQuery).populate('user', 'firstName lastName phone').lean(),
      Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      ManualPayment.aggregate([{ $match: { status: 'verified' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);

    const mergedPayments = [
      ...payments.map(mapPaymentForClient),
      ...manualPayments.map(mapManualPaymentForClient)
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const numericLimit = Math.max(1, Number(limit) || 20);
    const numericPage = Math.max(1, Number(page) || 1);
    const startIndex = (numericPage - 1) * numericLimit;

    res.json({
      success: true,
      total: mergedPayments.length,
      payments: mergedPayments.slice(startIndex, startIndex + numericLimit),
      totalRevenue: (paymentRevenue[0]?.total || 0) + (manualRevenue[0]?.total || 0)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.put('/:id/verify', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', verifiedAt: new Date(), verifiedBy: req.user.id },
      { new: true }
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    await activateMembership(payment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
    res.json({ success: true, message: 'Payment verified', payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (payment) {
      payment.status = 'completed';
      payment.verifiedAt = new Date();
      payment.verifiedBy = req.user.id;
      await payment.save();
      await activateMembership(payment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
      return res.json({ success: true, message: 'Payment approved and membership activated', payment });
    }

    const manualPayment = await ManualPayment.findById(req.params.id);
    if (!manualPayment) return res.status(404).json({ success: false, message: 'Payment not found' });

    manualPayment.status = 'verified';
    manualPayment.adminNote = req.body?.adminNote || manualPayment.adminNote || '';
    manualPayment.verifiedAt = new Date();
    manualPayment.verifiedBy = req.user.id;
    await manualPayment.save();
    await activateManualMembership(manualPayment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });

    return res.json({
      success: true,
      message: 'Payment approved and membership activated',
      payment: manualPayment
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.put('/:id/approved', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (payment) {
      payment.status = 'completed';
      payment.verifiedAt = new Date();
      payment.verifiedBy = req.user.id;
      await payment.save();
      await activateMembership(payment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });
      return res.json({ success: true, message: 'Payment approved and membership activated', payment });
    }

    const manualPayment = await ManualPayment.findById(req.params.id);
    if (!manualPayment) return res.status(404).json({ success: false, message: 'Payment not found' });

    manualPayment.status = 'verified';
    manualPayment.adminNote = req.body?.adminNote || manualPayment.adminNote || '';
    manualPayment.verifiedAt = new Date();
    manualPayment.verifiedBy = req.user.id;
    await manualPayment.save();
    await activateManualMembership(manualPayment, { ...normalizeActivationOptions(req.body), triggeredBy: req.user.id });

    return res.json({
      success: true,
      message: 'Payment approved and membership activated',
      payment: manualPayment
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (payment) {
      payment.status = 'failed';
      payment.verifiedAt = new Date();
      payment.verifiedBy = req.user.id;
      payment.gateway = { ...(payment.gateway || {}), rejectReason: req.body?.reason || 'Payment rejected' };
      await payment.save();
      return res.json({ success: true, message: 'Payment rejected', payment });
    }

    const manualPayment = await ManualPayment.findById(req.params.id);
    if (!manualPayment) return res.status(404).json({ success: false, message: 'Payment not found' });

    manualPayment.status = 'rejected';
    manualPayment.adminNote = req.body?.reason || req.body?.adminNote || 'Payment rejected';
    manualPayment.verifiedAt = new Date();
    manualPayment.verifiedBy = req.user.id;
    await manualPayment.save();

    return res.json({ success: true, message: 'Payment rejected', payment: manualPayment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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

    const payment = await Payment.create({
      user: req.user.id,
      type: type || 'membership',
      description,
      amount: numericAmount,
      totalAmount: numericAmount,
      method: normalizeGatewayMethod(method),
      status: 'pending',
      gateway: { screenshot: screenshot.substring(0, 500) + '...' }
    });

    payment.gateway.screenshotFull = screenshot.length > 1000000 ? screenshot.substring(0, 1000000) : screenshot;
    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Payment screenshot submitted! Admin will verify soon.',
      payment: { id: payment._id, amount: payment.totalAmount, status: 'pending' }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.post('/qr/:gateway', protect, authorize('admin'), async (req, res) => {
  try {
    const { gateway } = req.params;
    const method = legacyQrMethodMap[gateway];
    const imageData = String(req.body?.imageData || '');
    const imageError = validateImageData(imageData);

    if (!method) return res.status(404).json({ success: false, message: 'Unknown gateway' });
    if (imageError) {
      return res.status(400).json({ success: false, message: imageError });
    }

    const current = await PaymentSetting.findOne({ key: QR_SETTINGS_KEY });
    const methods = mergeQrMethods(current?.methods);
    methods[method] = {
      ...methods[method],
      imageUrl: imageData,
      isActive: true,
    };

    const setting = await PaymentSetting.findOneAndUpdate(
      { key: QR_SETTINGS_KEY },
      { key: QR_SETTINGS_KEY, methods, updatedBy: req.user.id },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({
      success: true,
      message: `${methods[method].label} QR updated`,
      qr: {
        gateway,
        method,
        updatedAt: setting.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

payRouter.get('/qr/:gateway', async (req, res) => {
  const { gateway } = req.params;
  const method = legacyQrMethodMap[gateway];
  if (!method) return res.status(404).json({ success: false, message: 'Unknown gateway' });

  const setting = await PaymentSetting.findOne({ key: QR_SETTINGS_KEY });
  const methods = mergeQrMethods(setting?.methods);
  const qr = methods[method];

  if (!qr?.imageUrl) {
    return res.status(404).json({ success: false, message: `${gateway} QR not uploaded yet. Ask admin.` });
  }

  res.json({
    success: true,
    qr: {
      gateway,
      method,
      imageData: qr.imageUrl,
      updatedAt: setting?.updatedAt || null
    }
  });
});

payRouter.post('/submit', protect, async (req, res) => {
  try {
    const {
      amount,
      description,
      method,
      screenshot,
      requestedStartDate,
      userId,
      type,
      duration,
      billingYearly
    } = req.body;

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
      const payment = await Payment.create({
        user: userId,
        type: type || 'membership',
        description: description || 'Membership Plan',
        amount: numericAmount,
        totalAmount: numericAmount,
        method: normalizeGatewayMethod(method),
        status: 'pending',
        billingPeriod: { isYearly: !!billingYearly },
        gateway: screenshot ? { screenshotFull: screenshot, screenshot: screenshot.slice(0, 500) + '...' } : {}
      });

      return res.status(201).json({
        success: true,
        message: 'Payment created for approval.',
        payment: { id: payment._id, status: payment.status, duration: Number(duration) || 1 }
      });
    }

    const desc = String(description || '').toLowerCase();
    const plan = desc.includes('pro') ? 'pro' : desc.includes('elite') ? 'elite' : 'starter';
    const paymentMethod = normalizeGatewayMethod(method);
    const screenshotError = validateImageData(screenshot);
    if (screenshotError) return res.status(400).json({ success: false, message: screenshotError });
    const manualPayment = await ManualPayment.create({
      user: req.user.id,
      paymentMethod,
      plan,
      amount: numericAmount,
      screenshot: screenshot || '',
      referenceId: requestedStartDate || ''
    });

    res.status(201).json({
      success: true,
      message: 'Payment submitted! Admin will verify soon.',
      payment: { id: manualPayment._id, status: manualPayment.status }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { payRouter };
