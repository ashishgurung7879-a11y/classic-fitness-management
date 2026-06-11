const path = require('path');
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/classic_fitness_park';
const MYSQL_URL = process.env.MYSQL_URL;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

if (!MYSQL_URL) {
  console.error('MYSQL_URL is required, for example mysql://user:password@host:3306/classic_fitness_park');
  process.exit(1);
}

function mysqlConfigFromUrl(urlValue) {
  const parsed = new URL(urlValue);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\/+/, ''),
    multipleStatements: false,
    dateStrings: false,
    ssl: process.env.MYSQL_SSL === 'true' || parsed.searchParams.get('ssl') === 'true'
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
  };
}

const collectionNames = {
  users: 'users',
  classes: 'classes',
  bookings: 'bookings',
  attendance: 'attendances',
  payments: 'payments',
  manualPayments: 'manualpayments',
  notifications: 'notifications',
  products: 'products',
  gallery: 'galleries',
  notices: 'notices',
  contactLeads: 'contactleads',
  measurements: 'measurements',
  trainerSchedules: 'trainerschedules',
  paymentSettings: 'paymentsettings',
};

const counters = {};
const warnings = [];

function count(name, type = 'migrated') {
  counters[name] = counters[name] || { migrated: 0, skipped: 0, warnings: 0 };
  counters[name][type] += 1;
}

function warn(collection, message) {
  warnings.push({ collection, message });
  count(collection, 'warnings');
  console.warn(`[warn:${collection}] ${message}`);
}

function mongoId(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (typeof value === 'object' && value._id && value !== value._id) {
    return mongoId(value._id);
  }

  return String(value);
}

function mysqlDate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function mysqlDateOnly(value) {
  const date = mysqlDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value === false || value === 'false' || value === 0 ? 0 : 1;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function nullableText(value) {
  const str = text(value, '').trim();
  return str ? str : null;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function jsonValue(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function refId(map, value, collection, field, required = false) {
  const id = mongoId(value);
  if (!id || id === '000000000000000000000000') {
    if (required) warn(collection, `missing required reference ${field}`);
    return null;
  }
  const found = map.get(id);
  if (!found) {
    warn(collection, `reference ${field}=${id} not found; stored as NULL or skipped`);
    return null;
  }
  return found;
}

async function collectionExists(db, name) {
  const rows = await db.listCollections({ name }).toArray();
  return rows.length > 0;
}

async function loadMap(mysqlConn, table) {
  const [rows] = await mysqlConn.query(`SELECT id, mongo_id FROM ${table}`);
  return new Map(rows.map((row) => [row.mongo_id, row.id]));
}

async function upsert(mysqlConn, table, row, uniqueColumn = 'mongo_id') {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const updateColumns = columns
    .filter((column) => column !== uniqueColumn)
    .map((column) => `${column}=VALUES(${column})`);
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), ${updateColumns.join(', ')}
  `;
  if (DRY_RUN) return 0;
  const [result] = await mysqlConn.execute(sql, columns.map((column) => row[column]));
  return result.insertId;
}

async function upsertByUnique(mysqlConn, table, row, uniqueColumn) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const updateColumns = columns
    .filter((column) => column !== uniqueColumn)
    .map((column) => `${column}=VALUES(${column})`);
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), ${updateColumns.join(', ')}
  `;
  if (DRY_RUN) return 0;
  const [result] = await mysqlConn.execute(sql, columns.map((column) => row[column]));
  return result.insertId;
}

async function cursorEach(db, collectionName, fn) {
  if (!(await collectionExists(db, collectionName))) {
    console.log(`Skipping missing MongoDB collection ${collectionName}`);
    return;
  }
  const cursor = db.collection(collectionName).find({}).sort({ _id: 1 });
  while (await cursor.hasNext()) {
    await fn(await cursor.next());
  }
}

async function assertNoDuplicateUsers(db) {
  if (!(await collectionExists(db, collectionNames.users))) return;
  const users = db.collection(collectionNames.users);
  const checks = ['phone', 'email', 'qrCodeId'];
  for (const field of checks) {
    const duplicates = await users.aggregate([
      { $match: { [field]: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 5 },
    ]).toArray();
    if (duplicates.length) {
      const sample = duplicates.map((row) => `${field}=${row._id} count=${row.count}`).join('; ');
      throw new Error(`Cannot migrate users with duplicate ${field}. Resolve these first: ${sample}`);
    }
  }
}

async function migrateUsers(db, mysqlConn) {
  await cursorEach(db, collectionNames.users, async (doc) => {
    const id = await upsert(mysqlConn, 'users', {
      mongo_id: mongoId(doc._id),
      first_name: text(doc.firstName, 'Unknown').trim() || 'Unknown',
      last_name: text(doc.lastName),
      email: nullableText(doc.email),
      phone: text(doc.phone).trim(),
      password_hash: text(doc.password),
      role: enumValue(doc.role, ['member', 'trainer', 'admin'], 'member'),
      photo: nullableText(doc.photo),
      gender: enumValue(doc.gender, ['male', 'female', 'other'], 'male'),
      date_of_birth: mysqlDateOnly(doc.dateOfBirth),
      address: nullableText(doc.address),
      is_active: bool(doc.isActive, true),
      approval_status: enumValue(doc.approvalStatus, ['pending', 'approved', 'rejected'], 'approved'),
      reset_otp: nullableText(doc.resetOTP),
      reset_otp_expiry: mysqlDate(doc.resetOTPExpiry),
      qr_code_id: nullableText(doc.qrCodeId),
      last_login: mysqlDate(doc.lastLogin),
      two_factor_enabled: bool(doc.twoFactorEnabled, false),
      two_factor_code: nullableText(doc.twoFactorCode),
      two_factor_expires_at: mysqlDate(doc.twoFactorExpiresAt),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });

    if (!DRY_RUN) {
      const membership = doc.membership || {};
      await upsertByUnique(mysqlConn, 'user_memberships', {
        user_id: id,
        plan: enumValue(membership.plan, ['none', 'starter', 'pro', 'elite'], 'none'),
        start_date: mysqlDate(membership.startDate),
        end_date: mysqlDate(membership.endDate),
        is_active: bool(membership.isActive, false),
        member_id: nullableText(membership.memberId),
        shift: enumValue(membership.shift, ['morning', 'afternoon', 'evening', 'night', 'multi'], 'morning'),
        due_amount: number(membership.dueAmount, 0),
        paid_amount: number(membership.paidAmount, 0),
      }, 'user_id');

      const trainerProfile = doc.trainerProfile || {};
      const trainerProfileId = await upsertByUnique(mysqlConn, 'trainer_profiles', {
        user_id: id,
        application_status: enumValue(trainerProfile.applicationStatus, ['pending', 'approved', 'rejected'], 'pending'),
        experience: number(trainerProfile.experience, 0),
        certifications: nullableText(trainerProfile.certifications),
        bio: nullableText(trainerProfile.bio),
        applied_at: mysqlDate(trainerProfile.appliedAt),
        approved_at: mysqlDate(trainerProfile.approvedAt),
        rejection_reason: nullableText(trainerProfile.rejectionReason),
      }, 'user_id');

      await mysqlConn.execute('DELETE FROM trainer_specialities WHERE trainer_profile_id = ?', [trainerProfileId]);
      for (const speciality of Array.isArray(trainerProfile.specialities) ? trainerProfile.specialities : []) {
        const clean = text(speciality).trim();
        if (clean) {
          await mysqlConn.execute(
            'INSERT IGNORE INTO trainer_specialities (trainer_profile_id, speciality) VALUES (?, ?)',
            [trainerProfileId, clean]
          );
        }
      }

      const fitness = doc.fitnessData || {};
      if (fitness.height !== undefined || fitness.weight !== undefined || fitness.goal !== undefined) {
        await upsertByUnique(mysqlConn, 'user_fitness_data', {
          user_id: id,
          height: fitness.height === undefined ? null : number(fitness.height, 0),
          weight: fitness.weight === undefined ? null : number(fitness.weight, 0),
          goal: nullableText(fitness.goal),
        }, 'user_id');
      }

      const stats = doc.stats || {};
      await upsertByUnique(mysqlConn, 'user_stats', {
        user_id: id,
        total_workouts: Math.max(0, number(stats.totalWorkouts, 0)),
        attendance_days: Math.max(0, number(stats.attendanceDays, 0)),
        calories_burned: Math.max(0, number(stats.caloriesBurned, 0)),
        total_classes: Math.max(0, number(stats.totalClasses, 0)),
      }, 'user_id');
    }

    count(collectionNames.users);
  });
}

async function migrateClasses(db, mysqlConn, userMap) {
  const classMap = new Map();
  await cursorEach(db, collectionNames.classes, async (doc) => {
    const schedule = doc.schedule || {};
    const id = await upsert(mysqlConn, 'classes', {
      mongo_id: mongoId(doc._id),
      name: text(doc.name, 'Untitled class').trim() || 'Untitled class',
      type: text(doc.type, 'general'),
      description: nullableText(doc.description),
      trainer_id: refId(userMap, doc.trainer, collectionNames.classes, 'trainer'),
      day_of_week: schedule.dayOfWeek === undefined ? null : Math.max(0, Math.min(6, number(schedule.dayOfWeek, 0))),
      start_time: nullableText(schedule.startTime),
      end_time: nullableText(schedule.endTime),
      duration_minutes: Math.max(1, number(schedule.duration, 60)),
      capacity: Math.max(0, number(doc.capacity, 20)),
      is_active: bool(doc.isActive, true),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    classMap.set(mongoId(doc._id), id);

    if (!DRY_RUN) {
      await mysqlConn.execute('DELETE FROM class_enrollments WHERE class_id = ?', [id]);
      for (const enrolledUser of Array.isArray(doc.enrolled) ? doc.enrolled : []) {
        const userId = refId(userMap, enrolledUser, collectionNames.classes, 'enrolled');
        if (userId) {
          await mysqlConn.execute(
            'INSERT IGNORE INTO class_enrollments (class_id, user_id) VALUES (?, ?)',
            [id, userId]
          );
        }
      }
    }
    count(collectionNames.classes);
  });
  return classMap;
}

async function migrateSimpleCollections(db, mysqlConn, maps) {
  const { userMap, classMap } = maps;

  await cursorEach(db, collectionNames.products, async (doc) => {
    await upsert(mysqlConn, 'products', {
      mongo_id: mongoId(doc._id),
      name: text(doc.name, 'Untitled product').trim() || 'Untitled product',
      price: number(doc.price, 0),
      sale_price: doc.salePrice === undefined || doc.salePrice === null ? null : number(doc.salePrice, 0),
      description: nullableText(doc.description),
      category: enumValue(doc.category, ['protein', 'vitamins', 'gear', 'apparel', 'drinks', 'other'], 'other'),
      emoji: nullableText(doc.emoji),
      image_url: nullableText(doc.imageUrl),
      badge: nullableText(doc.badge),
      stock: Math.max(0, number(doc.stock, 50)),
      is_active: bool(doc.isActive, true),
      rating_avg: number(doc.rating?.avg, 4.5),
      rating_count: Math.max(0, number(doc.rating?.count, 0)),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.products);
  });

  await cursorEach(db, collectionNames.bookings, async (doc) => {
    const userId = refId(userMap, doc.user, collectionNames.bookings, 'user', true);
    if (!userId) return count(collectionNames.bookings, 'skipped');
    await upsert(mysqlConn, 'bookings', {
      mongo_id: mongoId(doc._id),
      user_id: userId,
      class_id: refId(classMap, doc.class, collectionNames.bookings, 'class'),
      trainer_id: refId(userMap, doc.trainer, collectionNames.bookings, 'trainer'),
      booking_at: mysqlDate(doc.date, new Date()),
      type: enumValue(doc.type, ['class', 'pt_session'], 'class'),
      status: enumValue(doc.status, ['confirmed', 'cancelled', 'completed'], 'confirmed'),
      notes: nullableText(doc.notes),
      class_name: nullableText(doc.className),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.bookings);
  });

  await cursorEach(db, collectionNames.attendance, async (doc) => {
    const userId = refId(userMap, doc.user, collectionNames.attendance, 'user', true);
    if (!userId) return count(collectionNames.attendance, 'skipped');
    await upsert(mysqlConn, 'attendance', {
      mongo_id: mongoId(doc._id),
      user_id: userId,
      checkin_at: mysqlDate(doc.checkinAt, new Date()),
      checkout_at: mysqlDate(doc.checkoutAt),
      duration_minutes: doc.duration === undefined ? null : Math.max(0, number(doc.duration, 0)),
      method: enumValue(doc.method, ['qr', 'manual', 'app'], 'qr'),
      marked_by: refId(userMap, doc.markedBy, collectionNames.attendance, 'markedBy'),
    });
    count(collectionNames.attendance);
  });

  await cursorEach(db, collectionNames.payments, async (doc) => {
    const userId = refId(userMap, doc.user, collectionNames.payments, 'user', true);
    if (!userId) return count(collectionNames.payments, 'skipped');
    await upsert(mysqlConn, 'payments', {
      mongo_id: mongoId(doc._id),
      user_id: userId,
      type: enumValue(doc.type, ['membership', 'product', 'pt_session'], 'membership'),
      description: nullableText(doc.description),
      amount: number(doc.amount, 0),
      total_amount: number(doc.totalAmount, number(doc.amount, 0)),
      method: enumValue(doc.method, ['esewa', 'khalti', 'cash', 'prabhu_bank'], 'cash'),
      status: enumValue(doc.status, ['pending', 'completed', 'failed', 'refunded'], 'pending'),
      billing_is_yearly: bool(doc.billingPeriod?.isYearly, false),
      gateway_json: jsonValue(doc.gateway || {}),
      verified_at: mysqlDate(doc.verifiedAt),
      verified_by: refId(userMap, doc.verifiedBy, collectionNames.payments, 'verifiedBy'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.payments);
  });

  await cursorEach(db, collectionNames.manualPayments, async (doc) => {
    const userId = refId(userMap, doc.user, collectionNames.manualPayments, 'user', true);
    if (!userId) return count(collectionNames.manualPayments, 'skipped');
    await upsert(mysqlConn, 'manual_payments', {
      mongo_id: mongoId(doc._id),
      user_id: userId,
      payment_method: enumValue(doc.paymentMethod, ['esewa', 'prabhu_bank', 'khalti'], 'esewa'),
      plan: enumValue(doc.plan, ['starter', 'pro', 'elite'], 'starter'),
      amount: number(doc.amount, 0),
      reference_id: nullableText(doc.referenceId),
      screenshot: nullableText(doc.screenshot),
      status: enumValue(doc.status, ['pending', 'verified', 'rejected'], 'pending'),
      admin_note: nullableText(doc.adminNote),
      verified_by: refId(userMap, doc.verifiedBy, collectionNames.manualPayments, 'verifiedBy'),
      verified_at: mysqlDate(doc.verifiedAt),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.manualPayments);
  });

  await cursorEach(db, collectionNames.gallery, async (doc) => {
    await upsert(mysqlConn, 'gallery_images', {
      mongo_id: mongoId(doc._id),
      title: nullableText(doc.title),
      image_url: text(doc.imageUrl),
      category: text(doc.category, 'gym'),
      is_active: bool(doc.isActive, true),
      added_by: refId(userMap, doc.addedBy, collectionNames.gallery, 'addedBy'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.gallery);
  });

  await cursorEach(db, collectionNames.notices, async (doc) => {
    await upsert(mysqlConn, 'notices', {
      mongo_id: mongoId(doc._id),
      type: text(doc.type, 'announcement'),
      title: text(doc.title, 'Notice'),
      message: text(doc.message),
      color: text(doc.color, '#CC0000'),
      emoji: nullableText(doc.emoji),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.notices);
  });

  await cursorEach(db, collectionNames.contactLeads, async (doc) => {
    await upsert(mysqlConn, 'contact_leads', {
      mongo_id: mongoId(doc._id),
      name: text(doc.name, 'Unknown').trim() || 'Unknown',
      phone: nullableText(doc.phone),
      email: nullableText(doc.email),
      type: text(doc.type, 'general'),
      message: text(doc.message),
      status: enumValue(doc.status, ['new', 'in_progress', 'closed'], 'new'),
      admin_note: nullableText(doc.adminNote),
      source: text(doc.source, 'website'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.contactLeads);
  });

  await cursorEach(db, collectionNames.notifications, async (doc) => {
    const userId = refId(userMap, doc.user, collectionNames.notifications, 'user', true);
    if (!userId) return count(collectionNames.notifications, 'skipped');
    await upsert(mysqlConn, 'notifications', {
      mongo_id: mongoId(doc._id),
      user_id: userId,
      channel: enumValue(doc.channel, ['sms'], 'sms'),
      type: enumValue(doc.type, ['login_welcome', 'member_approved', 'membership_activated', 'membership_expiring', 'password_reset', 'custom'], 'custom'),
      title: text(doc.title, 'Notification'),
      message: text(doc.message),
      sent_to: text(doc.sentTo),
      status: enumValue(doc.status, ['pending', 'sent', 'skipped', 'failed'], 'pending'),
      sent_at: mysqlDate(doc.sentAt),
      read_at: mysqlDate(doc.readAt),
      error: nullableText(doc.error),
      dedupe_key: nullableText(doc.dedupeKey),
      meta_json: jsonValue(doc.meta || {}),
      triggered_by: refId(userMap, doc.triggeredBy, collectionNames.notifications, 'triggeredBy'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.notifications);
  });

  await cursorEach(db, collectionNames.trainerSchedules, async (doc) => {
    const trainerId = refId(userMap, doc.trainer, collectionNames.trainerSchedules, 'trainer', true);
    if (!trainerId) return count(collectionNames.trainerSchedules, 'skipped');
    await upsert(mysqlConn, 'trainer_schedules', {
      mongo_id: mongoId(doc._id),
      trainer_id: trainerId,
      day_of_week: doc.dayOfWeek === undefined ? null : Math.max(0, Math.min(6, number(doc.dayOfWeek, 0))),
      start_time: nullableText(doc.startTime),
      end_time: nullableText(doc.endTime),
      is_available: bool(doc.isAvailable, true),
      booked_slots: Math.max(0, number(doc.bookedSlots, 0)),
      max_slots: Math.max(1, number(doc.maxSlots, 5)),
    });
    count(collectionNames.trainerSchedules);
  });

  await cursorEach(db, collectionNames.measurements, async (doc) => {
    const memberId = refId(userMap, doc.member, collectionNames.measurements, 'member', true);
    if (!memberId) return count(collectionNames.measurements, 'skipped');
    await upsert(mysqlConn, 'measurements', {
      mongo_id: mongoId(doc._id),
      member_id: memberId,
      trainer_id: refId(userMap, doc.trainer, collectionNames.measurements, 'trainer'),
      measured_at: mysqlDate(doc.measuredAt, new Date()),
      height: doc.height === undefined ? null : number(doc.height, 0),
      weight: doc.weight === undefined ? null : number(doc.weight, 0),
      forearms: doc.forearms === undefined ? null : number(doc.forearms, 0),
      biceps: doc.biceps === undefined ? null : number(doc.biceps, 0),
      chest: doc.chest === undefined ? null : number(doc.chest, 0),
      abdomen: doc.abdomen === undefined ? null : number(doc.abdomen, 0),
      thighs: doc.thighs === undefined ? null : number(doc.thighs, 0),
      calves: doc.calves === undefined ? null : number(doc.calves, 0),
      notes: nullableText(doc.notes),
      recorded_by: refId(userMap, doc.recordedBy, collectionNames.measurements, 'recordedBy'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    });
    count(collectionNames.measurements);
  });

  await cursorEach(db, collectionNames.paymentSettings, async (doc) => {
    const settingId = await upsert(mysqlConn, 'payment_settings', {
      mongo_id: mongoId(doc._id),
      setting_key: text(doc.key, 'qr_payment_methods'),
      updated_by: refId(userMap, doc.updatedBy, collectionNames.paymentSettings, 'updatedBy'),
      created_at: mysqlDate(doc.createdAt, new Date()),
      updated_at: mysqlDate(doc.updatedAt, new Date()),
    }, 'mongo_id');

    if (!DRY_RUN) {
      await mysqlConn.execute('DELETE FROM payment_setting_methods WHERE payment_setting_id = ?', [settingId]);
      for (const [methodKey, method] of Object.entries(doc.methods || {})) {
        await mysqlConn.execute(
          `INSERT INTO payment_setting_methods
            (payment_setting_id, method_key, label, color, helper, image_url, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            settingId,
            methodKey,
            text(method.label, methodKey),
            nullableText(method.color),
            nullableText(method.helper),
            nullableText(method.imageUrl),
            bool(method.isActive, true),
          ]
        );
      }
    }
    count(collectionNames.paymentSettings);
  });
}

async function verifyCounts(db, mysqlConn) {
  const checks = [
    [collectionNames.users, 'users'],
    [collectionNames.classes, 'classes'],
    [collectionNames.bookings, 'bookings'],
    [collectionNames.attendance, 'attendance'],
    [collectionNames.payments, 'payments'],
    [collectionNames.manualPayments, 'manual_payments'],
    [collectionNames.products, 'products'],
    [collectionNames.gallery, 'gallery_images'],
    [collectionNames.notices, 'notices'],
    [collectionNames.contactLeads, 'contact_leads'],
    [collectionNames.notifications, 'notifications'],
    [collectionNames.trainerSchedules, 'trainer_schedules'],
    [collectionNames.measurements, 'measurements'],
    [collectionNames.paymentSettings, 'payment_settings'],
  ];

  console.log('\nCount verification:');
  for (const [mongoCollection, table] of checks) {
    const mongoCount = await collectionExists(db, mongoCollection)
      ? await db.collection(mongoCollection).estimatedDocumentCount()
      : 0;
    const [rows] = await mysqlConn.query(`SELECT COUNT(*) AS count FROM ${table}`);
    console.log(`${mongoCollection} -> ${table}: mongo=${mongoCount}, mysql=${rows[0].count}`);
  }
}

async function main() {
  console.log(DRY_RUN ? 'Running DRY RUN migration' : 'Running migration');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const mysqlConn = await mysql.createConnection(mysqlConfigFromUrl(MYSQL_URL));

  try {
    await assertNoDuplicateUsers(db);

    await mysqlConn.beginTransaction();
    await migrateUsers(db, mysqlConn);
    await mysqlConn.commit();
    const userMap = DRY_RUN ? new Map() : await loadMap(mysqlConn, 'users');

    await mysqlConn.beginTransaction();
    const classMap = await migrateClasses(db, mysqlConn, userMap);
    await mysqlConn.commit();
    const loadedClassMap = DRY_RUN ? classMap : await loadMap(mysqlConn, 'classes');

    await mysqlConn.beginTransaction();
    await migrateSimpleCollections(db, mysqlConn, { userMap, classMap: loadedClassMap });
    await mysqlConn.commit();

    if (!DRY_RUN) await verifyCounts(db, mysqlConn);

    console.log('\nMigration summary:');
    for (const [collection, values] of Object.entries(counters)) {
      console.log(`${collection}: migrated=${values.migrated}, skipped=${values.skipped}, warnings=${values.warnings}`);
    }
    if (warnings.length) {
      console.log(`\nWarnings: ${warnings.length}. Review the console output before cutover.`);
    }
  } catch (err) {
    await mysqlConn.rollback().catch(() => {});
    throw err;
  } finally {
    await mysqlConn.end().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
