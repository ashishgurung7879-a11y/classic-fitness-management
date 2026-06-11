# Payment Persistence Migration Report

Generated before code changes for:

- `routes/_payments.js`
- `routes/manualPayments.js`
- `routes/paymentSettings.js`

Scope: replace remaining direct Mongoose persistence with the existing MySQL-backed model layer while preserving API URLs, request bodies, response bodies, status codes, and business logic.

## Route Side Effects

### `routes/_payments.js`

Mounted through `routes/payments.js` at `/api/payments`.

| API | Persistence side effects | External side effects | Status transitions |
| --- | --- | --- | --- |
| `POST /api/payments/esewa/initiate` | Inserts `payments` row with `status='pending'`, method `esewa`, amount fields, type, description, billing flag. | None. Builds gateway return URLs. | New payment starts `pending`. |
| `POST /api/payments/esewa/verify` | Reads `payments`; updates payment to `completed`, stores `gateway.esewaRefId`, sets `verified_at`; if membership, updates user membership. | Queues/delivers membership activation SMS notification through `utils/notifications`. | `pending` or other non-completed -> `completed`; already `completed` returns unchanged. Production returns `409` before update. |
| `POST /api/payments/khalti/initiate` | Inserts `payments` row with `status='pending'`; later updates `gateway.pidx`. | Attempts Khalti initiate API with axios; falls back to test URL on failure. | New payment starts `pending`. |
| `POST /api/payments/khalti/verify` | Reads `payments`; updates payment to `completed`, stores `gateway.khaltiIdx`, sets `verified_at`; if membership, updates user membership. | Queues/delivers membership activation SMS notification. | `pending` or other non-completed -> `completed`; already `completed` returns unchanged. Production returns `409` before update. |
| `POST /api/payments/cash` | Inserts `payments` row already `completed`, sets `verified_at` and `verified_by`; if membership, updates user membership. | Queues/delivers membership activation SMS notification. | New payment starts `completed`. |
| `GET /api/payments/my` | Reads `payments` and `manual_payments` for authenticated user. | None. | None. Manual `verified` is mapped to client `completed` only in response. |
| `GET /api/payments/` | Reads `payments`, `manual_payments`, revenue aggregates. | None. | None. Query `status=completed` maps manual payments to `verified`; `status=failed` maps manual payments to `rejected`. |
| `PUT /api/payments/:id/verify` | Updates a `payments` row to `completed`, sets `verified_at` and `verified_by`; if membership, updates user membership. | Queues/delivers membership activation SMS notification. | Any found payment -> `completed`. |
| `PUT /api/payments/:id/approve` | If normal payment exists: updates `payments` to `completed`, sets verifier fields, updates membership. Otherwise updates `manual_payments` to `verified`, sets admin note and verifier fields, updates membership. | Queues/delivers membership activation SMS notification. | Payment -> `completed`; manual payment -> `verified`. |
| `PUT /api/payments/:id/approved` | Same behavior as `/:id/approve`. | Queues/delivers membership activation SMS notification. | Payment -> `completed`; manual payment -> `verified`. |
| `PUT /api/payments/:id/reject` | If normal payment exists: updates `payments` to `failed`, sets verifier fields and `gateway.rejectReason`. Otherwise updates `manual_payments` to `rejected`, sets admin note and verifier fields. | None. | Payment -> `failed`; manual payment -> `rejected`. |
| `POST /api/payments/screenshot` | Inserts `payments` row `pending`, method normalized from request, stores truncated/full screenshot data in gateway JSON. | None. | New payment starts `pending`. |
| `POST /api/payments/qr/:gateway` | Upserts QR setting under `payment_settings`; replaces method rows in `payment_setting_methods`; sets `updated_by`. | None. | None. |
| `GET /api/payments/qr/:gateway` | Reads QR setting/method rows. | None. | None. |
| `POST /api/payments/submit` | Admin with `userId`: inserts `payments` row `pending`. Normal member: inserts `manual_payments` row `pending`, plan derived from description, `reference_id` set from `requestedStartDate`. | None. | New payment starts `pending`. |

Membership updates in `_payments.js`:

- `activateMembership(payment, options)`: only runs when `payment.type === 'membership'`.
- Updates `users` through `User.findById(...).save()`, persisted in MySQL as `user_memberships`.
- Sets `plan`, `startDate`, `endDate`, `isActive=true`, and preserves existing `memberId` or creates `CFP-{year}-{random4}`.
- `approvedStartDate` and `duration` from admin request can override start/duration; yearly payment defaults to 365 days, otherwise 30 days.
- `activateManualMembership(payment, options)`: same fields, always non-yearly; default duration 30 days unless `duration` is provided.

Trainer updates in `_payments.js`: none.

Notifications in `_payments.js`:

- Membership activation calls `sendMembershipActivatedNotification`.
- That inserts into `notifications`, then attempts SMS delivery if configured, updating notification `status`, `sent_at`, and `error`.

### `routes/manualPayments.js`

Mounted at `/api/manual-payments`.

| API | Persistence side effects | External side effects | Status transitions |
| --- | --- | --- | --- |
| `POST /api/manual-payments/submit` | Inserts `manual_payments` row with request payment method, plan, amount, reference ID, screenshot, default `pending`. | None. | New manual payment starts `pending`. |
| `GET /api/manual-payments/my` | Reads authenticated user's `manual_payments`. | None. | None. |
| `GET /api/manual-payments/all` | Reads/counts `manual_payments`, optionally by status, populates user. | None. | None. |
| `GET /api/manual-payments/:id` | Reads one `manual_payments` row, populates user membership fields. | None. | None. |
| `PUT /api/manual-payments/:id/verify` | Updates manual payment to `verified`, sets admin note, verifier, timestamp; updates user membership for 30 days. | None in this route. Unlike `_payments.js`, it does not send membership activation notification. | Any found manual payment -> `verified`. |
| `PUT /api/manual-payments/:id/reject` | Updates manual payment to `rejected`, sets admin note, verifier, timestamp. | None. | Any found manual payment -> `rejected`. |

Membership updates in `manualPayments.js`:

- On verify only, updates `user_memberships` for the payment user.
- Sets `plan`, `startDate=now`, `endDate=now+30 days`, `isActive=true`, and preserves existing `memberId` or creates `CFP-{year}-{random4}`.

Trainer updates in `manualPayments.js`: none.

Notifications in `manualPayments.js`: none.

### `routes/paymentSettings.js`

Mounted at `/api/payment-settings`.

| API | Persistence side effects | External side effects | Status transitions |
| --- | --- | --- | --- |
| `GET /api/payment-settings/` | Reads `payment_settings` and `payment_setting_methods`, merges with defaults. | None. | None. |
| `PUT /api/payment-settings/:method` | Upserts `payment_settings` key `qr_payment_methods`; replaces child rows in `payment_setting_methods`; sets `updated_by`. | None. | None. |

Membership updates in `paymentSettings.js`: none.

Trainer updates in `paymentSettings.js`: none.

Notifications in `paymentSettings.js`: none.

## Tables Affected

- `payments`: gateway payment initiation, verification, approval, rejection, screenshot proof, cash payment records.
- `manual_payments`: manual QR/bank proof submission, approval, rejection, history.
- `payment_settings`: QR payment setting parent row keyed by `qr_payment_methods`.
- `payment_setting_methods`: child method settings for `esewa`, `prabhu_bank`, and `khalti`.
- `users`: read for ownership, role checks via auth middleware, payment membership activation lookup.
- `user_memberships`: membership activation writes.
- `notifications`: membership activation notification creation and SMS status updates.

No trainer-specific tables are changed by these three files.

## Mongoose Model to MySQL Table Map

| Mongoose model / schema | MySQL table(s) |
| --- | --- |
| `User` | `users`, `user_memberships`, `trainer_profiles`, `trainer_specialities`, `user_fitness_data`, `user_stats` |
| `Product` | `products` |
| `Class` | `classes`, `class_enrollments` |
| `Booking` | `bookings` |
| `Attendance` | `attendance` |
| `Payment` | `payments` |
| `ManualPayment` | `manual_payments` |
| `Notification` | `notifications` |
| `Gallery` | `gallery_images` |
| `Notice` | `notices` |
| `ContactLead` | `contact_leads` |
| `TrainerSchedule` | `trainer_schedules` |
| `Measurement` | `measurements` |
| inline `PaymentSetting` in `_payments.js` and `paymentSettings.js` | `payment_settings`, `payment_setting_methods` |

## API Preservation Requirements

The migration must preserve:

- Mounted URLs: `/api/payments`, `/api/manual-payments`, `/api/payment-settings`.
- Request body field names and validation behavior.
- Response field names, messages, and status codes.
- Mongoose-style `_id` public IDs in response bodies.
- Existing response-only status mapping where manual `verified` becomes client `completed` in payment lists.

## Planned Persistence Change

- Replace inline Mongoose schema definitions in the three route files with imports from `models/models.js`.
- Use the existing MySQL-backed `Payment`, `ManualPayment`, and `PaymentSetting` compatibility models.
- Do not change route names, validators, response shapes, status codes, or membership/notification logic.
- Remove `mongoose` and transitive MongoDB packages from runtime dependencies after route code no longer imports them.

