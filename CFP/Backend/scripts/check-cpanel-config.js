const { getSafeDatabaseConfig } = require('../config/database');
const { getEnv, getTrimmedEnv, validateEnvironment } = require('../config/env');

function printConfigSummary() {
  const database = getSafeDatabaseConfig();

  console.log('cPanel config check passed.');
  console.log('Runtime:', {
    node: process.version,
    nodeEnv: getTrimmedEnv('NODE_ENV', 'development'),
    port: getEnv('PORT') ? '<set by environment>' : '<not set; app will use 5000>',
    frontendUrl: getTrimmedEnv('FRONTEND_URL') || '<not set>',
  });
  console.log('MySQL:', database);
}

async function checkDatabaseConnection() {
  const { healthCheck, pool } = require('../db/mysql');

  try {
    const healthy = await healthCheck();
    if (!healthy) {
      throw new Error('SELECT 1 health check returned an unexpected result.');
    }

    console.log('MySQL connection check passed.');
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  validateEnvironment();
  printConfigSummary();

  if (process.argv.includes('--db')) {
    await checkDatabaseConnection();
  } else {
    console.log('Database login was not tested. Run npm run check:cpanel:db after importing schema.sql.');
  }
}

main().catch((err) => {
  console.error('cPanel config check failed:', err.message);
  if (err.code || err.errno || err.sqlState) {
    console.error('Database error:', {
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
    });
  }
  process.exit(1);
});
