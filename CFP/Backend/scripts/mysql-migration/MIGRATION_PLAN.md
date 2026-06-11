# MongoDB to MySQL Migration Plan

This plan is based on the current Classic Fitness Park backend Mongoose schemas:

- `models/User.js`
- `models/models.js`
- inline route schemas in `routes/_payments.js`, `routes/paymentSettings.js`, `routes/products.js`, and `routes/manualPayments.js`

The migration uses normalized MySQL tables with integer primary keys and keeps each original Mongo `_id` in a unique `mongo_id` column. Keeping `mongo_id` makes the import idempotent, preserves traceability, and lets foreign keys be rebuilt safely.

## MongoDB to MySQL Mapping

| MongoDB collection | MySQL table(s) | Notes |
| --- | --- | --- |
| `users` | `users` | Core identity, auth, role, contact, security fields. Unique `phone`, nullable unique `email`, nullable unique `qr_code_id`. |
| `users.membership` | `user_memberships` | One-to-one with `users`. |
| `users.trainerProfile` | `trainer_profiles` | One-to-one with `users`; only meaningful for trainers but available for all users for compatibility. |
| `users.trainerProfile.specialities[]` | `trainer_specialities` | One-to-many child rows from trainer profile. |
| `users.fitnessData` | `user_fitness_data` | Optional one-to-one with `users`. |
| `users.stats` | `user_stats` | One-to-one counters. |
| `classes` | `classes` | `schedule` object flattened into `day_of_week`, `start_time`, `end_time`, `duration_minutes`. |
| `classes.enrolled[]` | `class_enrollments` | Many-to-many join table between classes and users. |
| `bookings` | `bookings` | Many bookings per user. Optional class and trainer references. The placeholder Mongo ID `000000000000000000000000` becomes `NULL`. |
| `attendances` | `attendance` | Many attendance records per user. Online attendance is currently disabled, but historical data is retained. |
| `payments` | `payments` | Gateway object stored as `gateway_json`; billing period flattened to `billing_is_yearly`. |
| `manualpayments` | `manual_payments` | Manual QR/bank proof payments. |
| `notifications` | `notifications` | `meta` object stored as `meta_json`; references user and triggered-by user. |
| `products` | `products` | `rating` object flattened into `rating_avg` and `rating_count`. |
| `galleries` | `gallery_images` | Public gallery images. |
| `notices` | `notices` | Notice board entries. |
| `contactleads` | `contact_leads` | Contact form submissions. |
| `measurements` | `measurements` | Member body measurements, optional trainer and recorder references. |
| `trainerschedules` | `trainer_schedules` | Trainer availability slots. |
| `paymentsettings` | `payment_settings`, `payment_setting_methods` | `methods` object becomes one child row per method key. |

The current `routes/orders.js` references an `Order` model that is not exported by `models/models.js` and is not mounted in `server.js`. Treat any live `orders` collection as legacy or implement an explicit order schema before migrating it.

## Files Added

- `schema.sql`: MySQL DDL for the normalized relational schema.
- `inspect-mongodb-schema.js`: Connects to MongoDB and writes a live schema/index/sample snapshot to `mongodb-schema-snapshot.json`.
- `migrate-mongo-to-mysql.js`: Idempotent Node.js migration loader.

## Prerequisites

1. MySQL 8.0+ with `utf8mb4` support.
2. A clean target database, for example `classic_fitness_park`.
3. Backend `.env` contains:

```env
MONGODB_URI=mongodb+srv://...
MYSQL_URL=mysql://USER:PASSWORD@HOST:3306/classic_fitness_park
```

4. Install the MySQL Node driver:

```bash
npm install mysql2
```

## Step-by-Step Migration

1. Freeze schema changes.

   Stop adding new Mongo collections/fields during migration preparation. If code changes are still happening, rerun the schema inspector before the final cutover.

2. Back up MongoDB.

```bash
mongodump --uri "$MONGODB_URI" --archive=classic_fitness_park-pre-mysql.archive --gzip
```

3. Snapshot the live MongoDB schema.

```bash
node scripts/mysql-migration/inspect-mongodb-schema.js
```

Review `scripts/mysql-migration/mongodb-schema-snapshot.json`, especially duplicate checks for `users.phone`, `users.email`, and `users.qrCodeId`.

4. Create the MySQL schema in staging.

```bash
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p "$MYSQL_DATABASE" < scripts/mysql-migration/schema.sql
```

5. Run migration in staging.

```bash
node scripts/mysql-migration/migrate-mongo-to-mysql.js
```

6. Validate staging.

Run count checks from the migration output, then spot-check these workflows against the MySQL-backed app:

- login for admin, trainer, and member
- member list and member profile
- trainer list and trainer schedule
- membership payment history and approval
- product list and admin product CRUD
- notices, gallery, contact leads, notifications, and measurements

7. Production cutover.

Preferred low-risk option:

- Put the app in short maintenance mode.
- Take a fresh `mongodump`.
- Run `schema.sql` against a clean MySQL production DB.
- Run the migration script.
- Point production backend to MySQL code/config.
- Run smoke tests.
- Reopen traffic.

Zero-downtime option:

- Add dual-write support in the application: every write goes to MongoDB and MySQL.
- Backfill historical MongoDB data into MySQL.
- Compare counts and checksums while traffic continues.
- Switch reads to MySQL behind a feature flag.
- Keep dual-write for one release window.
- Disable Mongo writes only after confidence checks pass.

This repository does not currently include a MySQL data access layer, so a true zero-downtime migration requires implementing dual-write/read-switch code before cutover.

## Transformation Rules

- Mongo ObjectIds are stored as `mongo_id` for traceability.
- MySQL auto-increment `id` columns are used for primary and foreign keys.
- Embedded objects are split into one-to-one or child tables.
- Arrays of references become join/child tables.
- Arbitrary gateway and notification metadata remain JSON because they are gateway/provider-specific and can vary.
- Missing nullable fields become `NULL`.
- Missing required strings use safe defaults where the current Mongoose schema already has defaults.
- Invalid enum values are coerced to the backend default and reported as warnings when they affect references.
- Missing required foreign keys skip the child row instead of creating broken data.
- Duplicate `phone`, `email`, or `qrCodeId` records fail preflight because they would violate production uniqueness.

## Data Integrity Controls

- The MySQL schema uses foreign keys for all relational references.
- Migration order is dependency-safe: users first, then classes, then dependent tables.
- The loader uses transactions per major phase.
- Imports are idempotent via `ON DUPLICATE KEY UPDATE` on `mongo_id`.
- The loader verifies collection/table counts after import.
- The inspector reports duplicate user identifiers before migration.

## Backup Strategy

- Take `mongodump` before every staging and production migration attempt.
- Take a MySQL dump immediately after a successful import:

```bash
mysqldump -h "$MYSQL_HOST" -u "$MYSQL_USER" -p "$MYSQL_DATABASE" > classic_fitness_park-mysql-post-import.sql
```

- Keep MongoDB read-only and available until MySQL has completed a full production verification window.

## Rollback Plan

Before cutover:

- Drop or recreate the target MySQL database.
- Restore from the latest MongoDB backup if needed.
- Keep the app pointed to MongoDB.

After cutover:

- Switch backend environment/config back to MongoDB.
- Revert the deployment to the last MongoDB-backed release.
- If dual-write was enabled, reconcile any MySQL-only writes back into MongoDB before rollback.
- If maintenance-mode cutover was used, rollback is simply redeploying the MongoDB-backed version and reopening traffic.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Duplicate user phone/email/QR values | Inspector and migration preflight fail before writes. Resolve duplicates in MongoDB first. |
| Missing referenced user/class/trainer | Loader warns and skips rows requiring missing users; optional references become `NULL`. |
| Large base64 photos/screenshots/QR images | Stored in `MEDIUMTEXT`, but production should move these to object storage and keep URLs in MySQL. |
| App still uses Mongoose | Migration only moves data. Production deployment also needs a MySQL data access rewrite or ORM layer. |
| Long cutover window | Use staging rehearsals, indexes already defined in `schema.sql`, and a final maintenance window or dual-write strategy. |
| JSON metadata shape changes | Gateway and notification metadata stay JSON to avoid losing provider-specific fields. |

## Deployment Considerations

- Use managed MySQL with automated backups, point-in-time recovery, TLS, and private networking.
- Create a least-privilege MySQL user for the app and a separate migration user for imports.
- Tune connection pooling in the future MySQL app layer.
- Enable slow query logs during staging and first production week.
- Keep MongoDB backups for at least one full billing/membership cycle after migration.
- Add integration tests for all API routes before replacing Mongoose queries with SQL queries.
