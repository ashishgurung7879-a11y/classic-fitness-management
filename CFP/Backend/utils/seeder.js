const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');
const { pool } = require('../db/mysql');

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
      specialities: ['Strength Training', 'HIIT & Cardio'],
      certifications: 'CFP Demo Trainer',
      bio: 'Demo trainer account for local testing.',
      appliedAt: new Date(),
      approvedAt: new Date(),
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
      let user = await User.findOne({ email: userData.email }).select('+password');

      if (!user) {
        user = await User.create(userData);
        console.log(`Created ${userData.role}: ${userData.email}`);
        continue;
      }

      user.firstName = userData.firstName;
      user.lastName = userData.lastName;
      user.phone = userData.phone;
      user.role = userData.role;
      user.password = userData.password;
      user.approvalStatus = userData.approvalStatus || 'approved';
      user.isActive = true;

      if (userData.membership) {
        user.membership = {
          ...user.membership,
          ...userData.membership,
        };
      }

      if (userData.trainerProfile) {
        user.trainerProfile = {
          ...user.trainerProfile,
          ...userData.trainerProfile,
        };
      }

      await user.save();
      console.log(`Updated ${userData.role}: ${userData.email}`);
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
