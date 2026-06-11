// routes/memberships.js
const express = require('express');
const r = express.Router();
const { protect } = require('../middleware/auth');

const PLANS = [
  { id: 'starter', name: 'Starter', price: 1500, yearlyPrice: 18000, features: , excluded: },
  { id: 'pro', name: 'Pro', price: 4500, yearlyPrice: 2240, features: },
  { id: 'elite', name: 'Elite', price: 18000, yearlyPrice: 18000, features: [  ], excluded: [] }
];

r.get('/', (req, res) => res.json({ success: true, plans: PLANS }));
r.get('/my', protect, (req, res) => {
  const m = req.user.membership;
  const plan = PLANS.find(p => p.id === m?.plan);
  const daysLeft = m?.endDate ? Math.max(0, Math.ceil((new Date(m.endDate) - new Date()) / 86400000)) : 0;
  res.json({ success: true, membership: { ...m?.toObject?.() || m || {}, planDetails: plan, daysLeft, status: !m?.isActive ? 'inactive' : daysLeft <= 0 ? 'expired' : daysLeft <= 7 ? 'expiring_soon' : 'active' } });
});

module.exports = r;
