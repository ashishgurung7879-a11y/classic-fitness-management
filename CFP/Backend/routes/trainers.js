const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { TrainerSchedule, Booking } = require('../models/models');
const { protect, authorize } = require('../middleware/auth');
const { normalizeOptionalEmail, normalizePhone, getDuplicateField } = require('../utils/userFields');
const { validateProfilePhoto } = require('../utils/photos');

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizeTrainerProfileInput(profile = {}, existingProfile = {}) {
  const nextProfile = { ...existingProfile };

  if (profile.experience !== undefined) {
    const parsedExperience = Number(profile.experience);
    nextProfile.experience = Number.isFinite(parsedExperience) ? Math.max(0, parsedExperience) : 0;
  }
  if (profile.specialities !== undefined) {
    nextProfile.specialities = Array.isArray(profile.specialities)
      ? profile.specialities.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [];
  }
  if (profile.certifications !== undefined) nextProfile.certifications = String(profile.certifications || '').trim();
  if (profile.bio !== undefined) nextProfile.bio = String(profile.bio || '').trim();
  if (profile.applicationStatus !== undefined) nextProfile.applicationStatus = profile.applicationStatus;
  if (profile.appliedAt !== undefined) nextProfile.appliedAt = parseOptionalDate(profile.appliedAt);
  if (profile.approvedAt !== undefined) nextProfile.approvedAt = parseOptionalDate(profile.approvedAt);
  if (profile.rejectionReason !== undefined) nextProfile.rejectionReason = String(profile.rejectionReason || '').trim();

  return nextProfile;
}

// Public: only approved trainers are exposed publicly, and only safe fields
router.get('/', async (req, res) => {
  try {
    const trainers = await User.collection.find({
      role: 'trainer',
      'trainerProfile.applicationStatus': 'approved',
      $or: [
        { isActive: true },
        { isActive: { $exists: false } },
      ],
    }, {
      projection: {
        firstName: 1,
        lastName: 1,
        photo: 1,
        trainerProfile: 1,
        isActive: 1,
      },
    }).sort({ createdAt: -1 }).toArray();
    console.info('[GET /api/trainers] returning', trainers.length, 'approved/active trainers');
    res.json({ success: true, trainers });
  } catch(err) {
    console.error('[GET /api/trainers] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: all trainer applications
router.get('/applications', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    const query = { role: 'trainer' };
    if (status === 'pending') {
      query.$or = [
        { 'trainerProfile.applicationStatus': 'pending' },
        { 'trainerProfile.applicationStatus': { $exists: false } },
        { trainerProfile: { $exists: false } }
      ];
    } else if (status && status !== 'all') {
      query['trainerProfile.applicationStatus'] = status;
    }
    const trainers = await User.find(query).select('-password').sort({ createdAt: -1 });
    console.info('[GET /api/trainers/applications] returning', trainers.length, 'trainer applications');
    res.json({ success: true, trainers });
  } catch (err) {
    console.error('[GET /api/trainers/applications] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndUpdate(
      req.params.id,
      {
        role: 'trainer',
        isActive: true,
        'trainerProfile.applicationStatus': 'approved',
        'trainerProfile.approvedAt': new Date(),
        'trainerProfile.rejectionReason': ''
      },
      { new: true }
    ).select('-password');
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    console.info('[PUT /api/trainers/:id/approve] trainer approved', {
      id: trainer._id,
      name: `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim(),
    });
    res.json({ success: true, message: `✅ ${trainer.firstName} approved! Now visible on website.`, trainer });
  } catch (err) {
    console.error('[PUT /api/trainers/:id/approve] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findByIdAndUpdate(
      req.params.id,
      {
        'trainerProfile.applicationStatus': 'rejected',
        'trainerProfile.rejectionReason': req.body.reason || ''
      },
      { new: true }
    ).select('-password');
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    console.info('[PUT /api/trainers/:id/reject] trainer rejected', {
      id: trainer._id,
      name: `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim(),
    });
    res.json({ success: true, message: 'Trainer application rejected.', trainer });
  } catch (err) {
    console.error('[PUT /api/trainers/:id/reject] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get trainer schedule
router.get('/:id/schedule', async (req, res) => {
  const schedule = await TrainerSchedule.find({ trainer: req.params.id, isAvailable: true })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();
  res.json({
    success: true,
    schedule: schedule.map((slot) => ({
      ...slot,
      maxBookings: slot.maxSlots ?? 1
    }))
  });
});

// Add trainer schedule — trainer or admin
router.post('/:id/schedule', protect, authorize('trainer', 'admin'), async (req, res) => {
  try {
    if (req.user.role === 'trainer' && String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: 'You can only edit your own schedule' });
    }

    const maxSlots = Number(req.body?.maxBookings ?? req.body?.maxSlots ?? 1);
    const dayOfWeek = Number(req.body?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ success: false, message: 'Day of week must be between 0 and 6' });
    }
    if (!req.body?.startTime || !req.body?.endTime) {
      return res.status(400).json({ success: false, message: 'Start time and end time are required' });
    }

    const slot = await TrainerSchedule.create({
      trainer: req.params.id,
      dayOfWeek,
      startTime: req.body?.startTime || '',
      endTime: req.body?.endTime || '',
      isAvailable: req.body?.isAvailable !== false,
      maxSlots: Number.isFinite(maxSlots) ? Math.max(1, maxSlots) : 1
    });

    res.status(201).json({
      success: true,
      slot: {
        ...slot.toObject(),
        maxBookings: slot.maxSlots
      }
    });
  } catch (err) {
    console.error('[POST /api/trainers/:id/schedule] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Book a PT session with trainer
router.post('/:id/book', protect, async (req, res) => {
  try {
    const { date, slotId, notes } = req.body;
    const trainer = await User.findById(req.params.id);
    if (!trainer || trainer.role !== 'trainer') return res.status(404).json({ success: false, message: 'Trainer not found' });

    const booking = await Booking.create({
      user: req.user.id,
      class: '000000000000000000000000',
      trainer: req.params.id,
      date: new Date(date),
      type: 'pt_session',
      notes
    });

    // Update slot availability
    if (slotId) {
      await TrainerSchedule.findByIdAndUpdate(slotId, { $inc: { bookedSlots: 1 } });
    }

    console.info('[POST /api/trainers/:id/book] booking created', {
      trainerId: req.params.id,
      bookingId: booking._id,
    });
    res.status(201).json({ success: true, message: `✅ PT session booked with ${trainer.firstName}!`, booking });
  } catch (err) {
    console.error('[POST /api/trainers/:id/book] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add trainer — admin
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || '').trim();
    const password = String(req.body?.password || '');
    const normalizedPhone = normalizePhone(req.body?.phone);
    const normalizedEmail = normalizeOptionalEmail(req.body?.email);

    if (!firstName || !normalizedPhone || !password) {
      return res.status(400).json({ success: false, message: 'First name, phone, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const photoCheck = validateProfilePhoto(req.body?.photo);
    if (photoCheck.error) {
      return res.status(400).json({ success: false, message: photoCheck.error });
    }

    const duplicateChecks = [{ phone: normalizedPhone }];
    if (normalizedEmail) duplicateChecks.push({ email: normalizedEmail });
    const existingTrainer = await User.findOne({ $or: duplicateChecks }).select('_id');
    if (existingTrainer) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail ? 'Email or phone already registered' : 'Phone already registered'
      });
    }

    const trainer = await User.create({
      firstName,
      lastName: String(req.body?.lastName || '').trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role: 'trainer',
      photo: photoCheck.value,
      gender: req.body?.gender,
      dateOfBirth: parseOptionalDate(req.body?.dateOfBirth),
      address: String(req.body?.address || '').trim(),
      isActive: req.body?.isActive !== false,
      trainerProfile: normalizeTrainerProfileInput(req.body?.trainerProfile || {}, {
        applicationStatus: req.body?.trainerProfile?.applicationStatus || 'approved',
        approvedAt: new Date(),
        rejectionReason: ''
      })
    });

    console.info('[POST /api/trainers] created trainer', {
      id: trainer._id,
      name: `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim(),
      applicationStatus: trainer.trainerProfile?.applicationStatus,
      isActive: trainer.isActive,
    });
    res.status(201).json({ success: true, trainer });
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered'
      });
    }
    console.error('[POST /api/trainers] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update trainer
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findOne({ _id: req.params.id, role: 'trainer' }).select('-password');
    if (!trainer) {
      return res.status(404).json({ success: false, message: 'Trainer not found' });
    }

    if (req.body.photo !== undefined) {
      const photoCheck = validateProfilePhoto(req.body.photo);
      if (photoCheck.error) {
        return res.status(400).json({ success: false, message: photoCheck.error });
      }
      req.body.photo = photoCheck.value;
    }

    const allowedTopLevelFields = ['firstName', 'lastName', 'photo', 'gender', 'address', 'isActive', 'approvalStatus'];
    for (const field of allowedTopLevelFields) {
      if (req.body[field] !== undefined) {
        trainer[field] = req.body[field];
      }
    }

    if (req.body.dateOfBirth !== undefined) {
      trainer.dateOfBirth = parseOptionalDate(req.body.dateOfBirth);
    }

    if (req.body.phone !== undefined) {
      const normalizedPhone = normalizePhone(req.body.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }
      const existingPhoneUser = await User.findOne({ phone: normalizedPhone }).select('_id');
      if (existingPhoneUser && String(existingPhoneUser._id) !== String(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Phone already registered' });
      }
      trainer.phone = normalizedPhone;
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(req.body.email);
      if (normalizedEmail) {
        const existingEmailUser = await User.findOne({ email: normalizedEmail }).select('_id');
        if (existingEmailUser && String(existingEmailUser._id) !== String(req.params.id)) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        trainer.email = normalizedEmail;
      } else {
        trainer.email = undefined;
      }
    }

    if (req.body.password !== undefined) {
      const password = String(req.body.password || '');
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        trainer.password = password;
        trainer.twoFactorCode = '';
        trainer.twoFactorExpiresAt = null;
      }
    }

    if (req.body.trainerProfile && typeof req.body.trainerProfile === 'object') {
      trainer.trainerProfile = normalizeTrainerProfileInput(req.body.trainerProfile, trainer.trainerProfile || {});
    }

    await trainer.save();
    console.info('[PUT /api/trainers/:id] updated trainer', {
      id: trainer._id,
      name: `${trainer.firstName || ''} ${trainer.lastName || ''}`.trim(),
      applicationStatus: trainer.trainerProfile?.applicationStatus,
      isActive: trainer.isActive,
    });
    res.json({ success: true, trainer });
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered'
      });
    }
    console.error('[PUT /api/trainers/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await User.findOneAndDelete({ _id: req.params.id, role: 'trainer' });
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });
    console.info('[DELETE /api/trainers/:id] deleted trainer', req.params.id);
    res.json({ success: true, message: '✅ Trainer permanently removed.' });
  } catch (err) {
    console.error('[DELETE /api/trainers/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
