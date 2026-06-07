const express = require('express');
const { ContactLead } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

const r = express.Router();

r.post('/', async (req, res) => {
  try {
    const { name, phone, email, type, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ success: false, message: 'Name and message required' });
    }

    const lead = await ContactLead.create({
      name,
      phone: phone || '',
      email: email || '',
      type: type || 'general',
      message,
      source: 'website'
    });

    res.status(201).json({
      success: true,
      message: 'Message received! We will contact you shortly.',
      leadId: lead._id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

r.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const [leads, total] = await Promise.all([
      ContactLead.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit),
      ContactLead.countDocuments(query)
    ]);

    res.json({ success: true, total, leads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

r.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const updates = {};

    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }

    if (req.body.adminNote !== undefined) {
      updates.adminNote = req.body.adminNote;
    }

    const lead = await ContactLead.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Contact lead not found' });
    }

    res.json({ success: true, message: 'Contact lead updated', lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = r;
