// Classic Fitness Park backend v3.0
// API server for cPanel Node.js hosting.
const express = require('express');
const {
  getAllowedOrigins,
  getBooleanEnv,
  getNumberEnv,
  getTrimmedEnv,
  logEnvironmentDiagnostics,
  validateEnvironment,
} = require('./config/env');

const PORT = getNumberEnv('PORT', 5000);
const NODE_ENV = getTrimmedEnv('NODE_ENV', 'development');

// Validate environment values before DB-backed modules create a pool.
validateEnvironment();

const { formatDatabaseError, healthCheck, logDatabaseConfig } = require('./db/mysql');
const {
  applyCoreMiddleware,
  applyErrorHandler,
  applyFrontendStaticFiles,
  applyNotFoundHandler,
  applyRequestLogging,
} = require('./middleware');
const registerApiRoutes = require('./routes');

const app = express();

if (NODE_ENV !== 'production' || getBooleanEnv('DEBUG_ENV', false)) {
  logEnvironmentDiagnostics();
  logDatabaseConfig();
}

// Middleware
applyCoreMiddleware(app, getAllowedOrigins());
applyRequestLogging(app, NODE_ENV);

// Database
async function ensureDatabaseReady() {
  const healthy = await healthCheck();
  if (!healthy) {
    throw new Error('MySQL health check failed');
  }
}

// Routes
registerApiRoutes(app);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await ensureDatabaseReady();
    res.json({
      success: true,
      message: 'Classic Fitness Park API is running.',
      gym: 'Classic Fitness Park',
      location: 'Kakarvitta, Jhapa, Nepal',
      version: '3.0.0',
      mysql: 'Connected',
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Classic Fitness Park API database health check failed.',
      gym: 'Classic Fitness Park',
      location: 'Kakarvitta, Jhapa, Nepal',
      version: '3.0.0',
      mysql: 'Disconnected',
      error: NODE_ENV === 'production'
        ? { message: 'Database unavailable', code: err.code || 'DB_HEALTH_CHECK_FAILED' }
        : formatDatabaseError(err),
      time: new Date().toISOString(),
    });
  }
});

applyFrontendStaticFiles(app);

// 404
applyNotFoundHandler(app);

// Error handler
applyErrorHandler(app);

async function logStartupDatabaseState() {
  try {
    await ensureDatabaseReady();
    console.log('MySQL connection verified.');
  } catch (err) {
    console.error('MySQL health check failed at startup:', formatDatabaseError(err));
    console.error('Server is still running. Fix the MySQL credentials/grants, then check /api/health.');
  }
}

async function startServer() {
  await logStartupDatabaseState();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Classic Fitness Park API listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other server or change PORT.`);
      process.exit(1);
    }

    console.error('Server failed to start:', err.message);
    process.exit(1);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
