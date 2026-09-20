import jwt from 'jsonwebtoken';
import config from '../config/config.js';

const ALLOWED_ALGORITHMS = ['HS256'];

/**
 * Generates a signed Access Token with minimal standard claims.
 *
 * @param {Object} param0
 * @param {string} param0.userId Authenticated user's ObjectId
 * @param {string} [param0.sessionId] Active session identifier
 * @param {string|number} [expiresIn=config.jwtAccessExpiresIn]
 * @returns {string} Signed JWT
 */
export const generateAccessToken = ({ userId, sessionId = null }, expiresIn = config.jwtAccessExpiresIn) => {
  const payload = {
    sub: userId.toString(),
    userId: userId.toString(), // backward compatibility
  };

  if (sessionId) {
    payload.sid = sessionId.toString();
    payload.sessionId = sessionId.toString(); // backward compatibility
  }

  return jwt.sign(payload, config.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn,
  });
};

/**
 * Verifies an Access Token against expected signing secret and enforced algorithm.
 *
 * @param {string} token
 * @returns {Object} Decoded payload with normalized sub and sid
 */
export const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, config.jwtAccessSecret, {
    algorithms: ALLOWED_ALGORITHMS,
  });

  // Normalize claims for caller convenience
  decoded.userId = decoded.sub || decoded.userId;
  decoded.sessionId = decoded.sid || decoded.sessionId || null;

  return decoded;
};

/**
 * Generates a signed JSON Web Token with a minimal payload.
 * Maintained for backward compatibility across existing modules.
 *
 * @param {Object} payload Data to encode in the token (e.g. { userId })
 * @param {string|number} [expiresIn=config.jwtAccessExpiresIn] Token expiration time
 * @returns {string} Signed JWT
 */
export const generateToken = (payload, expiresIn = config.jwtAccessExpiresIn) => {
  const normalized = { ...payload };
  if (normalized.userId && !normalized.sub) {
    normalized.sub = normalized.userId.toString();
  }
  if (normalized.sessionId && !normalized.sid) {
    normalized.sid = normalized.sessionId.toString();
  }

  return jwt.sign(normalized, config.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn,
  });
};

/**
 * Verifies a JSON Web Token and returns its decoded payload.
 * Maintained for backward compatibility. Enforces HS256.
 *
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyToken = (token) => {
  return verifyAccessToken(token);
};

export default {
  generateAccessToken,
  verifyAccessToken,
  generateToken,
  verifyToken,
};

