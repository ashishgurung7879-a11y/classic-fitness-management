const { query, transaction } = require('../db/mysql');
const {
  bool,
  generatePublicId,
  isPlaceholderId,
  mongoSortToSql,
  nullableString,
  number,
  parseJson,
  publicId,
  stringifyJson,
  toDate,
} = require('../db/helpers');

const tableIdCache = new Map();

async function resolveSqlId(table, value) {
  if (!value || isPlaceholderId(value)) return null;
  if (typeof value === 'object' && value._sqlId) return value._sqlId;
  const id = publicId(value);
  if (!id) return null;
  const key = `${table}:${id}`;
  if (tableIdCache.has(key)) return tableIdCache.get(key);
  const rows = await query(`SELECT id FROM ${table} WHERE mongo_id = ? OR id = ? LIMIT 1`, [id, Number(id) || 0]);
  const resolved = rows[0]?.id || null;
  if (resolved) tableIdCache.set(key, resolved);
  return resolved;
}

function duplicateCompat(err) {
  if (err?.code === 'ER_DUP_ENTRY') err.code = 11000;
  return err;
}

function normalizeGatewayMethod(method) {
  if (method === 'prabhu') return 'prabhu_bank';
  return method || 'esewa';
}

const configs = {
  Product: {
    table: 'products',
    fieldMap: {
      _id: 't.mongo_id',
      id: 't.mongo_id',
      name: 't.name',
      price: 't.price',
      salePrice: 't.sale_price',
      description: 't.description',
      category: 't.category',
      emoji: 't.emoji',
      imageUrl: 't.image_url',
      badge: 't.badge',
      stock: 't.stock',
      isActive: 't.is_active',
      createdAt: 't.created_at',
      updatedAt: 't.updated_at',
      'rating.avg': 't.rating_avg',
      'rating.count': 't.rating_count',
    },
    sortMap: {
      createdAt: 't.created_at',
      name: 't.name',
      price: 't.price',
    },
    toRow(input = {}) {
      return {
        name: String(input.name || '').trim(),
        price: number(input.price, 0),
        sale_price: input.salePrice === null || input.salePrice === undefined || input.salePrice === '' ? null : number(input.salePrice, 0),
        description: input.description || '',
        category: input.category || 'other',
        emoji: input.emoji || '',
        image_url: input.imageUrl || '',
        badge: input.badge || '',
        stock: number(input.stock, 50),
        is_active: bool(input.isActive, true),
        rating_avg: number(input.rating?.avg ?? input.rating_avg, 4.5),
        rating_count: number(input.rating?.count ?? input.rating_count, 0),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        name: row.name,
        price: number(row.price, 0),
        salePrice: row.sale_price === null ? null : number(row.sale_price, 0),
        description: row.description || '',
        category: row.category || 'other',
        emoji: row.emoji || '',
        imageUrl: row.image_url || '',
        badge: row.badge || '',
        stock: number(row.stock, 0),
        isActive: !!row.is_active,
        rating: { avg: number(row.rating_avg, 4.5), count: number(row.rating_count, 0) },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Class: {
    table: 'classes',
    refs: { trainer: { table: 'users', column: 'trainer_id', alias: 'trainer_ref' } },
    fieldMap: {
      _id: 't.mongo_id',
      id: 't.mongo_id',
      name: 't.name',
      type: 't.type',
      trainer: 't.trainer_id',
      isActive: 't.is_active',
      'schedule.dayOfWeek': 't.day_of_week',
      'schedule.startTime': 't.start_time',
      createdAt: 't.created_at',
    },
    sortMap: {
      'schedule.dayOfWeek': 't.day_of_week',
      'schedule.startTime': 't.start_time',
      createdAt: 't.created_at',
    },
    async toRow(input = {}) {
      return {
        name: input.name,
        type: input.type || 'general',
        description: input.description || '',
        trainer_id: input.trainer !== undefined ? await resolveSqlId('users', input.trainer) : undefined,
        day_of_week: input.schedule?.dayOfWeek,
        start_time: input.schedule?.startTime,
        end_time: input.schedule?.endTime,
        duration_minutes: input.schedule?.duration === undefined ? undefined : number(input.schedule.duration, 60),
        capacity: input.capacity === undefined ? undefined : number(input.capacity, 20),
        is_active: input.isActive === undefined ? undefined : bool(input.isActive, true),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        name: row.name,
        type: row.type || 'general',
        description: row.description || '',
        trainer: row.trainer_mongo_id || null,
        schedule: {
          dayOfWeek: row.day_of_week,
          startTime: row.start_time || '',
          endTime: row.end_time || '',
          duration: number(row.duration_minutes, 60),
        },
        capacity: number(row.capacity, 20),
        enrolled: [],
        isActive: !!row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Booking: {
    table: 'bookings',
    refs: {
      user: { table: 'users', column: 'user_id', alias: 'user_ref' },
      class: { table: 'classes', column: 'class_id', alias: 'class_ref' },
      trainer: { table: 'users', column: 'trainer_id', alias: 'trainer_ref' },
    },
    fieldMap: {
      _id: 't.mongo_id',
      id: 't.mongo_id',
      user: 't.user_id',
      class: 't.class_id',
      trainer: 't.trainer_id',
      date: 't.booking_at',
      status: 't.status',
      type: 't.type',
      createdAt: 't.created_at',
    },
    sortMap: { date: 't.booking_at', createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        user_id: await resolveSqlId('users', input.user),
        class_id: await resolveSqlId('classes', input.class || input.classId),
        trainer_id: await resolveSqlId('users', input.trainer || input.trainerId),
        booking_at: toDate(input.date) || new Date(),
        type: input.type || 'class',
        status: input.status || 'confirmed',
        notes: input.notes || '',
        class_name: input.className || null,
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        user: row.user_mongo_id || null,
        class: row.class_mongo_id || null,
        trainer: row.trainer_mongo_id || null,
        date: row.booking_at,
        type: row.type || 'class',
        status: row.status || 'confirmed',
        notes: row.notes || '',
        className: row.class_name || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Attendance: {
    table: 'attendance',
    refs: {
      user: { table: 'users', column: 'user_id', alias: 'user_ref' },
      markedBy: { table: 'users', column: 'marked_by', alias: 'marked_by_ref' },
    },
    fieldMap: { user: 't.user_id', checkinAt: 't.checkin_at', createdAt: 't.checkin_at' },
    sortMap: { checkinAt: 't.checkin_at' },
    async toRow(input = {}) {
      return {
        user_id: await resolveSqlId('users', input.user),
        checkin_at: toDate(input.checkinAt) || new Date(),
        checkout_at: toDate(input.checkoutAt),
        duration_minutes: input.duration === undefined ? null : number(input.duration, 0),
        method: input.method || 'qr',
        marked_by: await resolveSqlId('users', input.markedBy),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        user: row.user_mongo_id || null,
        checkinAt: row.checkin_at,
        checkoutAt: row.checkout_at,
        duration: row.duration_minutes,
        method: row.method,
        markedBy: row.marked_by_mongo_id || null,
      };
    },
  },
  Payment: {
    table: 'payments',
    refs: {
      user: { table: 'users', column: 'user_id', alias: 'user_ref' },
      verifiedBy: { table: 'users', column: 'verified_by', alias: 'verified_by_ref' },
    },
    fieldMap: { user: 't.user_id', status: 't.status', method: 't.method', createdAt: 't.created_at' },
    sortMap: { createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        user_id: await resolveSqlId('users', input.user),
        type: input.type || 'membership',
        description: input.description || '',
        amount: number(input.amount, 0),
        total_amount: number(input.totalAmount ?? input.amount, 0),
        method: normalizeGatewayMethod(input.method),
        status: input.status || 'pending',
        billing_is_yearly: bool(input.billingPeriod?.isYearly, false),
        gateway_json: stringifyJson(input.gateway || {}),
        verified_at: toDate(input.verifiedAt),
        verified_by: await resolveSqlId('users', input.verifiedBy),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        user: row.user_mongo_id || null,
        type: row.type || 'membership',
        description: row.description || '',
        amount: number(row.amount, 0),
        totalAmount: number(row.total_amount, 0),
        method: row.method,
        status: row.status,
        gateway: parseJson(row.gateway_json, {}),
        billingPeriod: { isYearly: !!row.billing_is_yearly },
        verifiedAt: row.verified_at,
        verifiedBy: row.verified_by_mongo_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  ManualPayment: {
    table: 'manual_payments',
    refs: {
      user: { table: 'users', column: 'user_id', alias: 'user_ref' },
      verifiedBy: { table: 'users', column: 'verified_by', alias: 'verified_by_ref' },
    },
    fieldMap: { user: 't.user_id', status: 't.status', paymentMethod: 't.payment_method', createdAt: 't.created_at' },
    sortMap: { createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        user_id: await resolveSqlId('users', input.user),
        payment_method: normalizeGatewayMethod(input.paymentMethod),
        plan: input.plan || 'starter',
        amount: number(input.amount, 0),
        reference_id: input.referenceId || '',
        screenshot: input.screenshot || '',
        status: input.status || 'pending',
        admin_note: input.adminNote || '',
        verified_by: await resolveSqlId('users', input.verifiedBy),
        verified_at: toDate(input.verifiedAt),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        user: row.user_mongo_id || null,
        paymentMethod: row.payment_method,
        plan: row.plan,
        amount: number(row.amount, 0),
        referenceId: row.reference_id || '',
        screenshot: row.screenshot || '',
        status: row.status,
        adminNote: row.admin_note || '',
        verifiedBy: row.verified_by_mongo_id || null,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Notification: {
    table: 'notifications',
    refs: {
      user: { table: 'users', column: 'user_id', alias: 'user_ref' },
      triggeredBy: { table: 'users', column: 'triggered_by', alias: 'triggered_by_ref' },
    },
    fieldMap: { user: 't.user_id', status: 't.status', dedupeKey: 't.dedupe_key', createdAt: 't.created_at', type: 't.type' },
    sortMap: { createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        user_id: await resolveSqlId('users', input.user),
        channel: input.channel || 'sms',
        type: input.type || 'custom',
        title: input.title || 'Notification',
        message: input.message || '',
        sent_to: input.sentTo || '',
        status: input.status || 'pending',
        sent_at: toDate(input.sentAt),
        read_at: toDate(input.readAt),
        error: input.error || '',
        dedupe_key: input.dedupeKey || '',
        meta_json: stringifyJson(input.meta || {}),
        triggered_by: await resolveSqlId('users', input.triggeredBy),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        user: row.user_mongo_id || null,
        channel: row.channel,
        type: row.type,
        title: row.title,
        message: row.message,
        sentTo: row.sent_to,
        status: row.status,
        sentAt: row.sent_at,
        readAt: row.read_at,
        error: row.error || '',
        dedupeKey: row.dedupe_key || '',
        meta: parseJson(row.meta_json, {}),
        triggeredBy: row.triggered_by_mongo_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Gallery: {
    table: 'gallery_images',
    refs: { addedBy: { table: 'users', column: 'added_by', alias: 'added_by_ref' } },
    fieldMap: { category: 't.category', isActive: 't.is_active', createdAt: 't.created_at' },
    sortMap: { createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        title: input.title || '',
        image_url: input.imageUrl,
        category: input.category || 'gym',
        is_active: bool(input.isActive, true),
        added_by: await resolveSqlId('users', input.addedBy),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        title: row.title || '',
        imageUrl: row.image_url,
        category: row.category || 'gym',
        isActive: !!row.is_active,
        addedBy: row.added_by_mongo_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  Notice: {
    table: 'notices',
    fieldMap: { createdAt: 't.created_at' },
    sortMap: { createdAt: 't.created_at' },
    toRow(input = {}) {
      return {
        type: input.type || 'announcement',
        title: input.title,
        message: input.message,
        color: input.color || '#CC0000',
        emoji: input.emoji || '',
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        type: row.type,
        title: row.title,
        message: row.message,
        color: row.color,
        emoji: row.emoji || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  ContactLead: {
    table: 'contact_leads',
    fieldMap: { status: 't.status', createdAt: 't.created_at', email: 't.email', phone: 't.phone', name: 't.name' },
    sortMap: { createdAt: 't.created_at' },
    toRow(input = {}) {
      return {
        name: input.name,
        phone: input.phone || '',
        email: input.email || '',
        type: input.type || 'general',
        message: input.message,
        status: input.status || 'new',
        admin_note: input.adminNote || '',
        source: input.source || 'website',
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        name: row.name,
        phone: row.phone || '',
        email: row.email || '',
        type: row.type,
        message: row.message,
        status: row.status,
        adminNote: row.admin_note || '',
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
  TrainerSchedule: {
    table: 'trainer_schedules',
    refs: { trainer: { table: 'users', column: 'trainer_id', alias: 'trainer_ref' } },
    fieldMap: { trainer: 't.trainer_id', isAvailable: 't.is_available', dayOfWeek: 't.day_of_week', startTime: 't.start_time' },
    sortMap: { dayOfWeek: 't.day_of_week', startTime: 't.start_time' },
    async toRow(input = {}) {
      return {
        trainer_id: await resolveSqlId('users', input.trainer),
        day_of_week: input.dayOfWeek,
        start_time: input.startTime || '',
        end_time: input.endTime || '',
        is_available: bool(input.isAvailable, true),
        booked_slots: number(input.bookedSlots, 0),
        max_slots: number(input.maxSlots ?? input.maxBookings, 5),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        trainer: row.trainer_mongo_id || null,
        dayOfWeek: row.day_of_week,
        startTime: row.start_time || '',
        endTime: row.end_time || '',
        isAvailable: !!row.is_available,
        bookedSlots: number(row.booked_slots, 0),
        maxSlots: number(row.max_slots, 5),
      };
    },
  },
  Measurement: {
    table: 'measurements',
    refs: {
      member: { table: 'users', column: 'member_id', alias: 'member_ref' },
      trainer: { table: 'users', column: 'trainer_id', alias: 'trainer_ref' },
      recordedBy: { table: 'users', column: 'recorded_by', alias: 'recorded_by_ref' },
    },
    fieldMap: { member: 't.member_id', measuredAt: 't.measured_at', createdAt: 't.created_at' },
    sortMap: { measuredAt: 't.measured_at', createdAt: 't.created_at' },
    async toRow(input = {}) {
      return {
        member_id: await resolveSqlId('users', input.member),
        trainer_id: await resolveSqlId('users', input.trainer),
        measured_at: toDate(input.measuredAt) || new Date(),
        height: input.height ?? null,
        weight: input.weight ?? null,
        forearms: input.forearms ?? null,
        biceps: input.biceps ?? null,
        chest: input.chest ?? null,
        abdomen: input.abdomen ?? null,
        thighs: input.thighs ?? null,
        calves: input.calves ?? null,
        notes: input.notes || '',
        recorded_by: await resolveSqlId('users', input.recordedBy),
      };
    },
    fromRow(row) {
      return {
        _id: row.mongo_id,
        id: row.mongo_id,
        member: row.member_mongo_id || null,
        trainer: row.trainer_mongo_id || null,
        measuredAt: row.measured_at,
        height: row.height,
        weight: row.weight,
        forearms: row.forearms,
        biceps: row.biceps,
        chest: row.chest,
        abdomen: row.abdomen,
        thighs: row.thighs,
        calves: row.calves,
        notes: row.notes || '',
        recordedBy: row.recorded_by_mongo_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  },
};

function refSelects(config) {
  return Object.entries(config.refs || {})
    .map(([field, ref]) => `, ${ref.alias}.mongo_id AS ${field}_mongo_id`)
    .join('');
}

function refJoins(config) {
  return Object.values(config.refs || {})
    .map((ref) => ` LEFT JOIN ${ref.table} ${ref.alias} ON ${ref.alias}.id = t.${ref.column}`)
    .join('');
}

async function buildWhere(config, filter = {}, params = [], prefix = 'AND') {
  const clauses = [];
  for (const [field, value] of Object.entries(filter || {})) {
    if (field === '$or' && Array.isArray(value)) {
      const parts = [];
      for (const entry of value) {
        const built = await buildWhere(config, entry, params, '');
        if (built.sql) parts.push(built.sql.replace(/^AND\s+/i, ''));
      }
      if (parts.length) clauses.push(`(${parts.join(' OR ')})`);
      continue;
    }

    const ref = config.refs?.[field];
    const column = ref ? `t.${ref.column}` : (config.fieldMap?.[field] || `t.${field}`);
    let normalized = value;

    if (ref) normalized = await resolveSqlId(ref.table, value);
    if ((field === '_id' || field === 'id') && value !== undefined) {
      clauses.push('(t.mongo_id = ? OR t.id = ?)');
      params.push(publicId(value), Number(value) || 0);
      continue;
    }

    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      if (value.$regex !== undefined) {
        clauses.push(`${column} LIKE ?`);
        params.push(`%${String(value.$regex)}%`);
      }
      if (value.$gte !== undefined) {
        clauses.push(`${column} >= ?`);
        params.push(toDate(value.$gte) || value.$gte);
      }
      if (value.$gt !== undefined) {
        clauses.push(`${column} > ?`);
        params.push(toDate(value.$gt) || value.$gt);
      }
      if (value.$ne !== undefined) {
        const neValue = ref ? await resolveSqlId(ref.table, value.$ne) : value.$ne;
        clauses.push(`(${column} <> ? OR ${column} IS NULL)`);
        params.push(neValue);
      }
      if (value.$exists !== undefined) {
        clauses.push(value.$exists ? `${column} IS NOT NULL` : `${column} IS NULL`);
      }
      continue;
    }

    if (field === 'isActive' || field === 'isAvailable') normalized = bool(value);
    clauses.push(`${column} ${normalized === null || normalized === undefined ? 'IS' : '='} ?`);
    params.push(normalized === null || normalized === undefined ? null : normalized);
  }
  return { sql: clauses.length ? `${prefix ? `${prefix} ` : ''}${clauses.join(' AND ')}` : '', params };
}

function cleanRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

class SqlDocument {
  constructor(model, data) {
    Object.defineProperty(this, '_model', { value: model, enumerable: false });
    Object.assign(this, data);
  }

  async save() {
    if (!this._id) {
      const created = await this._model.create(this);
      Object.assign(this, created);
      return this;
    }
    const updated = await this._model.findByIdAndUpdate(this._id, this);
    Object.assign(this, updated);
    return this;
  }

  toObject() {
    return { ...this };
  }
}

class SqlQuery {
  constructor(model, filter = {}, mode = 'many') {
    this.model = model;
    this.filter = filter;
    this.mode = mode;
    this._sort = {};
    this._skip = 0;
    this._limit = null;
    this._lean = false;
    this._populates = [];
  }

  sort(value) { this._sort = value || {}; return this; }
  skip(value) { this._skip = Number(value) || 0; return this; }
  limit(value) { this._limit = Number(value) || null; return this; }
  lean() { this._lean = true; return this; }
  select() { return this; }
  populate(field, fields) { this._populates.push({ field, fields }); return this; }

  async exec() {
    const docs = await this.model._find(this.filter, {
      sort: this._sort,
      skip: this._skip,
      limit: this.mode === 'one' ? 1 : this._limit,
      populates: this._populates,
    });
    const result = this.mode === 'one' ? docs[0] || null : docs;
    if (!this._lean) return result;
    return Array.isArray(result) ? result.map((doc) => doc.toObject()) : result?.toObject?.() || result;
  }

  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
}

class SqlCollectionQuery extends SqlQuery {
  constructor(model, filter = {}) {
    super(model, filter, 'many');
    this._lean = true;
  }
  toArray() { return this.exec(); }
}

function createModel(name, config) {
  return class Model {
    static modelName = name;
    static config = config;

    static find(filter = {}) { return new SqlQuery(this, filter, 'many'); }
    static findOne(filter = {}) { return new SqlQuery(this, filter, 'one'); }
    static findById(id) { return new SqlQuery(this, { _id: id }, 'one'); }

    static async _find(filter = {}, options = {}) {
      const params = [];
      const where = await buildWhere(config, filter, params);
      let sql = `SELECT t.* ${refSelects(config)} FROM ${config.table} t ${refJoins(config)} WHERE 1=1 ${where.sql}`;
      sql += mongoSortToSql(options.sort || {}, { ...(config.fieldMap || {}), ...(config.sortMap || {}) });
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(Number(options.limit));
        if (options.skip) {
          sql += ' OFFSET ?';
          params.push(Number(options.skip));
        }
      }
      const rows = await query(sql, params);
      const docs = rows.map((row) => new SqlDocument(this, config.fromRow(row)));
      await populateDocs(docs, options.populates || []);
      return docs;
    }

    static async countDocuments(filter = {}) {
      const params = [];
      const where = await buildWhere(config, filter, params);
      const rows = await query(`SELECT COUNT(*) AS count FROM ${config.table} t ${refJoins(config)} WHERE 1=1 ${where.sql}`, params);
      return rows[0]?.count || 0;
    }

    static async create(input = {}) {
      try {
        const mongoId = publicId(input._id) || generatePublicId();
        const row = cleanRow(await config.toRow(input));
        row.mongo_id = mongoId;
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        await query(
          `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
          columns.map((column) => row[column])
        );
        return this.findById(mongoId);
      } catch (err) {
        throw duplicateCompat(err);
      }
    }

    static async findByIdAndUpdate(id, updates = {}) {
      const existing = await this.findById(id);
      if (!existing) return null;
      await this._update(existing._id, updates);
      return this.findById(existing._id);
    }

    static async findOneAndUpdate(filter = {}, updates = {}) {
      const existing = await this.findOne(filter);
      if (!existing) return null;
      await this._update(existing._id, updates);
      return this.findById(existing._id);
    }

    static async _update(id, updates = {}) {
      if (updates.$inc) {
        const incrementColumns = [];
        const values = [];
        for (const [field, amount] of Object.entries(updates.$inc)) {
          const column = (config.toRow({ [field]: 0 }) && config.fieldMap?.[field]) || `t.${field}`;
          incrementColumns.push(`${column.replace(/^t\./, '')} = ${column.replace(/^t\./, '')} + ?`);
          values.push(number(amount, 0));
        }
        if (incrementColumns.length) {
          values.push(publicId(id), Number(id) || 0);
          await query(`UPDATE ${config.table} SET ${incrementColumns.join(', ')} WHERE mongo_id = ? OR id = ?`, values);
        }
        return;
      }

      const row = cleanRow(await config.toRow(updates));
      delete row.mongo_id;
      const columns = Object.keys(row).filter((column) => row[column] !== undefined);
      if (!columns.length) return;
      const assignments = columns.map((column) => `${column} = ?`).join(', ');
      await query(
        `UPDATE ${config.table} SET ${assignments} WHERE mongo_id = ? OR id = ?`,
        [...columns.map((column) => row[column]), publicId(id), Number(id) || 0]
      );
    }

    static async findByIdAndDelete(id) {
      const existing = await this.findById(id);
      if (!existing) return null;
      await query(`DELETE FROM ${config.table} WHERE mongo_id = ? OR id = ?`, [publicId(id), Number(id) || 0]);
      return existing;
    }

    static async findOneAndDelete(filter = {}) {
      const existing = await this.findOne(filter);
      if (!existing) return null;
      await query(`DELETE FROM ${config.table} WHERE mongo_id = ?`, [existing._id]);
      return existing;
    }

    static async aggregate(pipeline = []) {
      const match = pipeline.find((stage) => stage.$match)?.$match || {};
      const group = pipeline.find((stage) => stage.$group)?.$group || {};
      const sumField = String(group.total?.$sum || '').replace(/^\$/, '');
      const column = config.fieldMap?.[sumField] || `t.${sumField}`;
      const params = [];
      const where = await buildWhere(config, match, params);
      const rows = await query(
        `SELECT COALESCE(SUM(${column}), 0) AS total FROM ${config.table} t ${refJoins(config)} WHERE 1=1 ${where.sql}`,
        params
      );
      return [{ _id: null, total: rows[0]?.total || 0 }];
    }
  };
}

async function populateDocs(docs, populates) {
  if (!docs.length || !populates.length) return;
  const User = require('./User');
  for (const populate of populates) {
    for (const doc of docs) {
      const id = doc[populate.field];
      if (!id) continue;
      if (['user', 'trainer', 'member', 'recordedBy', 'verifiedBy', 'triggeredBy', 'addedBy'].includes(populate.field)) {
        doc[populate.field] = await User.findById(id);
      }
    }
  }
}

const Product = createModel('Product', configs.Product);
Product.collection = { find: (filter = {}) => new SqlCollectionQuery(Product, filter) };

const Class = createModel('Class', configs.Class);
const Booking = createModel('Booking', configs.Booking);
const Attendance = createModel('Attendance', configs.Attendance);
const Payment = createModel('Payment', configs.Payment);
const ManualPayment = createModel('ManualPayment', configs.ManualPayment);
const Notification = createModel('Notification', configs.Notification);
const Gallery = createModel('Gallery', configs.Gallery);
const Notice = createModel('Notice', configs.Notice);
const ContactLead = createModel('ContactLead', configs.ContactLead);
const TrainerSchedule = createModel('TrainerSchedule', configs.TrainerSchedule);
const Measurement = createModel('Measurement', configs.Measurement);

class PaymentSetting {
  static async findOne(filter = {}) {
    const key = filter.key || filter.setting_key || 'qr_payment_methods';
    const rows = await query('SELECT * FROM payment_settings WHERE setting_key = ? LIMIT 1', [key]);
    if (!rows[0]) return null;
    const methods = await query('SELECT * FROM payment_setting_methods WHERE payment_setting_id = ?', [rows[0].id]);
    return {
      _id: rows[0].mongo_id,
      id: rows[0].mongo_id,
      key: rows[0].setting_key,
      methods: Object.fromEntries(methods.map((method) => [method.method_key, {
        label: method.label,
        color: method.color,
        helper: method.helper,
        imageUrl: method.image_url || '',
        isActive: !!method.is_active,
      }])),
      updatedBy: rows[0].updated_by,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
      lean() { return this; },
    };
  }

  static async findOneAndUpdate(filter = {}, updates = {}) {
    const key = filter.key || updates.key || 'qr_payment_methods';
    const mongoId = generatePublicId();
    await transaction(async (conn) => {
      const updatedBy = await resolveSqlId('users', updates.updatedBy);
      const [result] = await conn.execute(
        `INSERT INTO payment_settings (mongo_id, setting_key, updated_by)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE updated_by=VALUES(updated_by), id=LAST_INSERT_ID(id)`,
        [mongoId, key, updatedBy]
      );
      if (updates.methods && typeof updates.methods === 'object') {
        await conn.execute('DELETE FROM payment_setting_methods WHERE payment_setting_id = ?', [result.insertId]);
        for (const [methodKey, method] of Object.entries(updates.methods)) {
          await conn.execute(
            `INSERT INTO payment_setting_methods
              (payment_setting_id, method_key, label, color, helper, image_url, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              result.insertId,
              methodKey,
              method.label || methodKey,
              method.color || '',
              method.helper || '',
              method.imageUrl || '',
              bool(method.isActive, true),
            ]
          );
        }
      }
    });
    return PaymentSetting.findOne({ key });
  }
}

module.exports = {
  Attendance,
  Booking,
  Class,
  Payment,
  ManualPayment,
  Notification,
  Product,
  Gallery,
  Notice,
  ContactLead,
  Measurement,
  TrainerSchedule,
  PaymentSetting,
};
