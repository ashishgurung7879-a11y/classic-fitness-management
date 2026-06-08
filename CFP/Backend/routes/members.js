const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { normalizeOptionalEmail, normalizePhone, getDuplicateField } = require('../utils/userFields');
const { sendMemberApprovedNotification } = require('../utils/notifications');

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseMoney(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePassword(value) {
  return typeof value === 'string' ? value : '';
}

function validatePhotoInput(photo) {
  if (photo === undefined || photo === null || photo === '') return '';
  const photoValue = String(photo);
  return photoValue.length <= 2 * 1024 * 1024 ? photoValue : null;
}

function buildMembershipInput(body = {}, existingMembership = {}) {
  const membershipBody = body.membership && typeof body.membership === 'object' ? body.membership : body;
  const membership = { ...existingMembership };

  if (membershipBody.plan !== undefined) membership.plan = membershipBody.plan;
  if (membershipBody.shift !== undefined) membership.shift = membershipBody.shift;
  if (membershipBody.isActive !== undefined) {
    membership.isActive = membershipBody.isActive !== false && membershipBody.isActive !== 'false';
  }
  if (membershipBody.memberId !== undefined && membershipBody.memberId !== '') {
    membership.memberId = String(membershipBody.memberId).trim();
  }

  if (membershipBody.startDate !== undefined) {
    if (membershipBody.startDate === '' || membershipBody.startDate === null) {
      membership.startDate = undefined;
    } else {
      const startDate = parseOptionalDate(membershipBody.startDate);
      if (startDate) membership.startDate = startDate;
    }
  }

  if (membershipBody.endDate !== undefined) {
    if (membershipBody.endDate === '' || membershipBody.endDate === null) {
      membership.endDate = undefined;
    } else {
      const endDate = parseOptionalDate(membershipBody.endDate);
      if (endDate) membership.endDate = endDate;
    }
  }

  if (membershipBody.dueAmount !== undefined) membership.dueAmount = parseMoney(membershipBody.dueAmount);
  if (membershipBody.paidAmount !== undefined) membership.paidAmount = parseMoney(membershipBody.paidAmount);

  return membership;
}

router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, photo, plan, startDate, endDate, shift, dueAmount, paidAmount } = req.body;
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const memberPassword = normalizePassword(password);
    const photoInput = validatePhotoInput(photo);
    
    // Validation
    if (!firstName || !normalizedPhone || !memberPassword) {
      return res.status(400).json({ success: false, message: 'First name, phone, and password are required' });
    }
    if (memberPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (photoInput === null) {
      return res.status(400).json({ success: false, message: 'Photo too large. Max 2MB.' });
    }

    // Check if email or phone already exists
    const duplicateChecks = [{ phone: normalizedPhone }];
    if (normalizedEmail) duplicateChecks.push({ email: normalizedEmail });
    const existingUser = await User.findOne({ $or: duplicateChecks });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail && existingUser.email === normalizedEmail ? 'Email already registered' : 'Phone already registered'
      });
    }

    // Create new member
    const newMember = new User({
      firstName,
      lastName: lastName || '',
      email: normalizedEmail,
      phone: normalizedPhone,
      password: memberPassword,
      photo: photoInput,
      role: 'member',
      approvalStatus: 'approved',
      isActive: true,
      membership: {
        ...buildMembershipInput({ plan, startDate, endDate, shift, dueAmount, paidAmount }),
        plan: plan || 'starter',
        isActive: true,
        shift: shift || 'morning',
        memberId: `CFP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
      }
    });

    await newMember.save();
    await sendMemberApprovedNotification(newMember, req.user.id);

    res.json({ 
      success: true, 
      message: 'Member created successfully',
      member: {
        _id: newMember._id,
        firstName: newMember.firstName,
        lastName: newMember.lastName,
        email: newMember.email,
        phone: newMember.phone,
        photo: newMember.photo,
        membership: newMember.membership
      }
    });
  } catch (err) { 
    if (err.code === 11000) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered'
      });
    }
    res.status(500).json({ success: false, message: err.message }); 
  }
});

router.get('/', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { search, plan, page = 1, limit = 50 } = req.query;
    const q = { role: 'member', approvalStatus: 'approved' };

    if (search) {
      q.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (plan) {
      q['membership.plan'] = plan;
    }

    const members = await User.find(q)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(+limit);

    const total = await User.countDocuments(q);
    res.json({ success: true, total, members });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/applications', protect, authorize('admin'), async (req, res) => {
  try {
    const members = await User.find({ role: 'member', approvalStatus: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, members });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/me', protect, async (req, res) => {
  try {
    const member = await User.findOne({ _id: req.user.id, role: 'member' }).select('-password');
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, member });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'member' },
      { approvalStatus: 'approved', isActive: true },
      { new: true }
    ).select('-password');
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    await sendMemberApprovedNotification(member, req.user.id);
    res.json({ success: true, message: 'Member approved', member });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'member' },
      { approvalStatus: 'rejected', isActive: false },
      { new: true }
    ).select('-password');
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, message: 'Member rejected', member });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const m = await User.findOne({ _id: req.params.id, role: 'member' }).select('-password');
    if (!m) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, member: m });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await User.findOne({ _id: req.params.id, role: 'member' }).select('-password');
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const allowedTopLevelFields = ['firstName', 'lastName', 'photo', 'gender', 'dateOfBirth', 'address', 'isActive', 'approvalStatus'];
    for (const field of allowedTopLevelFields) {
      if (req.body[field] !== undefined) {
        if (field === 'dateOfBirth') {
          member.dateOfBirth = parseOptionalDate(req.body[field]);
        } else if (field === 'photo') {
          const photoInput = validatePhotoInput(req.body[field]);
          if (photoInput === null) {
            return res.status(400).json({ success: false, message: 'Photo too large. Max 2MB.' });
          }
          member.photo = photoInput;
        } else {
          member[field] = req.body[field];
        }
      }
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
      member.phone = normalizedPhone;
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(req.body.email);
      if (normalizedEmail) {
        const existingEmailUser = await User.findOne({ email: normalizedEmail }).select('_id');
        if (existingEmailUser && String(existingEmailUser._id) !== String(req.params.id)) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        member.email = normalizedEmail;
      } else {
        member.email = undefined;
      }
    }

    if (req.body.password !== undefined) {
      const memberPassword = normalizePassword(req.body.password);
      if (memberPassword) {
        if (memberPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        member.password = memberPassword;
      }
    }

    const membershipFields = ['plan', 'startDate', 'endDate', 'shift', 'dueAmount', 'paidAmount', 'isActive', 'memberId'];
    const hasMembershipUpdate =
      membershipFields.some((field) => req.body[field] !== undefined) ||
      (req.body.membership && typeof req.body.membership === 'object' &&
        membershipFields.some((field) => req.body.membership[field] !== undefined));

    if (hasMembershipUpdate) {
      member.membership = buildMembershipInput(req.body, member.membership || {});
    }

    await member.save();
    res.json({ success: true, member });
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered'
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id/suspend', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'member' },
      { isActive: false },
      { new: true }
    );
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, message: 'Member suspended' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await User.findOneAndDelete({ _id: req.params.id, role: 'member' });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, message: 'Member deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
