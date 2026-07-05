const express = require('express');
const { query } = require('../db/mysql');

const router = express.Router();

function parseFeatures(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split('\n')
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ ok: true, text }));
  }
}

function mapPlan(row) {
  const amount = Number(row.amount ?? row.price ?? row.monthly_price ?? 0);
  return {
    _id: row.mongo_id || row.id,
    id: row.mongo_id || row.id,
    name: row.name || row.title || '',
    sub: row.subtitle || row.sub || row.description || '',
    description: row.description || '',
    amount: Number.isFinite(amount) ? amount : 0,
    price: Number.isFinite(amount) ? amount.toLocaleString() : '',
    period: row.period || row.billing_period || '/month',
    badge: row.badge || '',
    featured: !!(row.featured ?? row.is_featured),
    features: parseFeatures(row.features_json || row.features),
    isActive: row.is_active !== false && row.is_active !== 0,
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
  };
}

router.get('/', async (req, res) => {
  try {
    const rows = await query(`
      SELECT *
      FROM membership_plans
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC
    `);

    res.json({ success: true, plans: rows.map(mapPlan) });
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, plans: [] });
    }

    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
