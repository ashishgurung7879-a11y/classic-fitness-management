const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { query, transaction } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');

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

// ── Load stored methods from payment_settings + payment_setting_methods ────────
async function loadStoredMethods() {
  const settingRows = await query(
    'SELECT id, updated_at FROM payment_settings WHERE setting_key = ? LIMIT 1',
    [SETTINGS_KEY]
  );

  if (!settingRows[0]) return { methods: {}, updatedAt: null };

  const methodRows = await query(
    'SELECT method_key, label, color, helper, image_url, is_active FROM payment_setting_methods WHERE payment_setting_id = ?',
    [settingRows[0].id]
  );

  const storedMethods = {};
  for (const row of methodRows) {
    storedMethods[row.method_key] = {
      label: row.label || '',
      color: row.color || '',
      helper: row.helper || '',
      imageUrl: row.image_url || '',
      isActive: !!row.is_active,
    };
  }

  return { methods: storedMethods, updatedAt: settingRows[0].updated_at, settingId: settingRows[0].id };
}

// ── Persist merged methods ─────────────────────────────────────────────────────
async function saveSettings(methods, updatedBySqlId = null) {
  const mongoId = generatePublicId();

  await transaction(async (conn) => {
    const [settingResult] = await conn.execute(
      `INSERT INTO payment_settings (mongo_id, setting_key, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by), updated_at = NOW(), id = LAST_INSERT_ID(id)`,
      [mongoId, SETTINGS_KEY, updatedBySqlId]
    );

    const settingId = settingResult.insertId;

    await conn.execute('DELETE FROM payment_setting_methods WHERE payment_setting_id = ?', [settingId]);

    for (const [methodKey, m] of Object.entries(methods)) {
      await conn.execute(
        `INSERT INTO payment_setting_methods (payment_setting_id, method_key, label, color, helper, image_url, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [settingId, methodKey, m.label || methodKey, m.color || '', m.helper || '', m.imageUrl || '', m.isActive ? 1 : 0]
      );
    }
  });
}

async function getSettings() {
  const { methods: storedMethods, updatedAt } = await loadStoredMethods();
  return {
    success: true,
    methods: mergeMethods(storedMethods),
    updatedAt: updatedAt || null,
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

    const { methods: storedMethods } = await loadStoredMethods();
    const methods = mergeMethods(storedMethods);
    const currentMethod = methods[method];

    methods[method] = {
      ...currentMethod,
      label: String(req.body?.label || currentMethod.label).trim() || currentMethod.label,
      color: String(req.body?.color || currentMethod.color).trim() || currentMethod.color,
      helper: String(req.body?.helper || currentMethod.helper).trim() || currentMethod.helper,
      imageUrl: typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : currentMethod.imageUrl,
      isActive: req.body?.isActive === false || req.body?.isActive === 'false' ? false : true,
    };

    // Resolve updatedBy SQL id
    const userRows = await query(
      'SELECT id FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
      [String(req.user.id), Number(req.user.id) || 0]
    );

    await saveSettings(methods, userRows[0]?.id || null);

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
