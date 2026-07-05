// routes/classes.js
const express = require('express');
const router = express.Router();
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
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
      dayOfWeek: Number.isInteger(Number(body.schedule.dayOfWeek)) ? Number(body.schedule.dayOfWeek) : null,
      startTime: String(body.schedule.startTime || '').trim(),
      endTime: String(body.schedule.endTime || '').trim(),
      duration: Number.isFinite(duration) ? Math.max(1, duration) : 60
    };
  }

  return payload;
}

function mapClassRow(row) {
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    name: row.name || '',
    type: row.type || 'general',
    description: row.description || '',
    capacity: Number(row.capacity || 20),
    isActive: !!row.is_active,
    trainer: row.trainer_mongo_id ? {
      _id: row.trainer_mongo_id || String(row.trainer_sql_id),
      id: row.trainer_mongo_id || String(row.trainer_sql_id),
      firstName: row.trainer_first_name || '',
      lastName: row.trainer_last_name || '',
      photo: row.trainer_photo || '',
    } : null,
    schedule: {
      dayOfWeek: row.day_of_week,
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      duration: Number(row.duration_minutes || 60),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CLASS_SELECT = `
  SELECT c.*,
         t.id AS trainer_sql_id, t.mongo_id AS trainer_mongo_id,
         t.first_name AS trainer_first_name, t.last_name AS trainer_last_name, t.photo AS trainer_photo
  FROM classes c
  LEFT JOIN users t ON t.id = c.trainer_id
`;

async function resolveTrainerSqlId(publicId) {
  if (!publicId) return null;
  const rows = await query(
    'SELECT id FROM users WHERE (mongo_id = ? OR id = ?) AND role = \'trainer\' LIMIT 1',
    [String(publicId), Number(publicId) || 0]
  );
  return rows[0]?.id || null;
}

router.get('/', async (req, res) => {
  const { type, day } = req.query;
  const whereClauses = ['c.is_active = 1'];
  const params = [];

  if (type) {
    whereClauses.push('c.type = ?');
    params.push(type);
  }
  if (day !== undefined) {
    whereClauses.push('c.day_of_week = ?');
    params.push(+day);
  }

  const rows = await query(
    `${CLASS_SELECT} WHERE ${whereClauses.join(' AND ')} ORDER BY c.day_of_week ASC, c.start_time ASC`,
    params
  );
  res.json({ success: true, count: rows.length, classes: rows.map(mapClassRow) });
});

router.post('/', protect, authorize('admin'), async (req, res) => {
  const payload = buildClassPayload(req.body);
  if (!payload.name) {
    return res.status(400).json({ success: false, message: 'Class name is required' });
  }

  const trainerSqlId = await resolveTrainerSqlId(payload.trainer);
  const mongoId = generatePublicId();

  await query(
    `INSERT INTO classes (mongo_id, name, type, description, trainer_id, capacity, is_active,
       day_of_week, start_time,end_time, duration_minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      mongoId, payload.name, payload.type || 'general', payload.description || '',
      trainerSqlId || null, payload.capacity || 20, payload.isActive !== false ? 1 : 0,
      payload.schedule?.dayOfWeek ?? null, payload.schedule?.startTime || '',
      payload.schedule?.endTime || '', payload.schedule?.duration || 60
    ]
  );

  const rows = await query(`${CLASS_SELECT} WHERE c.mongo_id = ? LIMIT 1`, [mongoId]);
  res.status(201).json({ success: true, class: mapClassRow(rows[0]) });
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  const payload = buildClassPayload(req.body);

  // Check exists
  const existingRows = await query(
    'SELECT id FROM classes WHERE (mongo_id = ? OR id = ?) LIMIT 1',
    [req.params.id, Number(req.params.id) || 0]
  );
  if (!existingRows[0]) {
    return res.status(404).json({ success: false, message: 'Class not found' });
  }
  const classId = existingRows[0].id;
  const trainerSqlId = await resolveTrainerSqlId(payload.trainer);

  const updateFields = [];
  const updateParams = [];

  if (payload.name !== undefined) { updateFields.push('name = ?'); updateParams.push(payload.name); }
  if (payload.type !== undefined) { updateFields.push('type = ?'); updateParams.push(payload.type); }
  if (payload.description !== undefined) { updateFields.push('description = ?'); updateParams.push(payload.description); }
  if (payload.trainer !== undefined) { updateFields.push('trainer_id = ?'); updateParams.push(trainerSqlId); }
  if (payload.capacity !== undefined) { updateFields.push('capacity = ?'); updateParams.push(payload.capacity); }
  if (payload.isActive !== undefined) { updateFields.push('is_active = ?'); updateParams.push(payload.isActive ? 1 : 0); }
  if (payload.schedule) {
    if (payload.schedule.dayOfWeek !== undefined) { updateFields.push('day_of_week = ?'); updateParams.push(payload.schedule.dayOfWeek); }
    if (payload.schedule.startTime !== undefined) { updateFields.push('start_time = ?'); updateParams.push(payload.schedule.startTime); }
    if (payload.schedule.endTime !== undefined) { updateFields.push('end_time = ?'); updateParams.push(payload.schedule.endTime); }
    if (payload.schedule.duration !== undefined) { updateFields.push('duration_minutes = ?'); updateParams.push(payload.schedule.duration); }
  }

  if (updateFields.length > 0) {
    updateFields.push('updated_at = NOW()');
    updateParams.push(classId);
    await query(`UPDATE classes SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
  }

  const rows = await query(`${CLASS_SELECT} WHERE c.id = ? LIMIT 1`, [classId]);
  res.json({ success: true, class: mapClassRow(rows[0]) });
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  await query(
    'DELETE FROM classes WHERE (mongo_id = ? OR id = ?)',
    [req.params.id, Number(req.params.id) || 0]
  );
  res.json({ success: true, message: 'Class deleted' });
});

module.exports = router;
