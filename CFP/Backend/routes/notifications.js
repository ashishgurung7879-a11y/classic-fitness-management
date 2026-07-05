const express = require('express');
const { query } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');
const { protect, authorize } = require('../middleware/auth');
const { sendCustomSmsNotification, runExpiryReminderScan } = require('../utils/notifications');
const { normalizePhone } = require('../utils/userFields');

const router = express.Router();

// ── Helper: map notification row ─────────────────────────────────────────────
function mapNotificationRow(row = {}) {
  let meta = {};
  try { meta = JSON.parse(row.meta_json || '{}'); } catch { meta = {}; }
  return {
    _id: row.mongo_id || String(row.id),
    id: row.mongo_id || String(row.id),
    user: row.user_mongo_id || String(row.user_id || ''),
    channel: row.channel || 'sms',
    type: row.type || 'custom',
    title: row.title || '',
    message: row.message || '',
    sentTo: row.sent_to || '',
    status: row.status || 'pending',
    sentAt: row.sent_at || null,
    readAt: row.read_at || null,
    error: row.error || '',
    dedupeKey: row.dedupe_key || '',
    meta,
    triggeredBy: row.triggered_by_mongo_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /my — member's own notifications ─────────────────────────────────────
router.get('/my', protect, async (req, res) => {
  try {
    const rows = await query(
      `SELECT n.*, u.mongo_id AS user_mongo_id
       FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE (u.mongo_id = ? OR n.user_id = ?)
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [req.user.id, Number(req.user.internalId) || 0]
    );
    res.json({ success: true, notifications: rows.map(mapNotificationRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /my/:id/read — mark notification as read ─────────────────────────────
router.put('/my/:id/read', protect, async (req, res) => {
  try {
    // Resolve user's internal SQL id
    const userRows = await query(
      'SELECT id FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
      [req.user.id, Number(req.user.internalId) || 0]
    );
    if (!userRows[0]) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const sqlUserId = userRows[0].id;

    // Update read_at
    const result = await query(
      `UPDATE notifications SET read_at = NOW()
       WHERE (mongo_id = ? OR id = ?) AND user_id = ?`,
      [req.params.id, Number(req.params.id) || 0, sqlUserId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const rows = await query(
      `SELECT n.*, u.mongo_id AS user_mongo_id
       FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE (n.mongo_id = ? OR n.id = ?) LIMIT 1`,
      [req.params.id, Number(req.params.id) || 0]
    );
    res.json({ success: true, notification: rows[0] ? mapNotificationRow(rows[0]) : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET / — admin: all notifications ─────────────────────────────────────────
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { status, type, limit = 25 } = req.query;
    const whereClauses = ['1=1'];
    const params = [];

    if (status) {
      whereClauses.push('n.status = ?');
      params.push(status);
    }
    if (type) {
      whereClauses.push('n.type = ?');
      params.push(type);
    }

    const numericLimit = Math.min(100, Number(limit) || 25);
    params.push(numericLimit);

    const rows = await query(
      `SELECT n.*,
              u.mongo_id AS user_mongo_id,
              u.first_name, u.last_name, u.phone,
              tb.mongo_id AS triggered_by_mongo_id
       FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       LEFT JOIN users tb ON tb.id = n.triggered_by
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY n.created_at DESC
       LIMIT ?`,
      params
    );

    const notifications = rows.map((row) => ({
      ...mapNotificationRow(row),
      user: {
        id: row.user_mongo_id || String(row.user_id || ''),
        _id: row.user_mongo_id || String(row.user_id || ''),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
      },
    }));

    res.json({ success: true, notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /expiring — members whose membership expires within 7 days ────────────
router.get('/expiring', protect, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const rows = await query(
      `SELECT u.id, u.mongo_id, u.first_name, u.last_name, u.phone,
              um.plan AS membership_plan, um.start_date AS membership_start_date,
              um.end_date AS membership_end_date, um.is_active AS membership_is_active,
              um.member_id AS membership_member_id, um.shift AS membership_shift
       FROM users u
       LEFT JOIN user_memberships um ON um.user_id = u.id
       WHERE u.role = 'member'
         AND u.is_active = 1
         AND u.approval_status = 'approved'
         AND um.is_active = 1
         AND um.end_date IS NOT NULL
         AND um.end_date >= ?
         AND um.end_date <= ?
       ORDER BY um.end_date ASC`,
      [now, sevenDaysLater]
    );

    const expiringMembers = rows.map((row) => {
      const endDate = new Date(row.membership_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
      return {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        membership: {
          plan: row.membership_plan || 'starter',
          startDate: row.membership_start_date || null,
          endDate: row.membership_end_date || null,
          isActive: !!row.membership_is_active,
          memberId: row.membership_member_id || null,
          shift: row.membership_shift || 'morning',
        },
        daysLeft,
      };
    });

    res.json({ success: true, members: expiringMembers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /send-custom — admin: send SMS to a user ────────────────────────────
router.post('/send-custom', protect, authorize('admin'), async (req, res) => {
  try {
    const { userId, phone, title, message } = req.body;
    const normalizedPhone = phone ? normalizePhone(phone) : '';
    if (!message || (!userId && !phone)) {
      return res.status(400).json({ success: false, message: 'User or phone and message are required' });
    }

    let userRow = null;
    if (userId) {
      const rows = await query(
        'SELECT id, mongo_id, first_name, phone FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
        [userId, Number(userId) || 0]
      );
      userRow = rows[0] || null;
    } else if (normalizedPhone) {
      const rows = await query(
        'SELECT id, mongo_id, first_name, phone FROM users WHERE phone = ? LIMIT 1',
        [normalizedPhone]
      );
      userRow = rows[0] || null;
    }

    if (!userRow) {
      return res.status(404).json({ success: false, message: 'Member not found for this phone number' });
    }

    const userForNotification = {
      _id: userRow.mongo_id || String(userRow.id),
      id: userRow.mongo_id || String(userRow.id),
      firstName: userRow.first_name || '',
      phone: userRow.phone || '',
    };

    const notification = await sendCustomSmsNotification({
      user: userForNotification,
      phone: normalizedPhone || userRow.phone,
      title: title || 'Classic Fitness Park',
      message,
      triggeredBy: req.user.id,
    });

    if (!notification) {
      return res.status(400).json({ success: false, message: 'Could not queue SMS notification' });
    }

    res.json({ success: true, message: 'SMS notification processed', notification });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /run-expiry-reminders — admin: trigger expiry scan ──────────────────
router.post('/run-expiry-reminders', protect, authorize('admin'), async (req, res) => {
  try {
    const daysBefore = Math.max(1, Number(req.body?.daysBefore) || 3);
    const notifications = await runExpiryReminderScan({ triggeredBy: req.user.id, daysBefore });
    res.json({
      success: true,
      message: `Processed ${notifications.length} membership reminder${notifications.length === 1 ? '' : 's'}.`,
      total: notifications.length,
      notifications,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
