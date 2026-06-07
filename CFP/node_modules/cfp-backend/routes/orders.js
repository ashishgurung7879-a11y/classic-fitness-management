const express = require('express');
const r = express.Router();
const { Order } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');
r.post('/', protect, async (req, res) => { try { const o = await Order.create({ ...req.body, user: req.user.id }); res.status(201).json({ success: true, order: o }); } catch (e) { res.status(500).json({ success: false, message: e.message }); } });
r.get('/my', protect, async (req, res) => { const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }); res.json({ success: true, orders }); });
r.get('/', protect, authorize('admin'), async (req, res) => { const orders = await Order.find().populate('user', 'firstName lastName phone').sort({ createdAt: -1 }); res.json({ success: true, orders }); });
r.put('/:id/status', protect, authorize('admin'), async (req, res) => { const o = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }); res.json({ success: true, order: o }); });
module.exports = r;
