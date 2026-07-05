const express = require('express');
const router = express.Router();
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');
const { isValidPublicId } = require('../db/helpers');

const measurementFields = ['height', 'weight', 'forearms', 'biceps', 'chest', 'abdomen', 'thighs', 'calves'];

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

async function findUserByPublicId(publicId, role = null) {
  const roleClause = role ? 'AND u.role = ?' : '';
  const params = [publicId, Number(publicId) || 0];
  if (role) params.push(role);
  const rows = await query(
    `SELECT u.id, u.mongo_id, u.first_name, u.last_name, u.phone, u.photo, u.role, um.plan AS membership_plan, um.start_date AS membership_start_date, um.end_date AS membership_end_date, um.is_active AS membership_is_active 
     FROM users u 
     LEFT JOIN user_memberships um ON um.user_id = u.id
     WHERE (u.mongo_id = ? OR u.id = ?) ${roleClause} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function mapUserPopulate(row) {
    if (!row) return null;
    return {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        photo: row.photo || '',
        role: row.role || '',
        membership: row.membership_plan ? {
            plan: row.membership_plan,
            startDate: row.membership_start_date,
            endDate: row.membership_end_date,
            isActive: !!row.membership_is_active
        } : undefined
    }
}

function mapMeasurementRow(row) {
    return {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        member: mapUserPopulate({
            mongo_id: row.member_mongo_id,
            id: row.member_id,
            first_name: row.member_first_name,
            last_name: row.member_last_name,
            phone: row.member_phone,
            photo: row.member_photo,
            role: 'member',
            membership_plan: row.member_plan,
            membership_start_date: row.member_start_date,
            membership_end_date: row.member_end_date,
            membership_is_active: row.member_is_active
        }),
        trainer: row.trainer_id ? mapUserPopulate({
            mongo_id: row.trainer_mongo_id,
            id: row.trainer_id,
            first_name: row.trainer_first_name,
            last_name: row.trainer_last_name,
            phone: row.trainer_phone,
            photo: row.trainer_photo,
            role: 'trainer'
        }) : null,
        recordedBy: row.recorded_by_id ? {
            _id: row.recorded_by_mongo_id || String(row.recorded_by_id),
            id: row.recorded_by_mongo_id || String(row.recorded_by_id),
            firstName: row.recorded_by_first_name || '',
            lastName: row.recorded_by_last_name || '',
            role: row.recorded_by_role || ''
        } : null,
        height: row.height,
        weight: row.weight,
        forearms: row.forearms,
        biceps: row.biceps,
        chest: row.chest,
        abdomen: row.abdomen,
        thighs: row.thighs,
        calves: row.calves,
        measuredAt: row.measured_at,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
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

  if (body.notes !== undefined) payload.notes = String(body.notes || '').trim();

  return { payload };
}

async function assertMemberAccess(req, memberId) {
  if (!memberId) return false;
  if (!isValidPublicId(memberId)) return false;
  if (req.user.role === 'member') return String(req.user.id) === String(memberId);
  return ['admin', 'trainer'].includes(req.user.role);
}

const MEASUREMENT_SELECT = `
    SELECT m.*,
           mem.mongo_id as member_mongo_id, mem.first_name as member_first_name, mem.last_name as member_last_name, mem.phone as member_phone, mem.photo as member_photo,
           um.plan as member_plan, um.start_date as member_start_date, um.end_date as member_end_date, um.is_active as member_is_active,
           tr.mongo_id as trainer_mongo_id, tr.first_name as trainer_first_name, tr.last_name as trainer_last_name, tr.phone as trainer_phone, tr.photo as trainer_photo,
           rb.mongo_id as recorded_by_mongo_id, rb.first_name as recorded_by_first_name, rb.last_name as recorded_by_last_name, rb.role as recorded_by_role
    FROM measurements m
    LEFT JOIN users mem ON mem.id = m.member_id
    LEFT JOIN user_memberships um ON um.user_id = mem.id
    LEFT JOIN users tr ON tr.id = m.trainer_id
    LEFT JOIN users rb ON rb.id = m.recorded_by_id
`;

router.get('/', protect, async (req, res) => {
  try {
    const memberId = req.user.role === 'member' ? req.user.id : req.query.memberId;
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId is required' });
    }

    if (!isValidPublicId(memberId)) {
      return res.status(400).json({ success: false, message: 'memberId is invalid' });
    }

    if (!await assertMemberAccess(req, memberId)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view these measurements' });
    }

    const memberRow = await findUserByPublicId(memberId);
    if (!memberRow) {
      return res.json({ success: true, measurements: [] });
    }

    const rows = await query(
      `${MEASUREMENT_SELECT} WHERE m.member_id = ? ORDER BY m.measured_at ASC, m.created_at ASC`,
      [memberRow.id]
    );

    res.json({ success: true, measurements: rows.map(mapMeasurementRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!req.body.member) {
      return res.status(400).json({ success: false, message: 'Member is required' });
    }

    if (!isValidPublicId(req.body.member)) {
      return res.status(400).json({ success: false, message: 'Member is invalid' });
    }

    if (parseOptionalNumber(req.body.height) === undefined || parseOptionalNumber(req.body.weight) === undefined) {
      return res.status(400).json({ success: false, message: 'Height and weight are required' });
    }

    const member = await findUserByPublicId(req.body.member, 'member');
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    let trainer = null;
    if (req.body.trainer) {
      if (!isValidPublicId(req.body.trainer)) {
        return res.status(400).json({ success: false, message: 'Trainer is invalid' });
      }

      trainer = await findUserByPublicId(req.body.trainer, 'trainer');
      if (!trainer) {
        return res.status(404).json({ success: false, message: 'Trainer not found' });
      }
    }
    
    const recordedBy = await findUserByPublicId(req.user.id);

    const { payload, error } = buildMeasurementPayload(req.body, req.user);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const mongoId = generatePublicId();
    
    const measuredAt = payload.measuredAt || new Date();
    
    const insertValues = [
        mongoId, member.id, trainer?.id || null, recordedBy?.id || null, 
        payload.height, payload.weight, payload.forearms || null, payload.biceps || null, 
        payload.chest || null, payload.abdomen || null, payload.thighs || null, payload.calves || null, 
        measuredAt, payload.notes || ''
    ];

    await query(
      `INSERT INTO measurements (mongo_id, member_id, trainer_id, recorded_by_id, height, weight, forearms, biceps, chest, abdomen, thighs, calves, measured_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      insertValues
    );

    const rows = await query(`${MEASUREMENT_SELECT} WHERE m.mongo_id = ? LIMIT 1`, [mongoId]);

    res.status(201).json({ success: true, message: 'Measurement saved.', measurement: mapMeasurementRow(rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!isValidPublicId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Measurement is invalid' });
    }

    const existingRows = await query(`SELECT id FROM measurements WHERE (mongo_id = ? OR id = ?) LIMIT 1`, [req.params.id, Number(req.params.id) || 0]);
    if (!existingRows[0]) {
      return res.status(404).json({ success: false, message: 'Measurement not found' });
    }
    const measurementId = existingRows[0].id;

    let trainerIdToSet = undefined;
    if (req.body.trainer) {
      if (!isValidPublicId(req.body.trainer)) {
        return res.status(400).json({ success: false, message: 'Trainer is invalid' });
      }

      const trainer = await findUserByPublicId(req.body.trainer, 'trainer');
      if (!trainer) {
        return res.status(404).json({ success: false, message: 'Trainer not found' });
      }
      trainerIdToSet = trainer.id;
    }

    const { payload, error } = buildMeasurementPayload(req.body, req.user);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }
    
    let updateFields = [];
    let updateParams = [];
    
    for (const field of measurementFields) {
        if (payload[field] !== undefined) {
            updateFields.push(`${field} = ?`);
            updateParams.push(payload[field]);
        }
    }
    
    if (payload.measuredAt !== undefined) {
        updateFields.push('measured_at = ?');
        updateParams.push(payload.measuredAt);
    }
    if (payload.notes !== undefined) {
        updateFields.push('notes = ?');
        updateParams.push(payload.notes);
    }
    if (trainerIdToSet !== undefined) {
        updateFields.push('trainer_id = ?');
        updateParams.push(trainerIdToSet);
    }
    
    if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        updateParams.push(measurementId);
        await query(`UPDATE measurements SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);
    }

    const rows = await query(`${MEASUREMENT_SELECT} WHERE m.id = ? LIMIT 1`, [measurementId]);

    res.json({ success: true, message: 'Measurement updated.', measurement: mapMeasurementRow(rows[0]) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, authorize('admin', 'trainer'), async (req, res) => {
  try {
    if (!isValidPublicId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Measurement is invalid' });
    }

    const result = await query(
      `DELETE FROM measurements WHERE (mongo_id = ? OR id = ?)`,
      [req.params.id, Number(req.params.id) || 0]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Measurement not found' });
    }

    res.json({ success: true, message: 'Measurement deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
