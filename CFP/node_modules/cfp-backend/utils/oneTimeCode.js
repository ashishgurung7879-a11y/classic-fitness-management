const crypto = require('crypto');

function generateOneTimeCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function hashOneTimeCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function verifyOneTimeCode(code, storedHash) {
  if (!code || !storedHash) return false;

  const incomingHash = Buffer.from(hashOneTimeCode(code), 'hex');
  const savedHash = Buffer.from(storedHash, 'hex');

  if (incomingHash.length !== savedHash.length) return false;
  return crypto.timingSafeEqual(incomingHash, savedHash);
}

module.exports = {
  generateOneTimeCode,
  hashOneTimeCode,
  verifyOneTimeCode
};
