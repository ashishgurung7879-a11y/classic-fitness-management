const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { query, transaction } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
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

function baseUserSelect() {
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
      um.plan AS membership_plan,
      um.start_date AS membership_start_date,
      um.end_date AS membership_end_date,
      um.is_active AS membership_is_active,
      um.member_id AS membership_member_id,
      um.shift AS membership_shift,
      um.due_amount AS membership_due_amount,
      um.paid_amount AS membership_paid_amount
    FROM users u
    LEFT JOIN user_memberships um ON um.user_id = u.id
  `;
}

function mapMemberRow(row = {}) {
  return {
    _id: row.mongo_id || String(row.id || ''),
    id: row.mongo_id || String(row.id || ''),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    photo: row.photo || '',
    role: row.role || 'member',
    gender: row.gender || 'male',
    dateOfBirth: row.date_of_birth || null,
    address: row.address || '',
    isActive: !!row.is_active,
    approvalStatus: row.approval_status || 'approved',
    membership: {
      plan: row.membership_plan || 'starter',
      startDate: row.membership_start_date || null,
      endDate: row.membership_end_date || null,
      isActive: !!row.membership_is_active,
      memberId: row.membership_member_id || null,
      shift: row.membership_shift || 'morning',
      dueAmount: Number(row.membership_due_amount || 0),
      paidAmount: Number(row.membership_paid_amount || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findMemberByPublicId(id) {
  const rows = await query(`${baseUserSelect()} WHERE (u.mongo_id = ? OR u.id = ?) AND u.role = 'member' LIMIT 1`, [id, Number(id) || 0]);
  return rows[0] ? mapMemberRow(rows[0]) : null;
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

    const duplicateRows = await query('SELECT id, email, phone FROM users WHERE phone = ? OR email = ? LIMIT 1', [normalizedPhone, normalizedEmail || null]);
    if (duplicateRows[0]) {
      return res.status(400).json({
        success: false,
        message: normalizedEmail && duplicateRows[0].email === normalizedEmail ? 'Email already registered' : 'Phone already registered'
      });
    }

    const membershipInput = {
      ...buildMembershipInput({ plan, startDate, endDate, shift, dueAmount, paidAmount }),
      plan: plan || 'starter',
      isActive: true,
      shift: shift || 'morning',
      memberId: `CFP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    };

    const mongoId = generatePublicId();
    const passwordHash = await bcrypt.hash(memberPassword, 10);

    const created = await transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO users (mongo_id, first_name, last_name, email, phone, password_hash, role, photo, gender, date_of_birth, address, is_active, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'member', ?, 'male', ?, '', 1, 'approved', NOW(), NOW())`,
        [mongoId, String(firstName).trim(), lastName || '', normalizedEmail || null, normalizedPhone, passwordHash, photoInput || '', null]
      );

      await conn.execute(
        `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, membershipInput.plan || 'starter', membershipInput.startDate || null, membershipInput.endDate || null, !!membershipInput.isActive, membershipInput.memberId || null, membershipInput.shift || 'morning', Number(membershipInput.dueAmount || 0), Number(membershipInput.paidAmount || 0)]
      );

      return result.insertId;
    });

    const newMember = await findMemberByPublicId(mongoId);
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
    const whereClauses = ["u.role = 'member'", "u.approval_status = 'approved'"];
    const params = [];

    if (search) {
      whereClauses.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`);
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (plan) {
      whereClauses.push('um.plan = ?');
      params.push(plan);
    }

    const offset = (Number(page) - 1) * Number(limit);
    const rows = await query(`${baseUserSelect()} WHERE ${whereClauses.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit) || 50, offset]);
    const totalRows = await query(`SELECT COUNT(*) AS total FROM users u LEFT JOIN user_memberships um ON um.user_id = u.id WHERE ${whereClauses.join(' AND ')}`, params);

    res.json({ success: true, total: Number(totalRows[0]?.total || 0), members: rows.map(mapMemberRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/applications', protect, authorize('admin'), async (req, res) => {
  try {
    const rows = await query(`${baseUserSelect()} WHERE u.role = 'member' AND u.approval_status = 'pending' ORDER BY u.created_at DESC`);
    res.json({ success: true, members: rows.map(mapMemberRow) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/me', protect, async (req, res) => {
  try {
    const member = await findMemberByPublicId(req.user.id);
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
    const member = await findMemberByPublicId(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    await query("UPDATE users SET approval_status = 'approved', is_active = 1 WHERE mongo_id = ? OR id = ?", [req.params.id, Number(req.params.id) || 0]);
    const approvedMember = await findMemberByPublicId(req.params.id);
    await sendMemberApprovedNotification(approvedMember, req.user.id);
    res.json({ success: true, message: 'Member approved', member: approvedMember });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await findMemberByPublicId(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    await query("UPDATE users SET approval_status = 'rejected', is_active = 0 WHERE mongo_id = ? OR id = ?", [req.params.id, Number(req.params.id) || 0]);
    const rejectedMember = await findMemberByPublicId(req.params.id);
    res.json({ success: true, message: 'Member rejected', member: rejectedMember });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const m = await findMemberByPublicId(req.params.id);
    if (!m) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, member: m });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await findMemberByPublicId(req.params.id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const userId = member.id;
    const updates = {};
    const membershipUpdate = {};

    const allowedTopLevelFields = ['firstName', 'lastName', 'photo', 'gender', 'dateOfBirth', 'address', 'isActive', 'approvalStatus'];
    for (const field of allowedTopLevelFields) {
      if (req.body[field] !== undefined) {
        if (field === 'dateOfBirth') {
          updates.date_of_birth = parseOptionalDate(req.body[field]) || null;
        } else if (field === 'photo') {
          const photoInput = validatePhotoInput(req.body[field]);
          if (photoInput === null) {
            return res.status(400).json({ success: false, message: 'Photo too large. Max 2MB.' });
          }
          updates.photo = photoInput;
        } else if (field === 'firstName') {
          updates.first_name = String(req.body[field] || '').trim();
        } else if (field === 'lastName') {
          updates.last_name = String(req.body[field] || '').trim();
        } else if (field === 'isActive') {
          updates.is_active = req.body[field] !== false;
        } else if (field === 'approvalStatus') {
          updates.approval_status = req.body[field] || 'approved';
        } else {
          updates.gender = req.body[field];
        }
      }
    }

    if (req.body.phone !== undefined) {
      const normalizedPhone = normalizePhone(req.body.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'Phone is required' });
      }
      const existingPhoneUser = await query('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [normalizedPhone, member.id]);
      if (existingPhoneUser[0]) {
        return res.status(400).json({ success: false, message: 'Phone already registered' });
      }
      updates.phone = normalizedPhone;
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(req.body.email);
      if (normalizedEmail) {
        const existingEmailUser = await query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [normalizedEmail, member.id]);
        if (existingEmailUser[0]) {
          return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        updates.email = normalizedEmail;
      } else {
        updates.email = null;
      }
    }

    if (req.body.password !== undefined) {
      const memberPassword = normalizePassword(req.body.password);
      if (memberPassword) {
        if (memberPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        updates.password_hash = await bcrypt.hash(memberPassword, 10);
      }
    }

    const membershipFields = ['plan', 'startDate', 'endDate', 'shift', 'dueAmount', 'paidAmount', 'isActive', 'memberId'];
    const hasMembershipUpdate =
      membershipFields.some((field) => req.body[field] !== undefined) ||
      (req.body.membership && typeof req.body.membership === 'object' &&
        membershipFields.some((field) => req.body.membership[field] !== undefined));

    if (hasMembershipUpdate) {
      const membership = buildMembershipInput(req.body, member.membership || {});
      membershipUpdate.plan = membership.plan;
      membershipUpdate.start_date = membership.startDate || null;
      membershipUpdate.end_date = membership.endDate || null;
      membershipUpdate.is_active = !!membership.isActive;
      membershipUpdate.member_id = membership.memberId || null;
      membershipUpdate.shift = membership.shift || 'morning';
      membershipUpdate.due_amount = Number(membership.dueAmount || 0);
      membershipUpdate.paid_amount = Number(membership.paidAmount || 0);
    }

    await transaction(async (conn) => {
      if (Object.keys(updates).length) {
        const assignments = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
        await conn.execute(`UPDATE users SET ${assignments}, updated_at = NOW() WHERE id = ?`, [...Object.values(updates), userId]);
      }

      if (Object.keys(membershipUpdate).length) {
        await conn.execute(
          `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date), is_active=VALUES(is_active), member_id=VALUES(member_id), shift=VALUES(shift), due_amount=VALUES(due_amount), paid_amount=VALUES(paid_amount)`,
          [userId, membershipUpdate.plan || 'starter', membershipUpdate.start_date, membershipUpdate.end_date, membershipUpdate.is_active, membershipUpdate.member_id, membershipUpdate.shift || 'morning', membershipUpdate.due_amount || 0, membershipUpdate.paid_amount || 0]
        );
      }
    });

    const updatedMember = await findMemberByPublicId(req.params.id);
    res.json({ success: true, member: updatedMember });
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
    const member = await findMemberByPublicId(req.params.id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    await query("UPDATE users SET is_active = 0 WHERE mongo_id = ? OR id = ?", [req.params.id, Number(req.params.id) || 0]);
    res.json({ success: true, message: 'Member suspended' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const member = await findMemberByPublicId(req.params.id);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    await query('DELETE FROM users WHERE mongo_id = ? OR id = ?', [req.params.id, Number(req.params.id) || 0]);
    res.json({ success: true, message: 'Member deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
