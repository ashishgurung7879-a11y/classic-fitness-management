// routes/classes.js
const express = require('express');
const router = express.Router();
const { Class } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

function buildClassPayload(body = {}) {
  const payload = {};

  if (body.name !== undefined) payload.name = String(body.name || '').trim();
  if (body.type !== undefined) payload.type = String(body.type || '').trim() || 'general';
  if (body.description !== undefined) payload.description = String(body.description || '').trim();
  if (body.trainer !== undefined) payload.trainer = body.trainer || null;
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    payload.capacity = Number.isFinite(capacity) ? Math.max(1, capacity) : 20;
  }
  if (body.isActive !== undefined) payload.isActive = body.isActive !== false && body.isActive !== 'false';

  if (body.schedule && typeof body.schedule === 'object') {
    const duration = Number(body.schedule.duration);
    payload.schedule = {
      dayOfWeek: Number.isInteger(Number(body.schedule.dayOfWeek)) ? Number(body.schedule.dayOfWeek) : undefined,
      startTime: String(body.schedule.startTime || '').trim(),
      endTime: String(body.schedule.endTime || '').trim(),
      duration: Number.isFinite(duration) ? Math.max(1, duration) : 60
    };
  }

  return payload;
}

router.get('/', async (req, res) => {
  const { type, day } = req.query;
  const q = { isActive: true };
  if (type) q.type = type;
  if (day !== undefined) q['schedule.dayOfWeek'] = +day;
  const classes = await Class.find(q).populate('trainer', 'firstName lastName photo').sort({ 'schedule.dayOfWeek': 1, 'schedule.startTime': 1 });
  res.json({ success: true, count: classes.length, classes });
});

router.post('/', protect, authorize('admin'), async (req, res) => {
  const payload = buildClassPayload(req.body);
  if (!payload.name) {
    return res.status(400).json({ success: false, message: 'Class name is required' });
  }
  const cls = await Class.create(payload);
  res.status(201).json({ success: true, class: cls });
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  const payload = buildClassPayload(req.body);
  const cls = await Class.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!cls) {
    return res.status(404).json({ success: false, message: 'Class not found' });
  }
  res.json({ success: true, class: cls });
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  await Class.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Class deleted' });
});

module.exports = router;
