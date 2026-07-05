const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { normalizeOptionalEmail, normalizePhone } = require('../utils/userFields');
const { sendLoginWelcomeNotification, sendPasswordResetCodeNotification } = require('../utils/notifications');
const { generateOneTimeCode, hashOneTimeCode, verifyOneTimeCode } = require('../utils/oneTimeCode');
const { validateProfilePhoto } = require('../utils/photos');
const { query, isDuplicateError, getDuplicateField } = require('../db/mysql');

const isProduction = process.env.NODE_ENV === 'production';

console.log('[auth.js] loaded - DEBUG_BUILD_v1 -', new Date().toISOString());

function attachDevelopmentCode(payload, fieldName, code) {
  if (isProduction || !code) return payload;
  return { ...payload, [fieldName]: code };
}

function baseUserSelect(includeSensitive = false) {
  const sensitiveFields = includeSensitive
    ? ', u.password_hash, u.reset_otp, u.reset_otp_expiry, u.two_factor_code, u.two_factor_expires_at'
    : '';

  return `
    SELECT
      u.id,
      u.mongo_id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      u.role,
      u.photo,
      u.gender,
      u.date_of_birth,
      u.address,
      u.is_active,
      u.approval_status,
      u.qr_code_id,
      u.last_login,
      u.two_factor_enabled,
      u.created_at,
      u.updated_at${sensitiveFields},
      um.plan AS membership_plan,
      um.start_date AS membership_start_date,
      um.end_date AS membership_end_date,
      um.is_active AS membership_is_active,
      um.member_id AS membership_member_id,
      um.shift AS membership_shift,
      um.due_amount AS membership_due_amount,
      um.paid_amount AS membership_paid_amount,
      tp.application_status AS trainer_application_status,
      tp.experience AS trainer_experience,
      tp.bio AS trainer_bio
    FROM users u
    LEFT JOIN user_memberships um ON um.user_id = u.id
    LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
  `;
}

function formatUserForResponse(row = {}) {
  return {
    id: row.mongo_id || String(row.id || ''),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    role: row.role || 'member',
    photo: row.photo || '',
    membership: {
      plan: row.membership_plan || 'none',
      startDate: row.membership_start_date || null,
      endDate: row.membership_end_date || null,
      isActive: !!row.membership_is_active,
      memberId: row.membership_member_id || null,
      shift: row.membership_shift || 'morning',
      dueAmount: Number(row.membership_due_amount || 0),
      paidAmount: Number(row.membership_paid_amount || 0),
    },
    qrCodeId: row.qr_code_id || null,
    trainerProfile: row.trainer_application_status
      ? {
          applicationStatus: row.trainer_application_status || 'pending',
          experience: Number(row.trainer_experience || 0),
          bio: row.trainer_bio || '',
        }
      : null,
    approvalStatus: row.approval_status || 'approved',
    twoFactorEnabled: !!row.two_factor_enabled,
    isActive: !!row.is_active,
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || 'male',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or too weak. Set a strong secret in Backend/.env');
  }

  return jwt.sign(
    { id: user.mongo_id || String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
}

async function findUserByIdentifier(identifier) {
  const normalizedEmail = normalizeOptionalEmail(identifier);
  const normalizedPhone = normalizePhone(identifier);

  const rows = await query(
    `${baseUserSelect(true)} WHERE (u.email = ? OR u.phone = ?) LIMIT 1`,
    [normalizedEmail || null, normalizedPhone || null]
  );

  return rows[0] || null;
}

async function findUserByPublicId(publicId) {
  const rows = await query(
    `${baseUserSelect(true)} WHERE (u.mongo_id = ? OR u.id = ?) LIMIT 1`,
    [publicId, Number(publicId) || 0]
  );

  return rows[0] || null;
}

const sendToken = (user, code, res, msg) => {
  const token = generateToken(user);
  const formatted = formatUserForResponse(user);

  console.log('[LOGIN DEBUG] formatted user.role being sent to client:', JSON.stringify(formatted.role));

  res.status(code).json({
    success: true,
    message: msg,
    token,
    user: formatted,
  });
};

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, dateOfBirth, gender, role, trainerApplication, photo } = req.body;
    const normalizedEmail = normalizeOptionalEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const photoCheck = validateProfilePhoto(photo);

    if (photoCheck.error) {
      return res.status(400).json({ success: false, message: photoCheck.error });
    }

    if (!firstName || !normalizedPhone || !password) {
      return res.status(400).json({ success: false, message: 'First name, phone, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const duplicateRows = await query('SELECT id, email, phone FROM users WHERE phone = ? OR email = ? LIMIT 1', [normalizedPhone, normalizedEmail || null]);
    if (duplicateRows[0]) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail && duplicateRows[0].email === normalizedEmail ? 'Email already registered' : 'Phone already registered',
      });
    }

    const selectedRole = role === 'admin' ? 'admin' : role === 'trainer' ? 'trainer' : 'member';
    const approvalStatus = selectedRole === 'member' ? 'pending' : 'approved';
    const mongoId = crypto.randomBytes(12).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const photoValue = photoCheck.value;
    const dateOfBirthValue = dateOfBirth ? String(dateOfBirth).slice(0, 10) : null;

    const insertResult = await query(
      `
        INSERT INTO users (
          mongo_id,
          first_name,
          last_name,
          email,
          phone,
          password_hash,
          role,
          photo,
          gender,
          date_of_birth,
          address,
          is_active,
          approval_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        mongoId,
        String(firstName).trim(),
        String(lastName || '').trim(),
        normalizedEmail || null,
        normalizedPhone,
        passwordHash,
        selectedRole,
        photoValue || '',
        gender || 'male',
        dateOfBirthValue,
        '',
        1,
        approvalStatus,
      ]
    );

    const userId = insertResult.insertId;

    if (selectedRole === 'trainer') {
      if (!trainerApplication) {
        return res.status(400).json({ success: false, message: 'Trainer application details are required' });
      }

      await query(
        'INSERT INTO trainer_profiles (user_id, application_status, experience, bio, applied_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, 'pending', Number(trainerApplication.experience || 0), String(trainerApplication.bio || '')]
      );

      return res.status(201).json({
        success: true,
        message: `Application submitted! Admin will review and contact you soon, ${String(firstName).trim()}!`,
      });
    }

    res.status(201).json({
      success: true,
      message: `Registration submitted! Admin approval is required before ${String(firstName).trim()} can log in.`,
    });
  } catch (err) {
    if (isDuplicateError(err)) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered',
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

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Enter phone or email and password' });
    }

    const user = await findUserByIdentifier(loginIdentifier);

    console.log('[LOGIN DEBUG] identifier:', loginIdentifier);
    console.log('[LOGIN DEBUG] user found:', !!user);
    if (user) {
      console.log('[LOGIN DEBUG] raw user.role from DB row:', JSON.stringify(user.role));
      console.log('[LOGIN DEBUG] user.id:', user.id, 'user.mongo_id:', user.mongo_id, 'user.is_active:', user.is_active);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash || '');
    console.log('[LOGIN DEBUG] password matched:', passwordMatches);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }

    if (user.role === 'member' && (user.approval_status || 'approved') !== 'approved') {
      return res.status(403).json({
        success: false,
        message: user.approval_status === 'rejected'
          ? 'Your member registration was rejected. Please contact the gym.'
          : 'Your member account is pending admin approval.',
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Account suspended. Contact the gym.' });
    }

    if (user.two_factor_enabled) {
      const providedCode = String(twoFactorCode || '').trim();

      if (!providedCode) {
        const loginCode = generateOneTimeCode();
        const hashedCode = hashOneTimeCode(loginCode);

        await query('UPDATE users SET two_factor_code = ?, two_factor_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?', [hashedCode, user.id]);

        return res.status(401).json(
          attachDevelopmentCode(
            {
              success: false,
              requireTwoFactor: true,
              message: 'Two-factor authentication required',
            },
            'developmentCode',
            loginCode
          )
        );
      }

      const isValidTwoFactorCode =
        user.two_factor_code &&
        verifyOneTimeCode(providedCode, user.two_factor_code) &&
        user.two_factor_expires_at &&
        new Date(user.two_factor_expires_at) > new Date();

      if (!isValidTwoFactorCode) {
        return res.status(401).json({ success: false, message: 'Invalid or expired 2FA code' });
      }

      await query('UPDATE users SET two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?', [user.id]);
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    if (user.role === 'member') {
      await sendLoginWelcomeNotification({
        id: user.mongo_id || String(user.id),
        firstName: user.first_name,
        phone: user.phone,
        membership: user.membership_plan ? { plan: user.membership_plan } : null,
      });
    }

    sendToken(user, 200, res, `Welcome back, ${user.first_name}!`);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await findUserByPublicId(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: formatUserForResponse(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/update', protect, async (req, res) => {
  try {
    const currentUser = await findUserByPublicId(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (req.body.photo !== undefined) {
      const photoCheck = validateProfilePhoto(req.body.photo);
      if (photoCheck.error) {
        return res.status(400).json({ success: false, message: photoCheck.error });
      }
      req.body.photo = photoCheck.value;
    }

    const allowedFields = ['firstName', 'lastName', 'phone', 'address', 'gender', 'dateOfBirth', 'photo'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'firstName') updates.first_name = String(req.body[field] || '').trim();
        if (field === 'lastName') updates.last_name = String(req.body[field] || '').trim();
        if (field === 'phone') updates.phone = normalizePhone(req.body[field]);
        if (field === 'address') updates.address = String(req.body[field] || '');
        if (field === 'gender') updates.gender = String(req.body[field] || 'male');
        if (field === 'dateOfBirth') updates.date_of_birth = req.body[field] ? String(req.body[field]).slice(0, 10) : null;
        if (field === 'photo') updates.photo = req.body[field] || '';
      }
    });

    if (updates.phone !== undefined) {
      if (!updates.phone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }

      const duplicateRows = await query('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [updates.phone, currentUser.id]);
      if (duplicateRows[0]) {
        return res.status(400).json({ success: false, message: 'Phone already registered' });
      }
    }

    if (Object.keys(updates).length > 0) {
      const assignments = Object.keys(updates).map((key) => `${key} = ?`);
      const values = Object.values(updates);
      values.push(currentUser.id);

      await query(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, values);
    }

    if (req.body.trainerProfile && ['trainer', 'admin'].includes(req.user.role)) {
      const profileUpdates = {};

      if (req.body.trainerProfile.bio !== undefined) {
        profileUpdates.bio = String(req.body.trainerProfile.bio || '');
      }

      if (req.body.trainerProfile.experience !== undefined) {
        profileUpdates.experience = Number(req.body.trainerProfile.experience || 0);
      }

      if (Object.keys(profileUpdates).length > 0) {
        const existingProfile = await query('SELECT id FROM trainer_profiles WHERE user_id = ? LIMIT 1', [currentUser.id]);

        if (existingProfile[0]) {
          const fields = Object.keys(profileUpdates).map((key) => `${key === 'bio' ? 'bio' : 'experience'} = ?`);
          const values = Object.values(profileUpdates);
          values.push(currentUser.id);
          await query(`UPDATE trainer_profiles SET ${fields.join(', ')} WHERE user_id = ?`, values);
        } else {
          await query(
            'INSERT INTO trainer_profiles (user_id, application_status, experience, bio, applied_at) VALUES (?, ?, ?, ?, NOW())',
            [currentUser.id, 'pending', Number(profileUpdates.experience || 0), String(profileUpdates.bio || '')]
          );
        }
      }
    }

    const updatedUser = await findUserByPublicId(req.user.id);
    res.json({ success: true, message: 'Profile updated!', user: formatUserForResponse(updatedUser) });
  } catch (err) {
    if (isDuplicateError(err)) {
      const duplicateField = getDuplicateField(err);
      return res.status(400).json({
        success: false,
        message: duplicateField === 'phone' ? 'Phone already registered' : 'Email already registered',
      });
    }

    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/change-password', protect, async (req, res) => {
  try {
    const currentUser = await findUserByPublicId(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const passwordMatches = await bcrypt.compare(String(req.body.currentPassword || ''), currentUser.password_hash || '');

    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: 'Current password is wrong' });
    }

    if (!req.body.newPassword || req.body.newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);

    await query(
      'UPDATE users SET password_hash = ?, reset_otp = NULL, reset_otp_expiry = NULL, two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?',
      [passwordHash, currentUser.id]
    );

    const updatedUser = await findUserByPublicId(req.user.id);
    sendToken(updatedUser, 200, res, 'Password changed!');
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { contact } = req.body;
    if (!contact) {
      return res.status(400).json({ success: false, message: 'Enter email or phone' });
    }

    const user = await findUserByIdentifier(contact);
    const payload = { success: true, message: 'If that account exists, a reset code has been generated.' };

    if (!user) {
      return res.json(payload);
    }

    const otp = generateOneTimeCode();
    const hashedOtp = hashOneTimeCode(otp);

    await query('UPDATE users SET reset_otp = ?, reset_otp_expiry = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?', [hashedOtp, user.id]);
    await sendPasswordResetCodeNotification(
      {
        id: user.mongo_id || String(user.id),
        firstName: user.first_name,
        phone: user.phone,
        resetOTPExpiry: new Date(Date.now() + 10 * 60 * 1000),
      },
      otp
    );

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

    const normalizedEmail = normalizeOptionalEmail(contact);
    const normalizedPhone = normalizePhone(contact);
    const userRows = await query(
      `${baseUserSelect(true)} WHERE (u.email = ? OR u.phone = ?) AND u.reset_otp_expiry > NOW() LIMIT 1`,
      [normalizedEmail || null, normalizedPhone || null]
    );

    const currentUser = userRows[0];

    if (!currentUser || !verifyOneTimeCode(String(otp), currentUser.reset_otp || '')) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    await query(
      'UPDATE users SET password_hash = ?, reset_otp = NULL, reset_otp_expiry = NULL, two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?',
      [passwordHash, currentUser.id]
    );

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/setup', protect, async (req, res) => {
  try {
    const currentUser = await findUserByPublicId(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const code = generateOneTimeCode();
    const hashedCode = hashOneTimeCode(code);

    await query('UPDATE users SET two_factor_code = ?, two_factor_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?', [hashedCode, currentUser.id]);

    res.json(
      attachDevelopmentCode(
        {
          success: true,
          message: '2FA setup code generated',
        },
        'developmentCode',
        code
      )
    );
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/verify', protect, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, message: '2FA code is required' });
    }

    const currentUser = await findUserByPublicId(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isValidTwoFactorCode =
      currentUser.two_factor_code &&
      verifyOneTimeCode(code, currentUser.two_factor_code) &&
      currentUser.two_factor_expires_at &&
      new Date(currentUser.two_factor_expires_at) > new Date();

    if (!isValidTwoFactorCode) {
      return res.status(400).json({ success: false, message: 'Invalid or expired 2FA code' });
    }

    await query('UPDATE users SET two_factor_enabled = 1, two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?', [currentUser.id]);
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/2fa/disable', protect, async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const currentUser = await findUserByPublicId(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const passwordMatches = await bcrypt.compare(password, currentUser.password_hash || '');
    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    await query('UPDATE users SET two_factor_enabled = 0, two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?', [currentUser.id]);
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/log-workout', protect, async (req, res) => {
  try {
    const { calories = 0 } = req.body;
    const currentUser = await findUserByPublicId(req.user.id);

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const caloriesValue = Number(calories || 0);
    const existingStats = await query('SELECT id, total_workouts, calories_burned FROM user_stats WHERE user_id = ? LIMIT 1', [currentUser.id]);

    if (existingStats[0]) {
      await query(
        'UPDATE user_stats SET total_workouts = total_workouts + 1, calories_burned = calories_burned + ?, updated_at = NOW() WHERE user_id = ?',
        [caloriesValue, currentUser.id]
      );
    } else {
      await query('INSERT INTO user_stats (user_id, total_workouts, calories_burned, created_at, updated_at) VALUES (?, 1, ?, NOW(), NOW())', [currentUser.id, caloriesValue]);
    }

    const stats = await query('SELECT total_workouts, calories_burned FROM user_stats WHERE user_id = ? LIMIT 1', [currentUser.id]);
    const currentStats = stats[0] || { total_workouts: 0, calories_burned: 0 };

    res.json({
      success: true,
      message: 'Workout logged!',
      stats: {
        totalWorkouts: Number(currentStats.total_workouts || 0),
        caloriesBurned: Number(currentStats.calories_burned || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;