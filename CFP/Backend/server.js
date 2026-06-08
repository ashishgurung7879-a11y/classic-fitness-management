// ═══════════════════════════════════════════════
//  CLASSIC FITNESS PARK — BACKEND v3.0
//  Clean fresh backend — Port 5000
// ═══════════════════════════════════════════════
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { apiLimiter, sanitize, securityHeaders } = require('./middleware/security');
const User = require('./models/User');

const app = express();
app.set('trust proxy', 1);
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);
const defaultFrontendOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];
const configuredOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim()).filter(Boolean) : [];
const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultFrontendOrigins]));

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(' Missing or weak JWT_SECRET. Create Backend/.env from Backend/.env.example and set a strong secret.');
  process.exit(1);
}

// ── MIDDLEWARE ────────────────────────────────
app.use(securityHeaders);
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.vary('Origin');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.vary('Origin');
  }

  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === 'null') {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitize);
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use('/api', apiLimiter);

// Serve frontend pages from the backend host as well.
// Vite's `public/` files are requested from the web root, so we need to
// expose that directory explicitly when serving the raw frontend source.
const frontendSourcePath = path.join(__dirname, '../frontend');
const frontendDistPath = path.join(frontendSourcePath, 'dist');
const frontendPublicPath = path.join(frontendSourcePath, 'public');
const frontendGymPhotosPath = path.join(frontendSourcePath, 'gym-photos');
const hasBuiltFrontend = fs.existsSync(path.join(frontendDistPath, 'index.html'));
const frontendPath = hasBuiltFrontend ? frontendDistPath : frontendSourcePath;
const frontendIndexPath = path.join(frontendPath, 'index.html');

app.use(express.static(frontendPath));
app.use('/gym-photos', express.static(frontendGymPhotosPath));
if (!hasBuiltFrontend) {
  app.use(express.static(frontendPublicPath));
}

// Log all requests in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ── DATABASE ──────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/classic_fitness_park';
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log(' MongoDB Connected:', MONGO_URI.replace(/\/\/.*@/, '//***@'));
    try {
      await User.syncIndexes();
      console.log(' User indexes synced');
    } catch (indexErr) {
      console.error(' User index sync warning:', indexErr.message);
    }
  })
  .catch(err => {
    console.error(' MongoDB Error:', err.message);
    console.log(' Make sure MongoDB is running: services.msc → MongoDB Server → Start');
  });

// ── ROUTES ────────────────────────────────────
const authRouter = require('./routes/auth');
const membersRouter = require('./routes/members');
const bookingsRouter = require('./routes/bookings');
const payRouter = require('./routes/payments');        // ← was never mounted!
const trainersRouter = require('./routes/trainers');
const productsRouter = require('./routes/products');
const galleryRouter = require('./routes/gallery');
const classesRouter = require('./routes/classes');
const manualPaymentsRouter = require('./routes/manualPayments');
const contactRouter = require('./routes/contact');
const noticesRouter = require('./routes/notices');
const notificationsRouter = require('./routes/notifications');
const dashboardRouter = require('./routes/dashboard');
const paymentSettingsRouter = require('./routes/paymentSettings');
const measurementsRouter = require('./routes/measurements');
const { attendanceRouter } = require('./routes/attendance');

app.use('/api/auth', authRouter);
app.use('/api/members', membersRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/payments', payRouter);          // ← CRITICAL: was missing
app.use('/api/notifications', notificationsRouter);
app.use('/api/trainers', trainersRouter);
app.use('/api/products', productsRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/classes', classesRouter);
app.use('/api/manual-payments', manualPaymentsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/contact', contactRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/payment-settings', paymentSettingsRouter);
app.use('/api/measurements', measurementsRouter);

// ── HEALTH CHECK ─────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: ' Classic Fitness Park API is Running!',
    gym: 'Classic Fitness Park',
    location: 'Kakarvitta, Jhapa, Nepal',
    version: '3.0.0',
    mongodb: mongoose.connection.readyState === 1 ? ' Connected' : ' Disconnected',
    time: new Date().toISOString()
  });
});

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(frontendIndexPath);
});

// Route all non-API, extensionless requests to the React app so
// BrowserRouter pages such as /about or /membership work on refresh too.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  if (path.extname(req.path)) {
    return next();
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(frontendIndexPath);
});

// ── 404 ──────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ── ERROR HANDLER ─────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server Error' });
});

// ── START SERVER ──────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n══════════════════════════════════════');
  console.log('  CLASSIC FITNESS PARK v3.0');
  console.log(' Kakarvitta, Jhapa, Nepal');
  console.log(` http://localhost:${PORT}/api`);
  console.log(` http://localhost:${PORT}/api/health`);
  console.log('══════════════════════════════════════\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server or change PORT in Backend/.env.`);
    process.exit(1);
  }

  console.error('Server failed to start:', err.message);
  process.exit(1);
});

module.exports = app;
