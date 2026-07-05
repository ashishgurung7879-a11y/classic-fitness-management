const express = require('express');
const router = express.Router();
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');

async function resolveUserSqlId(publicId) {
  if (!publicId) return null;
  const rows = await query(
    'SELECT id FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
    [String(publicId), Number(publicId) || 0]
  );
  return rows[0]?.id || null;
}

function mapUser(row, prefix) {
    if (!row[`${prefix}id`]) return null;
    return {
        _id: row[`${prefix}mongo_id`] || String(row[`${prefix}id`]),
        id: row[`${prefix}mongo_id`] || String(row[`${prefix}id`]),
        firstName: row[`${prefix}first_name`] || '',
        lastName: row[`${prefix}last_name`] || '',
        phone: row[`${prefix}phone`] || '',
        email: row[`${prefix}email`] || ''
    }
}

function mapBookingRow(row) {
    return {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        user: mapUser(row, 'user_'),
        trainer: mapUser(row, 'trainer_'),
        class: row.class || '000000000000000000000000',
        date: row.booking_at,
        type: row.type,
        status: row.status,
        notes: row.notes,
        className: row.class_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

const BOOKING_SELECT = `
    SELECT b.*,
           u.id as user_id, u.mongo_id as user_mongo_id, u.first_name as user_first_name, u.last_name as user_last_name, u.phone as user_phone, u.email as user_email,
           t.id as trainer_id, t.mongo_id as trainer_mongo_id, t.first_name as trainer_first_name, t.last_name as trainer_last_name, t.phone as trainer_phone, t.email as trainer_email
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN users t ON t.id = b.trainer_id
`;

router.post('/', protect, async (req, res) => {
  try {
    const { classId, date, time, className, type = 'class', trainerId, notes } = req.body;
    
    const userSqlId = await resolveUserSqlId(req.user.id);
    const trainerSqlId = await resolveUserSqlId(trainerId);
    
    const mongoId = generatePublicId();

    await query(
      `INSERT INTO bookings (mongo_id, user_id, trainer_id, class, booking_at, type, status, notes, class_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, NOW(), NOW())`,
      [mongoId, userSqlId, trainerSqlId || null, classId || '000000000000000000000000', new Date(date), type, notes || className || '', className || '']
    );

    const rows = await query(`${BOOKING_SELECT} WHERE b.mongo_id = ? LIMIT 1`, [mongoId]);
    
    res.status(201).json({ success: true, message: '✅ Booked successfully!', booking: mapBookingRow(rows[0]) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
        return res.status(400).json({ success: false, message: 'Already booked for this slot' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const userSqlId = await resolveUserSqlId(req.user.id);
    const rows = await query(
        `${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.booking_at DESC LIMIT 20`,
        [userSqlId]
    );
    res.json({ success: true, bookings: rows.map(mapBookingRow) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/trainer', protect, authorize('trainer','admin'), async (req, res) => {
  try {
    let whereClause = "b.status != 'cancelled'";
    const params = [];
    
    if (req.user.role === 'trainer') {
      const trainerSqlId = await resolveUserSqlId(req.user.id);
      whereClause += " AND b.trainer_id = ?";
      params.push(trainerSqlId);
    }

    const rows = await query(
        `${BOOKING_SELECT} WHERE ${whereClause} ORDER BY b.booking_at DESC LIMIT 100`,
        params
    );
    res.json({ success: true, bookings: rows.map(mapBookingRow) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await query(
        `${BOOKING_SELECT} ORDER BY b.created_at DESC LIMIT 100`
    );
    res.json({ success: true, bookings: rows.map(mapBookingRow) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const userSqlId = await resolveUserSqlId(req.user.id);
    
    const result = await query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE (mongo_id = ? OR id = ?) AND user_id = ?`,
      [String(req.params.id), Number(req.params.id) || 0, userSqlId]
    );
    
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
