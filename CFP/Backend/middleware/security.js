const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const forwarded = req.headers['x-forwarded-for'] || '';
  const host = req.hostname || req.headers.host || '';
  const localValues = [ip, forwarded, host].join(' ').toLowerCase();
  return localValues.includes('127.0.0.1') || localValues.includes('::1') || localValues.includes('localhost');
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalRequest,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalRequest,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

const securityHeaders = helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
});

function cleanValue(value) {
  if (typeof value === 'string') return value.replace(/[<>]/g, '').trim();
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value && typeof value === 'object') {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) cleaned[key] = cleanValue(val);
    return cleaned;
  }
  return value;
}

function isSafeObjectKey(key) {
  if (!key) return false;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  if (key.startsWith('$') || key.includes('.')) return false;
  return true;
}

function sanitize(req, res, next) {
  if (req.body) req.body = cleanValue(filterUnsafeKeys(req.body));
  if (req.query) req.query = cleanValue(filterUnsafeKeys(req.query));
  if (req.params) req.params = cleanValue(filterUnsafeKeys(req.params));
  next();
}

function filterUnsafeKeys(value) {
  if (Array.isArray(value)) return value.map(filterUnsafeKeys);
  if (!value || typeof value !== 'object') return value;

  const filtered = {};
  for (const [key, val] of Object.entries(value)) {
    if (!isSafeObjectKey(key)) continue;
    filtered[key] = filterUnsafeKeys(val);
  }
  return filtered;
}

module.exports = { apiLimiter, authLimiter, securityHeaders, sanitize };
