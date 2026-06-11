-- Classic Fitness Park MongoDB -> MySQL production schema
-- Target: MySQL 8.0+, InnoDB, utf8mb4.
-- Run this against an empty production/staging database before migration.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(190) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migration_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  collection_name VARCHAR(190) NOT NULL,
  migrated_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  skipped_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  warning_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_migration_audit_collection (collection_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('member','trainer','admin') NOT NULL DEFAULT 'member',
  photo MEDIUMTEXT NULL,
  gender ENUM('male','female','other') NOT NULL DEFAULT 'male',
  date_of_birth DATE NULL,
  address TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  reset_otp VARCHAR(64) NULL,
  reset_otp_expiry DATETIME(3) NULL,
  qr_code_id VARCHAR(128) NULL,
  last_login DATETIME(3) NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_code VARCHAR(64) NULL,
  two_factor_expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_mongo_id (mongo_id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_qr_code_id (qr_code_id),
  KEY idx_users_role_status (role, approval_status),
  KEY idx_users_active (is_active),
  KEY idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan ENUM('none','starter','pro','elite') NOT NULL DEFAULT 'none',
  start_date DATETIME(3) NULL,
  end_date DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  member_id VARCHAR(128) NULL,
  shift ENUM('morning','afternoon','evening','night','multi') NOT NULL DEFAULT 'morning',
  due_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_memberships_user_id (user_id),
  KEY idx_user_memberships_plan (plan),
  KEY idx_user_memberships_end_date (end_date),
  KEY idx_user_memberships_member_id (member_id),
  CONSTRAINT fk_user_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trainer_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  application_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  experience DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  certifications TEXT NULL,
  bio TEXT NULL,
  applied_at DATETIME(3) NULL,
  approved_at DATETIME(3) NULL,
  rejection_reason TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trainer_profiles_user_id (user_id),
  KEY idx_trainer_profiles_status (application_status),
  CONSTRAINT fk_trainer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trainer_specialities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  trainer_profile_id BIGINT UNSIGNED NOT NULL,
  speciality VARCHAR(190) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trainer_speciality (trainer_profile_id, speciality),
  KEY idx_trainer_specialities_speciality (speciality),
  CONSTRAINT fk_trainer_specialities_profile FOREIGN KEY (trainer_profile_id) REFERENCES trainer_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_fitness_data (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  height DECIMAL(8,2) NULL,
  weight DECIMAL(8,2) NULL,
  goal VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_fitness_data_user_id (user_id),
  CONSTRAINT fk_user_fitness_data_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_stats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  total_workouts INT UNSIGNED NOT NULL DEFAULT 0,
  attendance_days INT UNSIGNED NOT NULL DEFAULT 0,
  calories_burned INT UNSIGNED NOT NULL DEFAULT 0,
  total_classes INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_stats_user_id (user_id),
  CONSTRAINT fk_user_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  name VARCHAR(190) NOT NULL,
  type VARCHAR(80) NOT NULL DEFAULT 'general',
  description TEXT NULL,
  trainer_id BIGINT UNSIGNED NULL,
  day_of_week TINYINT UNSIGNED NULL,
  start_time VARCHAR(16) NULL,
  end_time VARCHAR(16) NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 60,
  capacity INT UNSIGNED NOT NULL DEFAULT 20,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_classes_mongo_id (mongo_id),
  KEY idx_classes_trainer (trainer_id),
  KEY idx_classes_schedule (day_of_week, start_time),
  KEY idx_classes_active (is_active),
  CONSTRAINT fk_classes_trainer FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_enrollments_class_user (class_id, user_id),
  KEY idx_class_enrollments_user (user_id),
  CONSTRAINT fk_class_enrollments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_class_enrollments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NULL,
  trainer_id BIGINT UNSIGNED NULL,
  booking_at DATETIME(3) NOT NULL,
  type ENUM('class','pt_session') NOT NULL DEFAULT 'class',
  status ENUM('confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  notes TEXT NULL,
  class_name VARCHAR(190) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_mongo_id (mongo_id),
  KEY idx_bookings_user_date (user_id, booking_at),
  KEY idx_bookings_trainer_date (trainer_id, booking_at),
  KEY idx_bookings_status (status),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_trainer FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  checkin_at DATETIME(3) NOT NULL,
  checkout_at DATETIME(3) NULL,
  duration_minutes INT UNSIGNED NULL,
  method ENUM('qr','manual','app') NOT NULL DEFAULT 'qr',
  marked_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_mongo_id (mongo_id),
  KEY idx_attendance_user_checkin (user_id, checkin_at),
  KEY idx_attendance_checkin (checkin_at),
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_marked_by FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('membership','product','pt_session') NOT NULL DEFAULT 'membership',
  description TEXT NULL,
  amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  method ENUM('esewa','khalti','cash','prabhu_bank') NOT NULL,
  status ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  billing_is_yearly TINYINT(1) NOT NULL DEFAULT 0,
  gateway_json JSON NULL,
  verified_at DATETIME(3) NULL,
  verified_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_mongo_id (mongo_id),
  KEY idx_payments_user_created (user_id, created_at),
  KEY idx_payments_status_method (status, method),
  KEY idx_payments_verified_by (verified_by),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manual_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('esewa','prabhu_bank','khalti') NOT NULL,
  plan ENUM('starter','pro','elite') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference_id VARCHAR(190) NULL,
  screenshot MEDIUMTEXT NULL,
  status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  admin_note TEXT NULL,
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_manual_payments_mongo_id (mongo_id),
  KEY idx_manual_payments_user_created (user_id, created_at),
  KEY idx_manual_payments_status (status),
  KEY idx_manual_payments_reference (reference_id),
  CONSTRAINT fk_manual_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_manual_payments_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  name VARCHAR(190) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  sale_price DECIMAL(12,2) NULL,
  description TEXT NULL,
  category ENUM('protein','vitamins','gear','apparel','drinks','other') NOT NULL DEFAULT 'other',
  emoji VARCHAR(32) NULL,
  image_url TEXT NULL,
  badge VARCHAR(80) NULL,
  stock INT NOT NULL DEFAULT 50,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  rating_avg DECIMAL(4,2) NOT NULL DEFAULT 4.50,
  rating_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_mongo_id (mongo_id),
  KEY idx_products_category_active (category, is_active),
  KEY idx_products_created_at (created_at),
  FULLTEXT KEY ft_products_name_description (name, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gallery_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  title VARCHAR(190) NULL,
  image_url TEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'gym',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  added_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_gallery_images_mongo_id (mongo_id),
  KEY idx_gallery_images_category_active (category, is_active),
  CONSTRAINT fk_gallery_images_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  type VARCHAR(80) NOT NULL DEFAULT 'announcement',
  title VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  color VARCHAR(32) NOT NULL DEFAULT '#CC0000',
  emoji VARCHAR(32) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notices_mongo_id (mongo_id),
  KEY idx_notices_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  name VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  type VARCHAR(80) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status ENUM('new','in_progress','closed') NOT NULL DEFAULT 'new',
  admin_note TEXT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'website',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_contact_leads_mongo_id (mongo_id),
  KEY idx_contact_leads_status_created (status, created_at),
  KEY idx_contact_leads_email (email),
  KEY idx_contact_leads_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('sms') NOT NULL DEFAULT 'sms',
  type ENUM('login_welcome','member_approved','membership_activated','membership_expiring','password_reset','custom') NOT NULL,
  title VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  sent_to VARCHAR(190) NOT NULL,
  status ENUM('pending','sent','skipped','failed') NOT NULL DEFAULT 'pending',
  sent_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  error TEXT NULL,
  dedupe_key VARCHAR(255) NULL,
  meta_json JSON NULL,
  triggered_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_mongo_id (mongo_id),
  KEY idx_notifications_user_created (user_id, created_at),
  KEY idx_notifications_status (status),
  KEY idx_notifications_dedupe_key (dedupe_key),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_triggered_by FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trainer_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  trainer_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NULL,
  start_time VARCHAR(16) NULL,
  end_time VARCHAR(16) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  booked_slots INT UNSIGNED NOT NULL DEFAULT 0,
  max_slots INT UNSIGNED NOT NULL DEFAULT 5,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trainer_schedules_mongo_id (mongo_id),
  KEY idx_trainer_schedules_trainer_day (trainer_id, day_of_week, start_time),
  CONSTRAINT fk_trainer_schedules_trainer FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS measurements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  trainer_id BIGINT UNSIGNED NULL,
  measured_at DATETIME(3) NOT NULL,
  height DECIMAL(8,2) NULL,
  weight DECIMAL(8,2) NULL,
  forearms DECIMAL(8,2) NULL,
  biceps DECIMAL(8,2) NULL,
  chest DECIMAL(8,2) NULL,
  abdomen DECIMAL(8,2) NULL,
  thighs DECIMAL(8,2) NULL,
  calves DECIMAL(8,2) NULL,
  notes TEXT NULL,
  recorded_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_measurements_mongo_id (mongo_id),
  KEY idx_measurements_member_measured (member_id, measured_at),
  KEY idx_measurements_trainer (trainer_id),
  CONSTRAINT fk_measurements_member FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_measurements_trainer FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_measurements_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mongo_id CHAR(24) NOT NULL,
  setting_key VARCHAR(190) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_settings_mongo_id (mongo_id),
  UNIQUE KEY uq_payment_settings_key (setting_key),
  CONSTRAINT fk_payment_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_setting_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_setting_id BIGINT UNSIGNED NOT NULL,
  method_key VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  color VARCHAR(32) NULL,
  helper TEXT NULL,
  image_url MEDIUMTEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_setting_methods_key (payment_setting_id, method_key),
  CONSTRAINT fk_payment_setting_methods_setting FOREIGN KEY (payment_setting_id) REFERENCES payment_settings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (name) VALUES ('001_mongodb_to_mysql_base_schema');

SET FOREIGN_KEY_CHECKS = 1;
