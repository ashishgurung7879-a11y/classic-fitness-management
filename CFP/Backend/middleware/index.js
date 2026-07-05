const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { apiLimiter, sanitize, securityHeaders } = require('./security');

function applyCoreMiddleware(app, allowedOrigins) {
  app.set('trust proxy', 1);

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
    credentials: true,
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
}

function applyRequestLogging(app, nodeEnv) {
  if (nodeEnv === 'production') return;

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

function applyFrontendStaticFiles(app) {
  const frontendSourcePath = path.join(__dirname, '..', '..', 'frontend');
  const frontendDistPath = path.join(frontendSourcePath, 'dist');
  const frontendPublicPath = path.join(frontendSourcePath, 'public');
  const frontendGymPhotosPath = path.join(frontendSourcePath, 'gym-photos');
  const hasBuiltFrontend = fs.existsSync(path.join(frontendDistPath, 'index.html'));
  const frontendPath = hasBuiltFrontend ? frontendDistPath : frontendSourcePath;
  const frontendIndexPath = path.join(frontendPath, 'index.html');
  const hasFrontendIndex = fs.existsSync(frontendIndexPath);

  if (!hasFrontendIndex) return;

  app.use(express.static(frontendPath));
  app.use('/gym-photos', express.static(frontendGymPhotosPath));

  if (!hasBuiltFrontend) {
    app.use(express.static(frontendPublicPath));
  }

  app.get(['/', '/index.html'], (req, res) => {
    sendFrontendIndex(res, frontendIndexPath);
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (path.extname(req.path)) return next();

    sendFrontendIndex(res, frontendIndexPath);
  });
}

function sendFrontendIndex(res, frontendIndexPath) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(frontendIndexPath);
}

function applyNotFoundHandler(app) {
  app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
  });
}

function applyErrorHandler(app) {
  app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack || err.message);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Server Error' });
  });
}

module.exports = {
  applyCoreMiddleware,
  applyErrorHandler,
  applyFrontendStaticFiles,
  applyNotFoundHandler,
  applyRequestLogging,
};
