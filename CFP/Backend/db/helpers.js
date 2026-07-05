const crypto = require('crypto');

function generatePublicId() {
  return crypto.randomBytes(12).toString('hex');
}

function publicId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') {
    if (value._id) return publicId(value._id);
    if (value.mongo_id) return publicId(value.mongo_id);
    if (value.id) return publicId(value.id);
  }
  return String(value);
}

function isPlaceholderId(value) {
  return publicId(value) === '000000000000000000000000';
}

function isValidPublicId(value) {
  const id = publicId(value);
  return !!id && (/^\d+$/.test(id) || /^[a-f0-9]{24}$/i.test(id));
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return !!fallback;
  return !(value === false || value === 'false' || value === 0 || value === '0');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value);
  return str === '' ? null : str;
}

function parseJson(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function omitUndefined(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

module.exports = {
  generatePublicId,
  publicId,
  isPlaceholderId,
  isValidPublicId,
  toDate,
  toDateOnly,
  bool,
  number,
  nullableString,
  parseJson,
  stringifyJson,
  omitUndefined
};
