const axios = require('axios');
const { query, transaction } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');

function formatDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'today';
  return parsed.toLocaleDateString('en-NP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function normalizePlan(plan) {
  const value = String(plan || 'starter').toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ── Resolve SQL id for a user public id ──────────────────────────────────────
async function resolveUserSqlId(publicId) {
  if (!publicId) return null;
  const rows = await query(
    'SELECT id FROM users WHERE (mongo_id = ? OR id = ?) LIMIT 1',
    [String(publicId), Number(publicId) || 0]
  );
  return rows[0]?.id || null;
}

// ── SMS delivery ─────────────────────────────────────────────────────────────
async function deliverSms(notificationId, mongoId, notification) {
  const gatewayUrl = (process.env.SMS_GATEWAY_URL || '').trim();
  const gatewayToken = (process.env.SMS_GATEWAY_TOKEN || '').trim();

  if (!gatewayUrl) {
    await query(
      `UPDATE notifications SET status = 'skipped', error = ? WHERE id = ?`,
      ['SMS gateway not configured. Set SMS_GATEWAY_URL in Backend/.env to send real SMS.', notificationId]
    );
    return { ...notification, status: 'skipped' };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (gatewayToken) headers.Authorization = `Bearer ${gatewayToken}`;

    await axios.post(
      gatewayUrl,
      {
        to: notification.sentTo,
        message: notification.message,
        title: notification.title,
        type: notification.type,
        userId: notification.user,
        meta: notification.meta || {},
      },
      { headers, timeout: 10000 }
    );

    await query(
      `UPDATE notifications SET status = 'sent', sent_at = NOW(), error = '' WHERE id = ?`,
      [notificationId]
    );
    return { ...notification, status: 'sent', sentAt: new Date() };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message || 'SMS gateway request failed';
    await query(
      `UPDATE notifications SET status = 'failed', error = ? WHERE id = ?`,
      [errorMsg, notificationId]
    );
    return { ...notification, status: 'failed', error: errorMsg };
  }
}

// ── Queue an SMS notification ─────────────────────────────────────────────────
async function queueSmsNotification({
  user,
  phone,
  type,
  title,
  message,
  dedupeKey = '',
  meta = {},
  triggeredBy = null,
}) {
  const sentTo = phone || user?.phone;
  const userId = user?.id || user?._id || user?.mongo_id || null;
  if (!userId || !sentTo || !message) return null;

  // Resolve SQL ids
  const userSqlId = await resolveUserSqlId(userId);
  if (!userSqlId) return null;

  // Dedupe check
  if (dedupeKey) {
    const existing = await query(
      `SELECT id, mongo_id, status, user_id, type, title, message, sent_to, read_at, sent_at, dedupe_key, meta_json, created_at, updated_at
       FROM notifications WHERE dedupe_key = ? LIMIT 1`,
      [dedupeKey]
    );
    if (existing[0]) {
      const row = existing[0];
      let existingMeta = {};
      try { existingMeta = JSON.parse(row.meta_json || '{}'); } catch { existingMeta = {}; }
      return {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        user: userId,
        status: row.status,
        type: row.type,
        title: row.title,
        message: row.message,
        sentTo: row.sent_to,
        dedupeKey: row.dedupe_key,
        meta: existingMeta,
        createdAt: row.created_at,
      };
    }
  }

  const triggeredBySqlId = await resolveUserSqlId(triggeredBy);
  const mongoId = generatePublicId();
  const metaJson = JSON.stringify(meta || {});

  const result = await query(
    `INSERT INTO notifications
      (mongo_id, user_id, channel, type, title, message, sent_to, status, dedupe_key, meta_json, triggered_by, created_at, updated_at)
     VALUES (?, ?, 'sms', ?, ?, ?, ?, 'pending', ?, ?, ?, NOW(), NOW())`,
    [mongoId, userSqlId, type, title, message, sentTo, dedupeKey, metaJson, triggeredBySqlId || null]
  );

  const notificationId = result.insertId;
  const notificationObj = {
    _id: mongoId,
    id: mongoId,
    user: userId,
    channel: 'sms',
    type,
    title,
    message,
    sentTo,
    status: 'pending',
    dedupeKey,
    meta,
    createdAt: new Date(),
  };

  return deliverSms(notificationId, mongoId, notificationObj);
}

// ── Exported notification senders ─────────────────────────────────────────────

async function sendLoginWelcomeNotification(user) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return queueSmsNotification({
    user,
    type: 'login_welcome',
    title: 'Welcome Back',
    message: `Thank you for choosing Classic Fitness Park for your fitness journey. We wish you the best for your transformation journey, ${user.firstName}.`,
    dedupeKey: `login:${user._id || user.id}:${dayKey}`,
    meta: { event: 'login' },
  });
}

async function sendMemberApprovedNotification(user, triggeredBy = null) {
  return queueSmsNotification({
    user,
    type: 'member_approved',
    title: 'Member Account Approved',
    message: `Hello ${user.firstName}, your Classic Fitness Park member account is approved. You can now log in and begin your fitness journey with us.`,
    dedupeKey: `member-approved:${user._id || user.id}`,
    meta: { event: 'member_approved' },
    triggeredBy,
  });
}

async function sendMembershipActivatedNotification({
  user,
  plan,
  amount,
  startDate,
  endDate,
  paymentId = null,
  triggeredBy = null,
}) {
  const nicePlan = normalizePlan(plan);
  return queueSmsNotification({
    user,
    type: 'membership_activated',
    title: 'Membership Activated',
    message: `Thank you for buying the ${nicePlan} membership for Rs. ${Number(amount || 0).toLocaleString()}. Your membership starts on ${formatDate(startDate)} and runs until ${formatDate(endDate)}.`,
    dedupeKey: `membership-activated:${user._id || user.id}:${paymentId || `${nicePlan}-${new Date(startDate).toISOString()}`}`,
    meta: { event: 'membership_activated', plan: nicePlan, amount, startDate, endDate, paymentId },
    triggeredBy,
  });
}

async function sendMembershipExpiryReminder(user, daysLeft = 3, triggeredBy = null) {
  const endDate = user.membership?.endDate;
  if (!endDate) return null;

  return queueSmsNotification({
    user,
    type: 'membership_expiring',
    title: 'Membership Reminder',
    message: `Hello ${user.firstName}, your membership is going to end after ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Please visit the counter and continue your transformation journey with Classic Fitness Park.`,
    dedupeKey: `membership-expiring:${user._id || user.id}:${new Date(endDate).toISOString().slice(0, 10)}:${daysLeft}`,
    meta: { event: 'membership_expiring', daysLeft, endDate },
    triggeredBy,
  });
}

async function sendPasswordResetCodeNotification(user, code, triggeredBy = null) {
  if (!user || !code) return null;

  return queueSmsNotification({
    user,
    type: 'password_reset',
    title: 'Password Reset Code',
    message: `Classic Fitness Park password reset code: ${code}. This code expires in 10 minutes.`,
    dedupeKey: `password-reset:${user._id || user.id}:${String(user.resetOTPExpiry || '').slice(0, 16)}`,
    meta: { event: 'password_reset' },
    triggeredBy,
  });
}

async function findUserForNotificationLookup(identifier) {
  const normalizedPhone = String(identifier || '').trim();
  const rows = await query(
    `SELECT u.id, u.mongo_id, u.first_name, u.last_name, u.phone, u.email, u.role, u.photo,
            um.plan AS membership_plan, um.start_date AS membership_start_date,
            um.end_date AS membership_end_date, um.is_active AS membership_is_active
     FROM users u
     LEFT JOIN user_memberships um ON um.user_id = u.id
     WHERE u.phone = ? OR u.mongo_id = ? OR u.id = ?
     LIMIT 1`,
    [normalizedPhone, identifier, Number(identifier) || 0]
  );
  return rows[0] || null;
}

async function sendCustomSmsNotification({ user, phone, message, title, triggeredBy = null }) {
  let resolvedUser = user;
  if (!resolvedUser && phone) {
    const row = await findUserForNotificationLookup(phone);
    if (!row) return null;
    resolvedUser = {
      _id: row.mongo_id || String(row.id),
      id: row.mongo_id || String(row.id),
      firstName: row.first_name || '',
      phone: row.phone || '',
    };
  }
  if (!resolvedUser) return null;

  return queueSmsNotification({
    user: resolvedUser,
    phone: phone || resolvedUser.phone,
    type: 'custom',
    title: title || 'Classic Fitness Park',
    message,
    meta: { event: 'custom' },
    triggeredBy,
  });
}

async function runExpiryReminderScan({ triggeredBy = null, daysBefore = 3 } = {}) {
  const rows = await query(
    `SELECT u.id, u.mongo_id, u.first_name, u.last_name, u.phone,
            um.plan AS membership_plan, um.start_date AS membership_start_date,
            um.end_date AS membership_end_date, um.is_active AS membership_is_active
     FROM users u
     LEFT JOIN user_memberships um ON um.user_id = u.id
     WHERE u.role = 'member'
       AND u.is_active = 1
       AND u.approval_status = 'approved'
       AND um.is_active = 1
       AND um.end_date IS NOT NULL`
  );

  const results = [];
  const now = new Date();

  for (const row of rows) {
    const endDate = new Date(row.membership_end_date);
    if (Number.isNaN(endDate.getTime())) continue;
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
    if (daysLeft !== daysBefore) continue;

    const notification = await sendMembershipExpiryReminder(
      {
        _id: row.mongo_id || String(row.id),
        id: row.mongo_id || String(row.id),
        firstName: row.first_name,
        phone: row.phone,
        membership: {
          endDate: row.membership_end_date,
          isActive: !!row.membership_is_active,
          plan: row.membership_plan || 'starter',
        },
      },
      daysBefore,
      triggeredBy
    );
    if (notification) results.push(notification);
  }

  return results;
}

module.exports = {
  sendLoginWelcomeNotification,
  sendMemberApprovedNotification,
  sendMembershipActivatedNotification,
  sendMembershipExpiryReminder,
  sendPasswordResetCodeNotification,
  sendCustomSmsNotification,
  runExpiryReminderScan,
};
