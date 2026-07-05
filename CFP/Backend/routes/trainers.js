const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, transaction } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
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
  if (profile.bio !== undefined) nextProfile.bio = String(profile.bio || '').trim();
  if (profile.applicationStatus !== undefined) nextProfile.applicationStatus = profile.applicationStatus;
  return nextProfile;
}

function mapTrainerRow(row = {}) {
  const trainerId = row.mongo_id || String(row.id || '');
  const firstName = row.first_name || '';
  const lastName = row.last_name || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const applicationStatus = row.application_status || 'pending';
  const experience = Number(row.experience || 0);
  const bio = row.bio || '';

  return {
    id: trainerId,
    _id: trainerId,
    trainer_id: trainerId,
    user_id: row.id || trainerId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: row.email || '',
    phone: row.phone || '',
    photo: row.photo || '',
    experience,
    bio,
    application_status: applicationStatus,
    firstName,
    lastName,
    fullName,
    isActive: !!row.is_active,
    trainerProfile: {
      applicationStatus,
      experience,
      bio,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function baseTrainerSelect() {
  return `
    SELECT
      u.id,
      u.mongo_id,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      u.photo,
      u.role,
      u.gender,
      u.date_of_birth,
      u.address,
      u.is_active,
      u.approval_status,
      u.created_at,
      u.updated_at,
      tp.application_status,
      tp.experience,
      tp.bio
    FROM users u
    LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
    WHERE u.role = 'trainer'
  `;
}

async function findTrainerByPublicId(id) {
  const rows = await query(
    `${baseTrainerSelect()} AND (u.mongo_id = ? OR u.id = ?) LIMIT 1`,
    [id, Number(id) || 0]
  );
  return rows[0] ? mapTrainerRow(rows[0]) : null;
}

// ── Public: only approved trainers ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `${baseTrainerSelect()} AND u.is_active = 1 AND tp.application_status = 'approved' ORDER BY u.created_at DESC`
    );
    console.info('[GET /api/trainers] returning', rows.length, 'approved/active trainers');
    res.json({ success: true, trainers: rows.map(mapTrainerRow) });
  } catch (err) {
    console.error('[GET /api/trainers] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: all trainer applications ─────────────────────────────────────────
router.get('/applications', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `${baseTrainerSelect()}`;
    const params = [];

    if (status === 'pending') {
      sql += ` AND (tp.application_status = 'pending' OR tp.application_status IS NULL)`;
    } else if (status && status !== 'all') {
      sql += ` AND tp.application_status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY u.created_at DESC`;
    const rows = await query(sql, params);
    console.info('[GET /api/trainers/applications] returning', rows.length, 'trainer applications');
    res.json({ success: true, trainers: rows.map(mapTrainerRow) });
  } catch (err) {
    console.error('[GET /api/trainers/applications] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: approve trainer ──────────────────────────────────────────────────
router.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    await transaction(async (conn) => {
      await conn.execute(
        `UPDATE users SET role = 'trainer', is_active = 1 WHERE (mongo_id = ? OR id = ?) AND role = 'trainer'`,
        [req.params.id, Number(req.params.id) || 0]
      );
      await conn.execute(
        `INSERT INTO trainer_profiles (user_id, application_status, experience, bio)
         SELECT id, 'approved', COALESCE((SELECT experience FROM trainer_profiles WHERE user_id = users.id LIMIT 1), 0),
                COALESCE((SELECT bio FROM trainer_profiles WHERE user_id = users.id LIMIT 1), '')
         FROM users WHERE (mongo_id = ? OR id = ?) AND role = 'trainer'
         ON DUPLICATE KEY UPDATE application_status = 'approved'`,
        [req.params.id, Number(req.params.id) || 0]
      );
    });

    const trainer = await findTrainerByPublicId(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    console.info('[PUT /api/trainers/:id/approve] trainer approved', {
      id: trainer._id,
      name: trainer.fullName,
    });
    res.json({ success: true, message: `✅ ${trainer.firstName} approved! Now visible on website.`, trainer });
  } catch (err) {
    console.error('[PUT /api/trainers/:id/approve] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: reject trainer ───────────────────────────────────────────────────
router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    await query(
      `UPDATE trainer_profiles SET application_status = 'rejected'
       WHERE user_id = (SELECT id FROM users WHERE (mongo_id = ? OR id = ?) AND role = 'trainer' LIMIT 1)`,
      [req.params.id, Number(req.params.id) || 0]
    );

    const trainer = await findTrainerByPublicId(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    console.info('[PUT /api/trainers/:id/reject] trainer rejected', {
      id: trainer._id,
      name: trainer.fullName,
    });
    res.json({ success: true, message: 'Trainer application rejected.', trainer });
  } catch (err) {
    console.error('[PUT /api/trainers/:id/reject] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get trainer schedule ────────────────────────────────────────────────────
router.get('/:id/schedule', async (req, res) => {
  try {
    const rows = await query(
      `SELECT ts.id, ts.mongo_id, ts.day_of_week, ts.start_time, ts.end_time,
              ts.is_available, ts.booked_slots, ts.max_slots, ts.created_at
       FROM trainer_schedules ts
       JOIN users u ON u.id = ts.trainer_id
       WHERE (u.mongo_id = ? OR u.id = ?) AND ts.is_available = 1
       ORDER BY ts.day_of_week ASC, ts.start_time ASC`,
      [req.params.id, Number(req.params.id) || 0]
    );

    const schedule = rows.map((row) => ({
      id: row.mongo_id || String(row.id),
      _id: row.mongo_id || String(row.id),
      dayOfWeek: row.day_of_week,
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      isAvailable: !!row.is_available,
      bookedSlots: Number(row.booked_slots || 0),
      maxSlots: Number(row.max_slots || 5),
      maxBookings: Number(row.max_slots || 5),
    }));

    res.json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Add trainer schedule ────────────────────────────────────────────────────
router.post('/:id/schedule', protect, authorize('trainer', 'admin'), async (req, res) => {
  try {
    if (req.user.role === 'trainer' && String(req.user.id) !== String(req.params.id)) {
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

    // Resolve trainer's internal SQL id
    const trainerRows = await query(
      `SELECT id FROM users WHERE (mongo_id = ? OR id = ?) AND role = 'trainer' LIMIT 1`,
      [req.params.id, Number(req.params.id) || 0]
    );
    if (!trainerRows[0]) {
      return res.status(404).json({ success: false, message: 'Trainer not found' });
    }

    const mongoId = generatePublicId();
    const finalMaxSlots = Number.isFinite(maxSlots) ? Math.max(1, maxSlots) : 1;

    await query(
      `INSERT INTO trainer_schedules (mongo_id, trainer_id, day_of_week, start_time, end_time, is_available, booked_slots, max_slots)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [mongoId, trainerRows[0].id, dayOfWeek, req.body.startTime, req.body.endTime, req.body?.isAvailable !== false ? 1 : 0, finalMaxSlots]
    );

    const newSlotRows = await query(
      `SELECT * FROM trainer_schedules WHERE mongo_id = ? LIMIT 1`,
      [mongoId]
    );
    const slot = newSlotRows[0];

    console.info('[POST /api/trainers/:id/schedule] schedule slot added');
    res.status(201).json({
      success: true,
      slot: {
        id: slot.mongo_id || String(slot.id),
        _id: slot.mongo_id || String(slot.id),
        dayOfWeek: slot.day_of_week,
        startTime: slot.start_time || '',
        endTime: slot.end_time || '',
        isAvailable: !!slot.is_available,
        bookedSlots: Number(slot.booked_slots || 0),
        maxSlots: Number(slot.max_slots || 1),
        maxBookings: Number(slot.max_slots || 1),
      }
    });
  } catch (err) {
    console.error('[POST /api/trainers/:id/schedule] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Book a PT session with trainer ──────────────────────────────────────────
router.post('/:id/book', protect, async (req, res) => {
  try {
    const { date, slotId, notes } = req.body;

    // Verify trainer exists
    const trainerRows = await query(
      `SELECT id, first_name, mongo_id FROM users WHERE (mongo_id = ? OR id = ?) AND role = 'trainer' LIMIT 1`,
      [req.params.id, Number(req.params.id) || 0]
    );
    if (!trainerRows[0]) {
      return res.status(404).json({ success: false, message: 'Trainer not found' });
    }
    const trainerRow = trainerRows[0];

    // Resolve booker's internal id
    const bookerRows = await query(
      `SELECT id FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1`,
      [req.user.id, Number(req.user.id) || 0]
    );
    if (!bookerRows[0]) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const bookingMongoId = generatePublicId();
    await query(
      `INSERT INTO bookings (mongo_id, user_id, trainer_id, booking_at, type, status, notes)
       VALUES (?, ?, ?, ?, 'pt_session', 'confirmed', ?)`,
      [bookingMongoId, bookerRows[0].id, trainerRow.id, new Date(date), notes || '']
    );

    // Update slot availability
    if (slotId) {
      await query(
        `UPDATE trainer_schedules SET booked_slots = booked_slots + 1
         WHERE (mongo_id = ? OR id = ?)`,
        [slotId, Number(slotId) || 0]
      );
    }

    const bookingRows = await query(
      `SELECT * FROM bookings WHERE mongo_id = ? LIMIT 1`,
      [bookingMongoId]
    );
    const booking = bookingRows[0];
    const bookingId = booking.mongo_id || String(booking.id);

    console.info('[POST /api/trainers/:id/book] booking created', {
      trainerId: req.params.id,
      bookingId,
    });
    res.status(201).json({
      success: true,
      message: `✅ PT session booked with ${trainerRow.first_name}!`,
      booking: {
        id: bookingId,
        _id: bookingId,
        trainer: trainerRow.mongo_id || String(trainerRow.id),
        date: booking.booking_at,
        type: 'pt_session',
        status: 'confirmed',
        notes: booking.notes || '',
      }
    });
  } catch (err) {
    console.error('[POST /api/trainers/:id/book] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: Add trainer ──────────────────────────────────────────────────────
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

    // Check duplicate phone/email
    const duplicateRows = await query(
      'SELECT id, email, phone FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?) LIMIT 1',
      [normalizedPhone, normalizedEmail || '__NEVER_MATCH__']
    );
    if (duplicateRows[0]) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail ? 'Email or phone already registered' : 'Phone already registered'
      });
    }

    const mongoId = generatePublicId();
    const passwordHash = await bcrypt.hash(password, 10);
    const profile = normalizeTrainerProfileInput(req.body?.trainerProfile || {}, {
      applicationStatus: req.body?.trainerProfile?.applicationStatus || 'approved'
    });
    const isActive = req.body?.isActive !== false ? 1 : 0;

    const insertedId = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO users (mongo_id, first_name, last_name, email, phone, password_hash, role, photo, gender,
                            date_of_birth, address, is_active, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'trainer', ?, ?, ?, ?, ?, 'approved', NOW(), NOW())`,
        [
          mongoId,
          firstName,
          String(req.body?.lastName || '').trim(),
          normalizedEmail || null,
          normalizedPhone,
          passwordHash,
          photoCheck.value || '',
          req.body?.gender || 'male',
          parseOptionalDate(req.body?.dateOfBirth) || null,
          String(req.body?.address || '').trim(),
          isActive,
        ]
      );

      await conn.execute(
        `INSERT INTO trainer_profiles (user_id, application_status, experience, bio)
         VALUES (?, ?, ?, ?)`,
        [result.insertId, profile.applicationStatus || 'approved', Number(profile.experience || 0), profile.bio || '']
      );

      return result.insertId;
    });

    const trainer = await findTrainerByPublicId(mongoId);

    console.info('[POST /api/trainers] created trainer', {
      id: trainer._id,
      name: trainer.fullName,
      applicationStatus: trainer.trainerProfile?.applicationStatus,
      isActive: trainer.isActive,
    });
    res.status(201).json({ success: true, trainer });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.code === 11000) {
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

// ── Admin: Update trainer ───────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const existing = await findTrainerByPublicId(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Trainer not found' });
    }

    const userId = existing.user_id; // internal SQL id

    if (req.body.photo !== undefined) {
      const photoCheck = validateProfilePhoto(req.body.photo);
      if (photoCheck.error) {
        return res.status(400).json({ success: false, message: photoCheck.error });
      }
      req.body.photo = photoCheck.value;
    }

    const userUpdates = {};
    const allowedTopLevelFields = ['firstName', 'lastName', 'photo', 'gender', 'address', 'isActive'];
    for (const field of allowedTopLevelFields) {
      if (req.body[field] !== undefined) {
        if (field === 'firstName') userUpdates.first_name = String(req.body[field] || '').trim();
        else if (field === 'lastName') userUpdates.last_name = String(req.body[field] || '').trim();
        else if (field === 'photo') userUpdates.photo = req.body[field] || '';
        else if (field === 'gender') userUpdates.gender = req.body[field];
        else if (field === 'address') userUpdates.address = String(req.body[field] || '').trim();
        else if (field === 'isActive') userUpdates.is_active = req.body[field] !== false ? 1 : 0;
      }
    }

    if (req.body.dateOfBirth !== undefined) {
      const parsed = parseOptionalDate(req.body.dateOfBirth);
      userUpdates.date_of_birth = parsed || null;
    }

    if (req.body.phone !== undefined) {
      const normalizedPhone = normalizePhone(req.body.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }
      const existingPhone = await query('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [normalizedPhone, userId]);
      if (existingPhone[0]) {
        return res.status(400).json({ success: false, message: 'Phone already registered' });
      }
      userUpdates.phone = normalizedPhone;
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(req.body.email);
      if (normalizedEmail) {
        const existingEmail = await query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [normalizedEmail, userId]);
        if (existingEmail[0]) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        userUpdates.email = normalizedEmail;
      } else {
        userUpdates.email = null;
      }
    }

    if (req.body.password !== undefined) {
      const password = String(req.body.password || '');
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        userUpdates.password_hash = await bcrypt.hash(password, 10);
        userUpdates.two_factor_code = null;
        userUpdates.two_factor_expires_at = null;
      }
    }

    await transaction(async (conn) => {
      if (Object.keys(userUpdates).length) {
        const assignments = Object.keys(userUpdates).map((key) => `${key} = ?`).join(', ');
        await conn.execute(
          `UPDATE users SET ${assignments}, updated_at = NOW() WHERE id = ?`,
          [...Object.values(userUpdates), userId]
        );
      }

      if (req.body.trainerProfile && typeof req.body.trainerProfile === 'object') {
        const profile = normalizeTrainerProfileInput(req.body.trainerProfile, existing.trainerProfile || {});
        await conn.execute(
          `INSERT INTO trainer_profiles (user_id, application_status, experience, bio)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE application_status=VALUES(application_status), experience=VALUES(experience), bio=VALUES(bio)`,
          [userId, profile.applicationStatus || 'approved', Number(profile.experience || 0), profile.bio || '']
        );
      }
    });

    const updatedTrainer = await findTrainerByPublicId(req.params.id);

    console.info('[PUT /api/trainers/:id] updated trainer', {
      id: updatedTrainer._id,
      name: updatedTrainer.fullName,
    });
    res.json({ success: true, trainer: updatedTrainer });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.code === 11000) {
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

// ── Admin: Delete trainer ───────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const trainer = await findTrainerByPublicId(req.params.id);
    if (!trainer) return res.status(404).json({ success: false, message: 'Trainer not found' });

    await query(
      `DELETE FROM users WHERE (mongo_id = ? OR id = ?) AND role = 'trainer'`,
      [req.params.id, Number(req.params.id) || 0]
    );

    console.info('[DELETE /api/trainers/:id] deleted trainer', req.params.id);
    res.json({ success: true, message: '✅ Trainer permanently removed.' });
  } catch (err) {
    console.error('[DELETE /api/trainers/:id] error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
