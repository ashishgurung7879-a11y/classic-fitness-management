const { getBooleanEnv, getEnv, getEnvSource, getNumberEnv, getTrimmedEnv } = require('./env');

function getRequiredEnv(name) {
  const value = getTrimmedEnv(name);
  if (!value) {
    throw new Error(`${name} is required. Set it in Backend/.env or in cPanel Node.js App environment variables.`);
  }
  return value;
}

function buildSslConfig(url) {
  const sslEnabled = getBooleanEnv('MYSQL_SSL', false) || url?.searchParams.get('ssl') === 'true';
  if (!sslEnabled) return undefined;

  return {
    rejectUnauthorized: getEnv('MYSQL_SSL_REJECT_UNAUTHORIZED', 'true') !== 'false',
  };
}

function buildDatabaseConfig() {
  const mysqlUrl = getTrimmedEnv('MYSQL_URL');

  if (mysqlUrl) {
    const parsed = new URL(mysqlUrl);

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname.replace(/^\/+/, ''),
      waitForConnections: true,
      connectionLimit: getNumberEnv('MYSQL_CONNECTION_LIMIT', 10),
      queueLimit: 0,
      namedPlaceholders: false,
      decimalNumbers: true,
      ssl: buildSslConfig(parsed),
    };
  }

  return {
    host: getTrimmedEnv('MYSQL_HOST', 'localhost'),
    port: getNumberEnv('MYSQL_PORT', 3306),
    user: getRequiredEnv('MYSQL_USER'),
    password: getEnv('MYSQL_PASSWORD', ''),
    database: getRequiredEnv('MYSQL_DATABASE'),
    waitForConnections: true,
    connectionLimit: getNumberEnv('MYSQL_CONNECTION_LIMIT', 10),
    queueLimit: 0,
    namedPlaceholders: false,
    decimalNumbers: true,
    ssl: buildSslConfig(),
  };
}

function getSafeDatabaseConfig() {
  const config = buildDatabaseConfig();

  return {
    source: getTrimmedEnv('MYSQL_URL') ? 'MYSQL_URL' : 'MYSQL_*',
    host: config.host,
    hostSource: getEnvSource('MYSQL_HOST'),
    port: config.port,
    portSource: getEnvSource('MYSQL_PORT'),
    user: config.user,
    userSource: getEnvSource('MYSQL_USER'),
    database: config.database,
    databaseSource: getEnvSource('MYSQL_DATABASE'),
    passwordSet: Boolean(config.password),
    passwordSource: getEnvSource('MYSQL_PASSWORD'),
    passwordLength: String(config.password || '').length,
    ssl: Boolean(config.ssl),
    connectionLimit: config.connectionLimit,
  };
}

module.exports = {
  buildDatabaseConfig,
  getSafeDatabaseConfig,
};
