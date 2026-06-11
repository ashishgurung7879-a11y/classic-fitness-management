const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, query, transaction } = require('../db/mysql');
const {
  bool,
  generatePublicId,
  mongoSortToSql,
  nullableString,
  number,
  omitUndefined,
  publicId,
  toDate,
  toDateOnly,
} = require('../db/helpers');
const { normalizeOptionalEmail, normalizePhone } = require('../utils/userFields');

const USER_FIELD_MAP = {
  _id: 'u.mongo_id',
  id: 'u.mongo_id',
  firstName: 'u.first_name',
  lastName: 'u.last_name',
  email: 'u.email',
  phone: 'u.phone',
  role: 'u.role',
  photo: 'u.photo',
  gender: 'u.gender',
  dateOfBirth: 'u.date_of_birth',
  address: 'u.address',
  isActive: 'u.is_active',
  approvalStatus: 'u.approval_status',
  resetOTP: 'u.reset_otp',
  resetOTPExpiry: 'u.reset_otp_expiry',
  qrCodeId: 'u.qr_code_id',
  lastLogin: 'u.last_login',
  twoFactorEnabled: 'u.two_factor_enabled',
  twoFactorCode: 'u.two_factor_code',
  twoFactorExpiresAt: 'u.two_factor_expires_at',
  createdAt: 'u.created_at',
  updatedAt: 'u.updated_at',
  'membership.plan': 'um.plan',
  'membership.startDate': 'um.start_date',
  'membership.endDate': 'um.end_date',
  'membership.isActive': 'um.is_active',
  'membership.memberId': 'um.member_id',
  'membership.shift': 'um.shift',
  'membership.dueAmount': 'um.due_amount',
  'membership.paidAmount': 'um.paid_amount',
  'trainerProfile.applicationStatus': 'tp.application_status',
  'trainerProfile.experience': 'tp.experience',
  'trainerProfile.certifications': 'tp.certifications',
  'trainerProfile.bio': 'tp.bio',
  'trainerProfile.appliedAt': 'tp.applied_at',
  'trainerProfile.approvedAt': 'tp.approved_at',
  'trainerProfile.rejectionReason': 'tp.rejection_reason',
  'fitnessData.height': 'ufd.height',
  'fitnessData.weight': 'ufd.weight',
  'fitnessData.goal': 'ufd.goal',
  'stats.totalWorkouts': 'us.total_workouts',
  'stats.attendanceDays': 'us.attendance_days',
  'stats.caloriesBurned': 'us.calories_burned',
  'stats.totalClasses': 'us.total_classes',
};

function duplicateCompat(err) {
  if (err?.code === 'ER_DUP_ENTRY') {
    err.code = 11000;
  }
  return err;
}

function selectedPlus(selectText = '') {
  return new Set(
    String(selectText)
      .split(/\s+/)
      .filter((field) => field.startsWith('+'))
      .map((field) => field.slice(1))
  );
}

function normalizeValue(field, value) {
  if (['phone'].includes(field)) return normalizePhone(value);
  if (['email'].includes(field)) return normalizeOptionalEmail(value);
  if (['isActive', 'membership.isActive', 'twoFactorEnabled'].includes(field)) return bool(value);
  if (['dateOfBirth'].includes(field)) return toDateOnly(value);
  if (field.endsWith('At') || field.endsWith('Date') || field.endsWith('Expiry')) return toDate(value);
  return value;
}

function buildWhere(filter = {}, params = [], prefix = 'AND') {
  const clauses = [];

  for (const [field, value] of Object.entries(filter || {})) {
    if (field === '$or' && Array.isArray(value)) {
      const parts = value
        .map((entry) => buildWhere(entry, params, '').sql)
        .filter(Boolean)
        .map((sql) => sql.replace(/^AND\s+/i, ''));
      if (parts.length) clauses.push(`(${parts.join(' OR ')})`);
      continue;
    }

    const column = USER_FIELD_MAP[field];
    if (!column) continue;

    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      if (value.$regex !== undefined) {
        clauses.push(`${column} LIKE ?`);
        params.push(`%${String(value.$regex)}%`);
      }
      if (value.$gte !== undefined) {
        clauses.push(`${column} >= ?`);
        params.push(normalizeValue(field, value.$gte));
      }
      if (value.$gt !== undefined) {
        clauses.push(`${column} > ?`);
        params.push(normalizeValue(field, value.$gt));
      }
      if (value.$ne !== undefined) {
        clauses.push(`(${column} <> ? OR ${column} IS NULL)`);
        params.push(normalizeValue(field, value.$ne));
      }
      if (value.$exists !== undefined) {
        clauses.push(value.$exists ? `${column} IS NOT NULL` : `${column} IS NULL`);
      }
      continue;
    }

    if (field === '_id' || field === 'id') {
      clauses.push(`(${column} = ? OR u.id = ?)`);
      params.push(publicId(value), Number(value) || 0);
      continue;
    }

    clauses.push(`${column} ${value === null || value === undefined ? 'IS' : '='} ?`);
    params.push(value === null || value === undefined ? null : normalizeValue(field, value));
  }

  const sql = clauses.length ? `${prefix ? `${prefix} ` : ''}${clauses.join(' AND ')}` : '';
  return { sql, params };
}

function baseSelect() {
  return `
    SELECT
      u.*,
      um.plan AS membership_plan,
      um.start_date AS membership_start_date,
      um.end_date AS membership_end_date,
      um.is_active AS membership_is_active,
      um.member_id AS membership_member_id,
      um.shift AS membership_shift,
      um.due_amount AS membership_due_amount,
      um.paid_amount AS membership_paid_amount,
      tp.id AS trainer_profile_sql_id,
      tp.application_status AS trainer_application_status,
      tp.experience AS trainer_experience,
      tp.certifications AS trainer_certifications,
      tp.bio AS trainer_bio,
      tp.applied_at AS trainer_applied_at,
      tp.approved_at AS trainer_approved_at,
      tp.rejection_reason AS trainer_rejection_reason,
      ufd.height AS fitness_height,
      ufd.weight AS fitness_weight,
      ufd.goal AS fitness_goal,
      us.total_workouts,
      us.attendance_days,
      us.calories_burned,
      us.total_classes
    FROM users u
    LEFT JOIN user_memberships um ON um.user_id = u.id
    LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
    LEFT JOIN user_fitness_data ufd ON ufd.user_id = u.id
    LEFT JOIN user_stats us ON us.user_id = u.id
    WHERE 1=1
  `;
}

async function attachSpecialities(rows) {
  const profileIds = rows.map((row) => row.trainer_profile_sql_id).filter(Boolean);
  if (!profileIds.length) return new Map();
  const placeholders = profileIds.map(() => '?').join(',');
  const specialities = await query(
    `SELECT trainer_profile_id, speciality FROM trainer_specialities WHERE trainer_profile_id IN (${placeholders}) ORDER BY id`,
    profileIds
  );
  const map = new Map();
  for (const row of specialities) {
    if (!map.has(row.trainer_profile_id)) map.set(row.trainer_profile_id, []);
    map.get(row.trainer_profile_id).push(row.speciality);
  }
  return map;
}

class UserDocument {
  constructor(row, options = {}) {
    const plus = options.plus || new Set();
    this._sqlId = row.id;
    this._id = row.mongo_id;
    this.id = row.mongo_id;
    this.firstName = row.first_name;
    this.lastName = row.last_name || '';
    this.email = row.email || undefined;
    this.phone = row.phone;
    if (plus.has('password')) this.password = row.password_hash;
    this.role = row.role || 'member';
    this.photo = row.photo || '';
    this.gender = row.gender || 'male';
    this.dateOfBirth = row.date_of_birth || undefined;
    this.address = row.address || '';
    this.isActive = !!row.is_active;
    this.approvalStatus = row.approval_status || 'approved';
    if (plus.has('resetOTP')) this.resetOTP = row.reset_otp || '';
    if (plus.has('resetOTPExpiry')) this.resetOTPExpiry = row.reset_otp_expiry || null;
    this.membership = {
      plan: row.membership_plan || 'none',
      startDate: row.membership_start_date || undefined,
      endDate: row.membership_end_date || undefined,
      isActive: !!row.membership_is_active,
      memberId: row.membership_member_id || undefined,
      shift: row.membership_shift || 'morning',
      dueAmount: number(row.membership_due_amount, 0),
      paidAmount: number(row.membership_paid_amount, 0),
    };
    this.trainerProfile = {
      applicationStatus: row.trainer_application_status || 'pending',
      experience: number(row.trainer_experience, 0),
      specialities: options.specialities || [],
      certifications: row.trainer_certifications || '',
      bio: row.trainer_bio || '',
      appliedAt: row.trainer_applied_at || undefined,
      approvedAt: row.trainer_approved_at || undefined,
      rejectionReason: row.trainer_rejection_reason || '',
    };
    this.fitnessData = {};
    if (row.fitness_height !== null && row.fitness_height !== undefined) this.fitnessData.height = row.fitness_height;
    if (row.fitness_weight !== null && row.fitness_weight !== undefined) this.fitnessData.weight = row.fitness_weight;
    if (row.fitness_goal) this.fitnessData.goal = row.fitness_goal;
    this.stats = {
      totalWorkouts: number(row.total_workouts, 0),
      attendanceDays: number(row.attendance_days, 0),
      caloriesBurned: number(row.calories_burned, 0),
      totalClasses: number(row.total_classes, 0),
    };
    this.qrCodeId = row.qr_code_id || undefined;
    this.lastLogin = row.last_login || undefined;
    this.twoFactorEnabled = !!row.two_factor_enabled;
    if (plus.has('twoFactorCode')) this.twoFactorCode = row.two_factor_code || '';
    if (plus.has('twoFactorExpiresAt')) this.twoFactorExpiresAt = row.two_factor_expires_at || null;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  async matchPassword(entered) {
    return bcrypt.compare(entered, this.password || '');
  }

  getToken() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET is missing or too weak. Set a strong secret in Backend/.env');
    }
    return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
  }

  async save() {
    await User.updateByPublicId(this._id, this);
    const fresh = await User.findById(this._id).select('+password +resetOTP +resetOTPExpiry +twoFactorCode +twoFactorExpiresAt');
    Object.assign(this, fresh);
    return this;
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    const output = { ...this };
    delete output._sqlId;
    delete output.password;
    delete output.resetOTP;
    delete output.resetOTPExpiry;
    delete output.twoFactorCode;
    delete output.twoFactorExpiresAt;
    return output;
  }
}

class UserQuery {
  constructor(filter = {}, mode = 'many') {
    this.filter = filter;
    this.mode = mode;
    this._select = '';
    this._sort = {};
    this._skip = 0;
    this._limit = null;
    this._lean = false;
  }

  select(value) {
    this._select = value || '';
    return this;
  }

  sort(value) {
    this._sort = value || {};
    return this;
  }

  skip(value) {
    this._skip = Number(value) || 0;
    return this;
  }

  limit(value) {
    this._limit = Number(value) || null;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const params = [];
    const where = buildWhere(this.filter, params);
    let sql = `${baseSelect()} ${where.sql}`;
    sql += mongoSortToSql(this._sort, USER_FIELD_MAP);
    if (this.mode === 'one') sql += ' LIMIT 1';
    if (this._limit && this.mode !== 'one') {
      sql += ' LIMIT ?';
      params.push(this._limit);
      if (this._skip) {
        sql += ' OFFSET ?';
        params.push(this._skip);
      }
    }

    const rows = await query(sql, params);
    const specialities = await attachSpecialities(rows);
    const plus = selectedPlus(this._select);
    const docs = rows.map((row) => new UserDocument(row, {
      plus,
      specialities: specialities.get(row.trainer_profile_sql_id) || [],
    }));
    const result = this.mode === 'one' ? docs[0] || null : docs;
    if (!this._lean) return result;
    return Array.isArray(result) ? result.map((doc) => doc.toObject()) : result?.toObject?.() || result;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

class UserCollectionQuery extends UserQuery {
  constructor(filter = {}, options = {}) {
    super(filter, 'many');
    this.options = options;
    this._lean = true;
  }

  toArray() {
    return this.exec();
  }
}

async function insertDefaults(conn, userId, input = {}) {
  const membership = input.membership || {};
  await conn.execute(
    `INSERT INTO user_memberships
      (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date),
       is_active=VALUES(is_active), member_id=VALUES(member_id), shift=VALUES(shift),
       due_amount=VALUES(due_amount), paid_amount=VALUES(paid_amount)`,
    [
      userId,
      membership.plan || 'none',
      toDate(membership.startDate),
      toDate(membership.endDate),
      bool(membership.isActive, false),
      nullableString(membership.memberId),
      membership.shift || 'morning',
      number(membership.dueAmount, 0),
      number(membership.paidAmount, 0),
    ]
  );

  const profile = input.trainerProfile || {};
  const [profileResult] = await conn.execute(
    `INSERT INTO trainer_profiles
      (user_id, application_status, experience, certifications, bio, applied_at, approved_at, rejection_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE application_status=VALUES(application_status), experience=VALUES(experience),
       certifications=VALUES(certifications), bio=VALUES(bio), applied_at=VALUES(applied_at),
       approved_at=VALUES(approved_at), rejection_reason=VALUES(rejection_reason), id=LAST_INSERT_ID(id)`,
    [
      userId,
      profile.applicationStatus || 'pending',
      number(profile.experience, 0),
      profile.certifications || '',
      profile.bio || '',
      toDate(profile.appliedAt),
      toDate(profile.approvedAt),
      profile.rejectionReason || '',
    ]
  );

  await conn.execute('DELETE FROM trainer_specialities WHERE trainer_profile_id = ?', [profileResult.insertId]);
  for (const speciality of Array.isArray(profile.specialities) ? profile.specialities : []) {
    const value = String(speciality || '').trim();
    if (value) {
      await conn.execute(
        'INSERT IGNORE INTO trainer_specialities (trainer_profile_id, speciality) VALUES (?, ?)',
        [profileResult.insertId, value]
      );
    }
  }

  if (input.fitnessData) {
    await conn.execute(
      `INSERT INTO user_fitness_data (user_id, height, weight, goal)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE height=VALUES(height), weight=VALUES(weight), goal=VALUES(goal)`,
      [
        userId,
        input.fitnessData.height ?? null,
        input.fitnessData.weight ?? null,
        nullableString(input.fitnessData.goal),
      ]
    );
  }

  const stats = input.stats || {};
  await conn.execute(
    `INSERT INTO user_stats (user_id, total_workouts, attendance_days, calories_burned, total_classes)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE total_workouts=VALUES(total_workouts), attendance_days=VALUES(attendance_days),
       calories_burned=VALUES(calories_burned), total_classes=VALUES(total_classes)`,
    [
      userId,
      number(stats.totalWorkouts, 0),
      number(stats.attendanceDays, 0),
      number(stats.caloriesBurned, 0),
      number(stats.totalClasses, 0),
    ]
  );
}

async function applyUserUpdates(conn, sqlId, updates = {}) {
  const user = {};
  const membership = {};
  const profile = {};
  const fitness = {};
  const stats = {};

  const assign = (key, value) => {
    if (key.startsWith('trainerProfile.')) {
      profile[key.slice('trainerProfile.'.length)] = value;
    } else if (key.startsWith('membership.')) {
      membership[key.slice('membership.'.length)] = value;
    } else if (key.startsWith('stats.')) {
      stats[key.slice('stats.'.length)] = value;
    } else if (key.startsWith('fitnessData.')) {
      fitness[key.slice('fitnessData.'.length)] = value;
    } else if (key === 'membership') {
      Object.assign(membership, value || {});
    } else if (key === 'trainerProfile') {
      Object.assign(profile, value || {});
    } else if (key === 'stats') {
      Object.assign(stats, value || {});
    } else if (key === 'fitnessData') {
      Object.assign(fitness, value || {});
    } else {
      user[key] = value;
    }
  };

  for (const [key, value] of Object.entries(updates || {})) assign(key, value);

  const userColumns = omitUndefined({
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email === undefined ? undefined : normalizeOptionalEmail(user.email),
    phone: user.phone === undefined ? undefined : normalizePhone(user.phone),
    password_hash: user.password,
    role: user.role,
    photo: user.photo,
    gender: user.gender,
    date_of_birth: user.dateOfBirth === undefined ? undefined : toDateOnly(user.dateOfBirth),
    address: user.address,
    is_active: user.isActive === undefined ? undefined : bool(user.isActive),
    approval_status: user.approvalStatus,
    reset_otp: user.resetOTP,
    reset_otp_expiry: user.resetOTPExpiry === undefined ? undefined : toDate(user.resetOTPExpiry),
    qr_code_id: user.qrCodeId,
    last_login: user.lastLogin === undefined ? undefined : toDate(user.lastLogin),
    two_factor_enabled: user.twoFactorEnabled === undefined ? undefined : bool(user.twoFactorEnabled),
    two_factor_code: user.twoFactorCode,
    two_factor_expires_at: user.twoFactorExpiresAt === undefined ? undefined : toDate(user.twoFactorExpiresAt),
  });

  if (userColumns.password_hash && !String(userColumns.password_hash).startsWith('$2')) {
    userColumns.password_hash = await bcrypt.hash(userColumns.password_hash, 10);
  }

  if (Object.keys(userColumns).length) {
    const assignments = Object.keys(userColumns).map((column) => `${column} = ?`).join(', ');
    await conn.execute(`UPDATE users SET ${assignments} WHERE id = ?`, [...Object.values(userColumns), sqlId]);
  }

  if (Object.keys(membership).length) {
    await insertDefaults(conn, sqlId, { membership });
  }

  if (Object.keys(profile).length) {
    await insertDefaults(conn, sqlId, { trainerProfile: profile });
  }

  if (Object.keys(fitness).length) {
    await conn.execute(
      `INSERT INTO user_fitness_data (user_id, height, weight, goal)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        height=COALESCE(VALUES(height), height),
        weight=COALESCE(VALUES(weight), weight),
        goal=COALESCE(VALUES(goal), goal)`,
      [sqlId, fitness.height ?? null, fitness.weight ?? null, fitness.goal ?? null]
    );
  }

  if (Object.keys(stats).length) {
    await conn.execute(
      `INSERT INTO user_stats (user_id, total_workouts, attendance_days, calories_burned, total_classes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        total_workouts=COALESCE(VALUES(total_workouts), total_workouts),
        attendance_days=COALESCE(VALUES(attendance_days), attendance_days),
        calories_burned=COALESCE(VALUES(calories_burned), calories_burned),
        total_classes=COALESCE(VALUES(total_classes), total_classes)`,
      [
        sqlId,
        stats.totalWorkouts ?? null,
        stats.attendanceDays ?? null,
        stats.caloriesBurned ?? null,
        stats.totalClasses ?? null,
      ]
    );
  }
}

class User {
  static find(filter = {}) {
    return new UserQuery(filter, 'many');
  }

  static findOne(filter = {}) {
    return new UserQuery(filter, 'one');
  }

  static findById(id) {
    return new UserQuery({ _id: id }, 'one');
  }

  static async countDocuments(filter = {}) {
    const params = [];
    const where = buildWhere(filter, params);
    const rows = await query(
      `SELECT COUNT(*) AS count
       FROM users u
       LEFT JOIN user_memberships um ON um.user_id = u.id
       LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
       LEFT JOIN user_fitness_data ufd ON ufd.user_id = u.id
       LEFT JOIN user_stats us ON us.user_id = u.id
       WHERE 1=1 ${where.sql}`,
      params
    );
    return rows[0]?.count || 0;
  }

  static async create(input = {}) {
    try {
      const mongoId = publicId(input._id) || generatePublicId();
      const passwordHash = String(input.password || '').startsWith('$2')
        ? input.password
        : await bcrypt.hash(String(input.password || ''), 10);
      const qrCodeId = input.qrCodeId || `CFP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      await transaction(async (conn) => {
        const [result] = await conn.execute(
          `INSERT INTO users
            (mongo_id, first_name, last_name, email, phone, password_hash, role, photo, gender,
             date_of_birth, address, is_active, approval_status, qr_code_id, last_login,
             two_factor_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP(3)), COALESCE(?, CURRENT_TIMESTAMP(3)))`,
          [
            mongoId,
            String(input.firstName || '').trim(),
            input.lastName || '',
            normalizeOptionalEmail(input.email),
            normalizePhone(input.phone),
            passwordHash,
            input.role || 'member',
            input.photo || '',
            input.gender || 'male',
            toDateOnly(input.dateOfBirth),
            input.address || '',
            bool(input.isActive, true),
            input.approvalStatus || 'approved',
            qrCodeId,
            toDate(input.lastLogin),
            bool(input.twoFactorEnabled, false),
            toDate(input.createdAt),
            toDate(input.updatedAt),
          ]
        );
        await insertDefaults(conn, result.insertId, input);
      });

      return User.findById(mongoId).select('+password');
    } catch (err) {
      throw duplicateCompat(err);
    }
  }

  static async updateByPublicId(id, updates = {}) {
    try {
      const existing = await User.findById(id).select('+password +resetOTP +resetOTPExpiry +twoFactorCode +twoFactorExpiresAt');
      if (!existing) return null;
      await transaction((conn) => applyUserUpdates(conn, existing._sqlId, updates));
      return User.findById(id);
    } catch (err) {
      throw duplicateCompat(err);
    }
  }

  static async findByIdAndUpdate(id, updates = {}) {
    await User.updateByPublicId(id, updates);
    return User.findById(id);
  }

  static async findOneAndUpdate(filter = {}, updates = {}) {
    const existing = await User.findOne(filter);
    if (!existing) return null;
    return User.findByIdAndUpdate(existing._id, updates);
  }

  static async findOneAndDelete(filter = {}) {
    const existing = await User.findOne(filter);
    if (!existing) return null;
    await query('DELETE FROM users WHERE id = ?', [existing._sqlId]);
    return existing;
  }

  static async findByIdAndDelete(id) {
    const existing = await User.findById(id);
    if (!existing) return null;
    await query('DELETE FROM users WHERE id = ?', [existing._sqlId]);
    return existing;
  }

  static async syncIndexes() {
    return undefined;
  }
}

User.collection = {
  find(filter = {}, options = {}) {
    return new UserCollectionQuery(filter, options);
  },
};

module.exports = User;
