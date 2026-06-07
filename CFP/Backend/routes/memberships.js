// routes/memberships.js
const express = require('express');
const r = express.Router();
const { protect } = require('../middleware/auth');

const PLANS = [
  { id: 'starter', name: 'Starter', price: 1500, yearlyPrice: 1200, features: ['Full Gym Access', '2 Group Classes/Week', 'Locker Room', 'Fitness Assessment'], excluded: ['Personal Trainer', 'Nutrition Plan', 'Spa Access'] },
  { id: 'pro', name: 'Pro', price: 2800, yearlyPrice: 2240, features: ['Full Gym Access', 'Unlimited Classes', 'Locker + Towel', 'Monthly Assessment', '2 PT Sessions/Month', 'Basic Nutrition Plan'], excluded: ['Spa Access'] },
  { id: 'elite', name: 'Elite', price: 5000, yearlyPrice: 4000, features: ['24/7 Gym Access', 'Unlimited Classes', 'Premium Locker', 'Weekly Assessment', 'Unlimited PT Sessions', 'Custom Nutrition Plan', 'Spa & Sauna Access'], excluded: [] }
];

r.get('/', (req, res) => res.json({ success: true, plans: PLANS }));
r.get('/my', protect, (req, res) => {
  const m = req.user.membership;
  const plan = PLANS.find(p => p.id === m?.plan);
  const daysLeft = m?.endDate ? Math.max(0, Math.ceil((new Date(m.endDate) - new Date()) / 86400000)) : 0;
  res.json({ success: true, membership: { ...m?.toObject?.() || m || {}, planDetails: plan, daysLeft, status: !m?.isActive ? 'inactive' : daysLeft <= 0 ? 'expired' : daysLeft <= 7 ? 'expiring_soon' : 'active' } });
});

module.exports = r;
