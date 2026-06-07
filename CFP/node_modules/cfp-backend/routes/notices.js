const express = require('express');
const { Notice } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const notices = await Notice.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      notices: notices.map((notice) => ({
        ...notice,
        content: notice.message,
        icon: notice.emoji
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { type, title, message, color, emoji } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const notice = await Notice.create({
      type: type || 'announcement',
      title: String(title).trim(),
      message: String(message).trim(),
      color: color || '#CC0000',
      emoji: emoji || '📢'
    });

    res.status(201).json({
      success: true,
      message: 'Notice posted successfully',
      notice: {
        ...notice.toObject(),
        content: notice.message,
        icon: notice.emoji
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const notice = await Notice.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    res.json({ success: true, message: 'Notice removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
