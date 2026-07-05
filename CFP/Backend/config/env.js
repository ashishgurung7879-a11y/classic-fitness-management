const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envFilePath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');

const trackedKeys = [
  'NODE_ENV',
  'DEBUG_ENV',
  'PORT',
  'JWT_SECRET',
  'JWT_EXPIRE',
  'FRONTEND_URL',
  'MYSQL_URL',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_CONNECTION_LIMIT',
  'MYSQL_SSL',
  'MYSQL_SSL_REJECT_UNAUTHORIZED',
];

const keysAlreadySet = new Set(
  trackedKeys.filter((key) => Object.prototype.hasOwnProperty.call(process.env, key))
);

const dotenvResult = dotenv.config({ path: envFilePath });
const parsedEnv = dotenvResult.parsed || {};
const rawEnvValues = readRawEnvFile(envFilePath);

preserveRawSecretValues();

function readRawEnvFile(filePath) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const values = {};

    contents.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
      if (!match) return;

      values[match[1]] = normalizeRawEnvValue(match[2]);
    });

    return values;
  } catch (err) {
    return {};
  }
}

function normalizeRawEnvValue(value) {
  const trimmed = String(value || '').trim();
  const quote = trimmed[0];

  if (quote === '"' || quote === "'") {
    for (let index = 1; index < trimmed.length; index += 1) {
      if (trimmed[index] === quote && trimmed[index - 1] !== '\\') {
        return trimmed.slice(1, index);
      }
    }
  }

  return trimmed;
}

function preserveRawSecretValues() {
  ['JWT_SECRET', 'MYSQL_PASSWORD'].forEach((name) => {
    if (keysAlreadySet.has(name)) return;
    if (!Object.prototype.hasOwnProperty.call(rawEnvValues, name)) return;

    process.env[name] = rawEnvValues[name];
  });
}

function getEnv(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

function getTrimmedEnv(name, fallback = '') {
  return String(getEnv(name, fallback)).trim();
}

function getNumberEnv(name, fallback) {
  const rawValue = getEnv(name, '');
  if (rawValue === '') return fallback;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number.`);
  }

  return value;
}

function getBooleanEnv(name, fallback = false) {
  const rawValue = String(getEnv(name, '')).trim().toLowerCase();
  if (!rawValue) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(rawValue);
}

function getEnvSource(name) {
  if (keysAlreadySet.has(name)) return 'process';
  if (Object.prototype.hasOwnProperty.call(parsedEnv, name)) return '.env';
  return 'default';
}

function describeValue(name) {
  const rawValue = process.env[name] || '';
  const isSecret = /PASSWORD|SECRET|TOKEN|KEY/i.test(name);

  return {
    name,
    source: getEnvSource(name),
    set: rawValue.length > 0,
    value: isSecret ? '<redacted>' : rawValue,
    length: rawValue.length,
    leadingWhitespace: /^\s/.test(rawValue),
    trailingWhitespace: /\s$/.test(rawValue),
    hasWhitespace: /\s/.test(rawValue),
    wrappedInQuotes:
      rawValue.length >= 2 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))),
  };
}

function validateNoWhitespace(name) {
  const value = getTrimmedEnv(name);
  if (/\s/.test(value)) {
    throw new Error(
      `${name} contains whitespace. cPanel MySQL names should not contain spaces; check Backend/.env and cPanel environment variables.`
    );
  }
}

function validateEnvironment() {
  const jwtSecret = getEnv('JWT_SECRET');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('Missing or weak JWT_SECRET. Set a strong secret with at least 32 characters.');
  }

  const mysqlUrl = getTrimmedEnv('MYSQL_URL');
  if (mysqlUrl) {
    try {
      const parsed = new URL(mysqlUrl);
      if (!parsed.hostname || !parsed.username || !parsed.pathname.replace(/^\/+/, '')) {
        throw new Error('MYSQL_URL must include host, username, and database name.');
      }
    } catch (err) {
      throw new Error(`MYSQL_URL is invalid. ${err.message}`);
    }

    getNumberEnv('MYSQL_CONNECTION_LIMIT', 10);
    return;
  }

  validateNoWhitespace('MYSQL_HOST');
  validateNoWhitespace('MYSQL_USER');
  validateNoWhitespace('MYSQL_DATABASE');

  if (!getTrimmedEnv('MYSQL_USER')) throw new Error('MYSQL_USER is required.');
  if (!getTrimmedEnv('MYSQL_DATABASE')) throw new Error('MYSQL_DATABASE is required.');

  getNumberEnv('MYSQL_PORT', 3306);
  getNumberEnv('MYSQL_CONNECTION_LIMIT', 10);
}

function getAllowedOrigins() {
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
    'http://127.0.0.1:5000',
  ];

  const configuredOrigins = getEnv('FRONTEND_URL')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set([...configuredOrigins, ...defaultFrontendOrigins]));
}

function logEnvironmentDiagnostics() {
  console.log('Environment diagnostics:', {
    nodeEnv: getTrimmedEnv('NODE_ENV', 'development'),
    cwd: process.cwd(),
    serverDir: path.join(__dirname, '..'),
    envFilePath,
    envFileLoaded: !dotenvResult.error,
    envFileError: dotenvResult.error ? dotenvResult.error.message : undefined,
    values: [
      describeValue('PORT'),
      describeValue('FRONTEND_URL'),
      describeValue('MYSQL_URL'),
      describeValue('MYSQL_HOST'),
      describeValue('MYSQL_PORT'),
      describeValue('MYSQL_USER'),
      describeValue('MYSQL_PASSWORD'),
      describeValue('MYSQL_DATABASE'),
    ],
  });
}

module.exports = {
  getAllowedOrigins,
  getBooleanEnv,
  getEnv,
  getEnvSource,
  getNumberEnv,
  getTrimmedEnv,
  logEnvironmentDiagnostics,
  validateEnvironment,
};
