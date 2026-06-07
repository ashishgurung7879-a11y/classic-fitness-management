function normalizeOptionalEmail(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  const digits = value.trim().replace(/\D/g, '');
  if (!digits) return '';

  // Keep Nepal numbers in one shape whether users type 98XXXXXXXX or +97798XXXXXXXX.
  if (digits.length === 13 && digits.startsWith('977') && digits[3] === '9') {
    return digits.slice(3);
  }

  return digits;
}

function getDuplicateField(err) {
  if (!err) return '';
  const keyPatternField = Object.keys(err.keyPattern || {})[0];
  if (keyPatternField) return keyPatternField;
  const keyValueField = Object.keys(err.keyValue || {})[0];
  if (keyValueField) return keyValueField;
  const match = err.message && err.message.match(/index:\s+([a-zA-Z0-9_]+)_1/i);
  return match ? match[1] : '';
}

module.exports = {
  normalizeOptionalEmail,
  normalizePhone,
  getDuplicateField
};
