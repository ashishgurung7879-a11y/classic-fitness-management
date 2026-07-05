const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { query, pool } = require('../db/mysql');
const { generatePublicId } = require('../db/helpers');

const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const trainerPassword = process.env.SEED_TRAINER_PASSWORD;
const memberPassword = process.env.SEED_MEMBER_PASSWORD;

if (!adminPassword || !trainerPassword || !memberPassword) {
  console.error('Set SEED_ADMIN_PASSWORD, SEED_TRAINER_PASSWORD, and SEED_MEMBER_PASSWORD in Backend/.env before running npm run seed.');
  process.exit(1);
}

const users = [
  {
    firstName: 'CFP',
    lastName: 'Admin',
    email: 'admin@classicfitnesspark.com.np',
    phone: '9800000000',
    password: adminPassword,
    role: 'admin',
    approvalStatus: 'approved',
    isActive: true,
  },
  {
    firstName: 'Rajesh',
    lastName: 'Sharma',
    email: 'rajesh@cfp.com',
    phone: '9800000002',
    password: trainerPassword,
    role: 'trainer',
    approvalStatus: 'approved',
    isActive: true,
    trainerProfile: {
      applicationStatus: 'approved',
      experience: 5,
      bio: 'Demo trainer account for local testing.',
    },
  },
  {
    firstName: 'Ram',
    lastName: 'Sharma',
    email: 'ram@example.com',
    phone: '9800000003',
    password: memberPassword,
    role: 'member',
    approvalStatus: 'approved',
    isActive: true,
    membership: {
      plan: 'starter',
      isActive: true,
      memberId: 'CFP-DEMO-001',
      shift: 'morning',
      dueAmount: 0,
      paidAmount: 2500,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
];

async function seed() {
  try {
    console.log('Connected to MySQL');

    for (const userData of users) {
      const passwordHash = await bcrypt.hash(userData.password, 10);

      // Check if user already exists by email
      const existing = await query(
        'SELECT id, mongo_id FROM users WHERE email = ? LIMIT 1',
        [userData.email]
      );

      let userId;
      let mongoId;

      if (!existing[0]) {
        // CREATE new user
        mongoId = generatePublicId();
        const result = await query(
          `INSERT INTO users (mongo_id, first_name, last_name, email, phone, password_hash, role, is_active, approval_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            mongoId,
            userData.firstName,
            userData.lastName,
            userData.email,
            userData.phone,
            passwordHash,
            userData.role,
            userData.isActive ? 1 : 0,
            userData.approvalStatus || 'approved',
          ]
        );
        userId = result.insertId;
        console.log(`Created ${userData.role}: ${userData.email}`);
      } else {
        // UPDATE existing user
        userId = existing[0].id;
        mongoId = existing[0].mongo_id;
        await query(
          `UPDATE users SET first_name=?, last_name=?, phone=?, password_hash=?, role=?, is_active=1, approval_status=?, updated_at=NOW()
           WHERE id=?`,
          [
            userData.firstName,
            userData.lastName,
            userData.phone,
            passwordHash,
            userData.role,
            userData.approvalStatus || 'approved',
            userId,
          ]
        );
        console.log(`Updated ${userData.role}: ${userData.email}`);
      }

      // Upsert membership
      if (userData.membership) {
        const m = userData.membership;
        await query(
          `INSERT INTO user_memberships (user_id, plan, start_date, end_date, is_active, member_id, shift, due_amount, paid_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE plan=VALUES(plan), start_date=VALUES(start_date), end_date=VALUES(end_date),
             is_active=VALUES(is_active), member_id=VALUES(member_id), shift=VALUES(shift),
             due_amount=VALUES(due_amount), paid_amount=VALUES(paid_amount)`,
          [
            userId,
            m.plan || 'starter',
            m.startDate || new Date(),
            m.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            m.isActive ? 1 : 0,
            m.memberId || `CFP-${new Date().getFullYear()}-SEED`,
            m.shift || 'morning',
            Number(m.dueAmount || 0),
            Number(m.paidAmount || 0),
          ]
        );
      }

      // Upsert trainer profile
      if (userData.trainerProfile) {
        const tp = userData.trainerProfile;
        await query(
          `INSERT INTO trainer_profiles (user_id, application_status, experience, bio)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE application_status=VALUES(application_status), experience=VALUES(experience), bio=VALUES(bio)`,
          [userId, tp.applicationStatus || 'approved', Number(tp.experience || 0), tp.bio || '']
        );
      }
    }

    console.log('\n========================================');
    console.log('Seeding complete');
    console.log('Admin:   admin@classicfitnesspark.com.np');
    console.log('Trainer: rajesh@cfp.com');
    console.log('Member:  ram@example.com');
    console.log('Passwords come from your local Backend/.env seed variables.');
    console.log('========================================');
  } catch (err) {
    console.error('Seeder error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

seed();
