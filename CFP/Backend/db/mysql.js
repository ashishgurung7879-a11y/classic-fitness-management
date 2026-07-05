const mysql = require('mysql2/promise');
const { buildDatabaseConfig, getSafeDatabaseConfig } = require('../config/database');

const pool = mysql.createPool(buildDatabaseConfig());

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

function logDatabaseConfig() {
  console.log('MySQL diagnostics:', getSafeDatabaseConfig());
}

function formatDatabaseError(err) {
  return {
    message: err.message,
    code: err.code,
    errno: err.errno,
    sqlState: err.sqlState,
    sqlMessage: err.sqlMessage,
  };
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
  logDatabaseConfig,
  formatDatabaseError,
  isDuplicateError,
  getDuplicateField,
};
