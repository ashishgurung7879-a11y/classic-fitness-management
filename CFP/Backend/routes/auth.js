const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { normalizeOptionalEmail, normalizePhone, getDuplicateField } = require('../utils/userFields');
const { sendLoginWelcomeNotification, sendPasswordResetCodeNotification } = require('../utils/notifications');
const { generateOneTimeCode, hashOneTimeCode, verifyOneTimeCode } = require('../utils/oneTimeCode');

const isProduction = process.env.NODE_ENV === 'production';

function attachDevelopmentCode(payload, fieldName, code) {
  if (isProduction || !code) return payload;
  return { ...payload, [fieldName]: code };
}

const sendToken = (user, code, res, msg) => {
  const token = user.getToken();
  res.status(code).json({
    success: true, message: msg, token,
    user: {
      id: user._id, firstName: user.firstName, lastName: user.lastName,
      email: user.email, phone: user.phone, role: user.role,
      photo: user.photo, membership: user.membership, qrCodeId: user.qrCodeId,
      trainerProfile: user.trainerProfile || null,
      approvalStatus: user.approvalStatus || 'approved',
      twoFactorEnabled: !!user.twoFactorEnabled
    }
  });
};

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, dateOfBirth, gender, role, trainerApplication } = req.body;
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedPhone = normalizePhone(phone);
    if (!firstName || !normalizedPhone || !password) {
      return res.status(400).json({ success: false, message: 'First name, phone, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const duplicateChecks = [{ phone: normalizedPhone }];
    if (normalizedEmail) duplicateChecks.push({ email: normalizedEmail });
    const exists = await User.findOne({ $or: duplicateChecks });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail && exists.email === normalizedEmail ? 'Email already registered' : 'Phone already registered'
      });
    }

    if (role === 'trainer') {
      if (!trainerApplication || !trainerApplication.specialities?.length) {
        return res.status(400).json({ success: false, message: 'Select at least one speciality' });
      }

      const user = await User.create({
        firstName,
        lastName: lastName || '',
        email: normalizedEmail,
        phone: normalizedPhone,
        password,
        dateOfBirth,
        gender,
        role: 'trainer',
        trainerProfile: {
          applicationStatus: 'pending',
          experience: parseInt(trainerApplication.experience, 10) || 0,
          specialities: trainerApplication.specialities || [],
          certifications: trainerApplication.certifications || '',
          bio: trainerApplication.bio || '',
          appliedAt: new Date()
        }
      });

      return res.status(201).json({
        success: true,
        message: `Application submitted! Admin will review and contact you soon, ${user.firstName}!`
      });
    }

    const user = await User.create({
      firstName,
      lastName: lastName || '',
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      dateOfBirth,
      gender,
      approvalStatus: 'pending'
    });

    res.status(201).json({
      success: true,
      message: `Registration submitted! Admin approval is required before ${user.firstName} can log in.`
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

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { identifier, email, phone, password, twoFactorCode } = req.body;
    const rawIdentifier = identifier ?? email ?? phone ?? '';
    const loginIdentifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';
    const normalizedEmail = normalizeOptionalEmail(loginIdentifier);
    const normalizedPhone = normalizePhone(loginIdentifier);

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Enter phone or email and password' });
    }

    const user = await User.findOne({ $or: [{ phone: normalizedPhone }, { email: normalizedEmail }] })
      .select('+password +twoFactorCode +twoFactorExpiresAt');

    if (!user) return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    if (!await user.matchPassword(password)) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }
    if (user.role === 'member' && (user.approvalStatus || 'approved') !== 'approved') {
      return res.status(403).json({
        success: false,
        message: user.approvalStatus === 'rejected'
          ? 'Your member registration was rejected. Please contact the gym.'
          : 'Your member account is pending admin approval.'
      });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account suspended. Contact the gym.' });
    }

    if (user.twoFactorEnabled) {
      const providedCode = String(twoFactorCode || '').trim();
      if (!providedCode) {
        const loginCode = generateOneTimeCode();
        user.twoFactorCode = hashOneTimeCode(loginCode);
        user.twoFactorExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save({ validateBeforeSave: false });

        return res.status(401).json(attachDevelopmentCode({
          success: false,
          requireTwoFactor: true,
          message: 'Two-factor authentication required'
        }, 'developmentCode', loginCode));
      }

      const isValidTwoFactorCode =
        user.twoFactorCode &&
        verifyOneTimeCode(providedCode, user.twoFactorCode) &&
        user.twoFactorExpiresAt &&
        new Date(user.twoFactorExpiresAt) > new Date();

      if (!isValidTwoFactorCode) {
        return res.status(401).json({ success: false, message: 'Invalid or expired 2FA code' });
      }

      user.twoFactorCode = '';
      user.twoFactorExpiresAt = null;
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    if (user.role === 'member') {
      await sendLoginWelcomeNotification(user);
    }
    sendToken(user, 200, res, `Welcome back, ${user.firstName}!`);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/update', protect, async (req, res) => {
  try {
    if (req.body.photo && req.body.photo.length > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Photo too large. Max 2MB.' });
    }

    const allowed = ['firstName', 'lastName', 'phone', 'address', 'gender', 'dateOfBirth', 'fitnessData', 'photo'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (req.body.trainerProfile && ['trainer', 'admin'].includes(req.user.role)) {
      const profileUpdates = {};
      ['bio', 'certifications', 'specialities', 'experience'].forEach((field) => {
        if (req.body.trainerProfile[field] !== undefined) {
          profileUpdates[`trainerProfile.${field}`] = req.body.trainerProfile[field];
        }
      });
      Object.assign(updates, profileUpdates);
    }

    if (updates.phone !== undefined) {
      updates.phone = normalizePhone(updates.phone);
      if (!updates.phone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }

      const existingPhoneUser = await User.findOne({ phone: updates.phone }).select('_id');
      if (existingPhoneUser && String(existingPhoneUser._id) !== String(req.user.id)) {
        return res.status(400).json({ success: false, message: 'Phone already registered' });
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated!', user });
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

router.put('/change-password', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!await user.matchPassword(req.body.currentPassword)) {
      return res.status(400).json({ success: false, message: 'Current password is wrong' });
    }
    if (!req.body.newPassword || req.body.newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    user.password = req.body.newPassword;
    user.resetOTP = '';
    user.resetOTPExpiry = null;
    user.twoFactorCode = '';
    user.twoFactorExpiresAt = null;
    await user.save();
    sendToken(user, 200, res, 'Password changed!');
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) return res.status(400).json({ success: false, message: 'Enter email or phone' });

    const identifier = typeof contact === 'string' ? contact.trim() : '';
    const normalizedContact = normalizeOptionalEmail(identifier);
    const normalizedPhone = normalizePhone(identifier);
    const user = await User.findOne({ $or: [{ email: normalizedContact }, { phone: normalizedPhone }] })
      .select('+resetOTP +resetOTPExpiry');
    const payload = { success: true, message: 'If that account exists, a reset code has been generated.' };

    if (!user) {
      return res.json(payload);
    }

    const otp = generateOneTimeCode();
    user.resetOTP = hashOneTimeCode(otp);
    user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetCodeNotification(user, otp);

    if (!isProduction) {
      console.log(`Reset code for ${contact}: ${otp}`);
    }

    res.json(attachDevelopmentCode(payload, 'developmentOtp', otp));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { contact, otp, newPassword } = req.body;
    if (!contact || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const identifier = typeof contact === 'string' ? contact.trim() : '';
    const normalizedContact = normalizeOptionalEmail(identifier);
    const normalizedPhone = normalizePhone(identifier);
    const user = await User.findOne({
      $or: [{ email: normalizedContact }, { phone: normalizedPhone }],
      resetOTPExpiry: { $gt: new Date() }
    }).select('+resetOTP +resetOTPExpiry');

    if (!user || !verifyOneTimeCode(otp, user.resetOTP)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    user.password = newPassword;
    user.resetOTP = '';
    user.resetOTPExpiry = null;
    user.twoFactorCode = '';
    user.twoFactorExpiresAt = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/setup', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactorCode +twoFactorExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const code = generateOneTimeCode();
    user.twoFactorCode = hashOneTimeCode(code);
    user.twoFactorExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    res.json(attachDevelopmentCode({
      success: true,
      message: '2FA setup code generated'
    }, 'developmentCode', code));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/verify', protect, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: '2FA code is required' });

    const user = await User.findById(req.user.id).select('+twoFactorCode +twoFactorExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isValidTwoFactorCode =
      user.twoFactorCode &&
      verifyOneTimeCode(code, user.twoFactorCode) &&
      user.twoFactorExpiresAt &&
      new Date(user.twoFactorExpiresAt) > new Date();

    if (!isValidTwoFactorCode) {
      return res.status(400).json({ success: false, message: 'Invalid or expired 2FA code' });
    }

    user.twoFactorEnabled = true;
    user.twoFactorCode = '';
    user.twoFactorExpiresAt = null;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/disable', protect, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

    const user = await User.findById(req.user.id).select('+password +twoFactorCode +twoFactorExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!await user.matchPassword(password)) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorCode = '';
    user.twoFactorExpiresAt = null;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/log-workout', protect, async (req, res) => {
  try {
    const { calories = 0 } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.stats) user.stats = {};
    user.stats.totalWorkouts = (user.stats.totalWorkouts || 0) + 1;
    user.stats.caloriesBurned = (user.stats.caloriesBurned || 0) + (+calories);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Workout logged!', stats: user.stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
