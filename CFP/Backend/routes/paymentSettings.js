const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { PaymentSetting } = require('../models/models');

const router = express.Router();

const MAX_QR_DATA_LENGTH = 4_500_000;
const SETTINGS_KEY = 'qr_payment_methods';

const defaultMethods = {
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

function mergeMethods(storedMethods = {}) {
  return Object.entries(defaultMethods).reduce((methods, [key, defaults]) => {
    const stored = storedMethods[key] || {};
    methods[key] = {
      ...defaults,
      ...stored,
      label: String(stored.label || defaults.label),
      color: String(stored.color || defaults.color),
      helper: String(stored.helper || defaults.helper),
      imageUrl: typeof stored.imageUrl === 'string' ? stored.imageUrl : '',
      isActive: stored.isActive === false ? false : true,
    };
    return methods;
  }, {});
}

function validateImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (typeof imageUrl !== 'string') {
    return 'QR image must be a valid image upload.';
  }
  if (imageUrl.length > MAX_QR_DATA_LENGTH) {
    return 'QR image is too large. Choose an image under 3MB.';
  }
  if (imageUrl.startsWith('data:image/') || /^https?:\/\//i.test(imageUrl)) {
    return null;
  }
  return 'QR image must be an image upload or a direct image URL.';
}

async function getSettings() {
  const document = await PaymentSetting.findOne({ key: SETTINGS_KEY });
  return {
    success: true,
    methods: mergeMethods(document?.methods),
    updatedAt: document?.updatedAt || null,
  };
}

router.get('/', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:method', protect, authorize('admin'), async (req, res) => {
  try {
    const method = req.params.method;
    if (!defaultMethods[method]) {
      return res.status(400).json({ success: false, message: 'Unsupported payment method.' });
    }

    const imageError = validateImageUrl(req.body?.imageUrl || '');
    if (imageError) {
      return res.status(400).json({ success: false, message: imageError });
    }

    const current = await PaymentSetting.findOne({ key: SETTINGS_KEY });
    const methods = mergeMethods(current?.methods);
    const currentMethod = methods[method];

    methods[method] = {
      ...currentMethod,
      label: String(req.body?.label || currentMethod.label).trim() || currentMethod.label,
      color: String(req.body?.color || currentMethod.color).trim() || currentMethod.color,
      helper: String(req.body?.helper || currentMethod.helper).trim() || currentMethod.helper,
      imageUrl: typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : currentMethod.imageUrl,
      isActive: req.body?.isActive === false || req.body?.isActive === 'false' ? false : true,
    };

    await PaymentSetting.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { key: SETTINGS_KEY, methods, updatedBy: req.user.id },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: `${methods[method].label} QR settings saved.`,
      methods,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
