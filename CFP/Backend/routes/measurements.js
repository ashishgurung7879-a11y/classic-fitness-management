const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const { Measurement } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');

const measurementFields = ['height', 'weight', 'forearms', 'biceps', 'chest', 'abdomen', 'thighs', 'calves'];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseMeasurementDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMeasurementPayload(body = {}, user) {
  const payload = {};

  measurementFields.forEach((field) => {
    const parsed = parseOptionalNumber(body[field]);
    if (parsed !== undefined) payload[field] = parsed;
  });

  if (body.measuredAt !== undefined) {
    const measuredAt = parseMeasurementDate(body.measuredAt);
    if (!measuredAt) {
      return { error: 'Measurement date is invalid' };
    }
    payload.measuredAt = measuredAt;
  }

  if (body.trainer !== undefined) payload.trainer = body.trainer || undefined;
  if (body.notes !== undefined) payload.notes = String(body.notes || '').trim();
  if (user?._id || user?.id) payload.recordedBy = user._id || user.id;

  return { payload };
}

async function assertMemberAccess(req, memberId) {
  if (!memberId) return false;
  if (!isValidObjectId(memberId)) return false;
  if (req.user.role === 'member') return String(req.user.id) === String(memberId);
  return ['admin', 'trainer'].includes(req.user.role);
}

router.get('/', protect, async (req, res) => {
  try {
    const memberId = req.user.role === 'member' ? req.user.id : req.query.memberId;
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId is required' });
    }

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({ success: false, message: 'memberId is invalid' });
    }

    if (!await assertMemberAccess(req, memberId)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view these measurements' });
    }

    const measurements = await Measurement.find({ member: memberId })
      .populate('member', 'firstName lastName phone photo membership')
      .populate('trainer', 'firstName lastName phone photo')
      .populate('recordedBy', 'firstName lastName role')
      .sort({ measuredAt: 1, createdAt: 1 });

    res.json({ success: true, measurements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!req.body.member) {
      return res.status(400).json({ success: false, message: 'Member is required' });
    }

    if (!isValidObjectId(req.body.member)) {
      return res.status(400).json({ success: false, message: 'Member is invalid' });
    }

    if (parseOptionalNumber(req.body.height) === undefined || parseOptionalNumber(req.body.weight) === undefined) {
      return res.status(400).json({ success: false, message: 'Height and weight are required' });
    }

    const member = await User.findOne({ _id: req.body.member, role: 'member' }).select('_id');
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (req.body.trainer) {
      if (!isValidObjectId(req.body.trainer)) {
        return res.status(400).json({ success: false, message: 'Trainer is invalid' });
      }

      const trainer = await User.findOne({ _id: req.body.trainer, role: 'trainer' }).select('_id');
      if (!trainer) {
        return res.status(404).json({ success: false, message: 'Trainer not found' });
      }
    }

    const { payload, error } = buildMeasurementPayload(req.body, req.user);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const measurement = await Measurement.create({
      ...payload,
      member: req.body.member,
      measuredAt: payload.measuredAt || new Date(),
    });

    const populated = await Measurement.findById(measurement._id)
      .populate('member', 'firstName lastName phone photo membership')
      .populate('trainer', 'firstName lastName phone photo')
      .populate('recordedBy', 'firstName lastName role');

    res.status(201).json({ success: true, message: 'Measurement saved.', measurement: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Measurement is invalid' });
    }

    const measurement = await Measurement.findById(req.params.id);
    if (!measurement) {
      return res.status(404).json({ success: false, message: 'Measurement not found' });
    }

    if (req.body.trainer) {
      if (!isValidObjectId(req.body.trainer)) {
        return res.status(400).json({ success: false, message: 'Trainer is invalid' });
      }

      const trainer = await User.findOne({ _id: req.body.trainer, role: 'trainer' }).select('_id');
      if (!trainer) {
        return res.status(404).json({ success: false, message: 'Trainer not found' });
      }
    }

    const { payload, error } = buildMeasurementPayload(req.body, req.user);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    Object.assign(measurement, payload);
    await measurement.save();

    const populated = await Measurement.findById(measurement._id)
      .populate('member', 'firstName lastName phone photo membership')
      .populate('trainer', 'firstName lastName phone photo')
      .populate('recordedBy', 'firstName lastName role');

    res.json({ success: true, message: 'Measurement updated.', measurement: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Measurement is invalid' });
    }

    const measurement = await Measurement.findByIdAndDelete(req.params.id);
    if (!measurement) {
      return res.status(404).json({ success: false, message: 'Measurement not found' });
    }

    res.json({ success: true, message: 'Measurement deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
