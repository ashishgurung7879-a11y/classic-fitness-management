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

module.exports = {
  normalizeOptionalEmail,
  normalizePhone
};
