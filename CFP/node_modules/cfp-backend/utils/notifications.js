const axios = require('axios');
const User = require('../models/User');
const { Notification } = require('../models/models');

function formatDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'today';
  return parsed.toLocaleDateString('en-NP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function normalizePlan(plan) {
  const value = String(plan || 'starter').toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function deliverSms(notification) {
  const gatewayUrl = (process.env.SMS_GATEWAY_URL || '').trim();
  const gatewayToken = (process.env.SMS_GATEWAY_TOKEN || '').trim();

  if (!gatewayUrl) {
    notification.status = 'skipped';
    notification.error = 'SMS gateway not configured. Set SMS_GATEWAY_URL in Backend/.env to send real SMS.';
    await notification.save({ validateBeforeSave: false });
    return notification;
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
        userId: notification.user?.toString?.() || notification.user,
        meta: notification.meta || {}
      },
      { headers, timeout: 10000 }
    );

    notification.status = 'sent';
    notification.sentAt = new Date();
    notification.error = '';
  } catch (err) {
    notification.status = 'failed';
    notification.error = err.response?.data?.message || err.message || 'SMS gateway request failed';
  }

  await notification.save({ validateBeforeSave: false });
  return notification;
}

async function queueSmsNotification({
  user,
  phone,
  type,
  title,
  message,
  dedupeKey = '',
  meta = {},
  triggeredBy = null
}) {
  const sentTo = phone || user?.phone;
  if (!user?._id || !sentTo || !message) return null;

  if (dedupeKey) {
    const existing = await Notification.findOne({ dedupeKey });
    if (existing) return existing;
  }

  const notification = await Notification.create({
    user: user._id,
    type,
    title,
    message,
    sentTo,
    dedupeKey,
    meta,
    triggeredBy
  });

  return deliverSms(notification);
}

async function sendLoginWelcomeNotification(user) {
  const dayKey = new Date().toISOString().slice(0, 10);
  return queueSmsNotification({
    user,
    type: 'login_welcome',
    title: 'Welcome Back',
    message: `Thank you for choosing Classic Fitness Park for your fitness journey. We wish you the best for your transformation journey, ${user.firstName}.`,
    dedupeKey: `login:${user._id}:${dayKey}`,
    meta: { event: 'login' }
  });
}

async function sendMemberApprovedNotification(user, triggeredBy = null) {
  return queueSmsNotification({
    user,
    type: 'member_approved',
    title: 'Member Account Approved',
    message: `Hello ${user.firstName}, your Classic Fitness Park member account is approved. You can now log in and begin your fitness journey with us.`,
    dedupeKey: `member-approved:${user._id}`,
    meta: { event: 'member_approved' },
    triggeredBy
  });
}

async function sendMembershipActivatedNotification({
  user,
  plan,
  amount,
  startDate,
  endDate,
  paymentId = null,
  triggeredBy = null
}) {
  const nicePlan = normalizePlan(plan);
  return queueSmsNotification({
    user,
    type: 'membership_activated',
    title: 'Membership Activated',
    message: `Thank you for buying the ${nicePlan} membership for Rs. ${Number(amount || 0).toLocaleString()}. Your membership starts on ${formatDate(startDate)} and runs until ${formatDate(endDate)}.`,
    dedupeKey: `membership-activated:${user._id}:${paymentId || `${nicePlan}-${new Date(startDate).toISOString()}`}`,
    meta: { event: 'membership_activated', plan: nicePlan, amount, startDate, endDate, paymentId },
    triggeredBy
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
    dedupeKey: `membership-expiring:${user._id}:${new Date(endDate).toISOString().slice(0, 10)}:${daysLeft}`,
    meta: { event: 'membership_expiring', daysLeft, endDate },
    triggeredBy
  });
}

async function sendPasswordResetCodeNotification(user, code, triggeredBy = null) {
  if (!user || !code) return null;

  return queueSmsNotification({
    user,
    type: 'password_reset',
    title: 'Password Reset Code',
    message: `Classic Fitness Park password reset code: ${code}. This code expires in 10 minutes.`,
    dedupeKey: `password-reset:${user._id}:${String(user.resetOTPExpiry || '').slice(0, 16)}`,
    meta: { event: 'password_reset' },
    triggeredBy
  });
}

async function sendCustomSmsNotification({ user, phone, message, title, triggeredBy = null }) {
  const resolvedUser = user || (phone ? await User.findOne({ phone }) : null);
  if (!resolvedUser) return null;

  return queueSmsNotification({
    user: resolvedUser,
    phone: phone || resolvedUser.phone,
    type: 'custom',
    title: title || 'Classic Fitness Park',
    message,
    meta: { event: 'custom' },
    triggeredBy
  });
}

async function runExpiryReminderScan({ triggeredBy = null, daysBefore = 3 } = {}) {
  const users = await User.find({
    role: 'member',
    isActive: true,
    approvalStatus: 'approved',
    'membership.isActive': true,
    'membership.endDate': { $exists: true, $ne: null }
  }).select('firstName phone membership');

  const results = [];
  const now = new Date();

  for (const user of users) {
    const endDate = new Date(user.membership?.endDate);
    if (Number.isNaN(endDate.getTime())) continue;
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
    if (daysLeft !== daysBefore) continue;
    const notification = await sendMembershipExpiryReminder(user, daysBefore, triggeredBy);
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
  runExpiryReminderScan
};
