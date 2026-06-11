const mysql = require('mysql2/promise');

function buildConfig() {
  if (process.env.MYSQL_URL) {
    const parsed = new URL(process.env.MYSQL_URL);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\/+/, ''),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      queueLimit: 0,
      namedPlaceholders: false,
      decimalNumbers: true,
      ssl: process.env.MYSQL_SSL === 'true' || parsed.searchParams.get('ssl') === 'true'
        ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
    };
  }

  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'classic_fitness_park',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    namedPlaceholders: false,
    decimalNumbers: true,
    ssl: process.env.MYSQL_SSL === 'true'
      ? { rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
  };
}

const pool = mysql.createPool(buildConfig());

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function healthCheck() {
  const rows = await query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

function isDuplicateError(err) {
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function getDuplicateField(err) {
  const message = String(err?.message || '');
  if (message.includes('uq_users_phone') || message.includes('phone')) return 'phone';
  if (message.includes('uq_users_email') || message.includes('email')) return 'email';
  if (message.includes('qr_code_id')) return 'qrCodeId';
  return 'unknown';
}

module.exports = {
  pool,
  query,
  transaction,
  healthCheck,
  isDuplicateError,
  getDuplicateField,
};
