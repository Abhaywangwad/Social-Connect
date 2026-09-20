import crypto from 'crypto';

/**
 * Generates a cryptographically secure random token.
 * Default is 32 bytes (256 bits of entropy), returned as a 64-character hex string.
 *
 * @param {number} [bytes=32]
 * @returns {string} Hex-encoded random string
 */
export const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Computes the SHA-256 cryptographic hash of a raw token.
 * High-entropy random tokens (such as refresh tokens, password reset tokens,
 * and email verification tokens) are hashed before database storage to prevent
 * plaintext token compromise if the database is leaked or accessed.
 *
 * @param {string} token
 * @returns {string} SHA-256 hex digest
 */
export const hashToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Token to hash must be a non-empty string');
  }
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
};

export default {
  generateRandomToken,
  hashToken,
};
