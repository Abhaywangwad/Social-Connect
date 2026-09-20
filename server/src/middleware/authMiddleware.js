import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';

/**
 * Authentication middleware.
 *
 * Verifies the JWT provided in the Authorization header.
 * Attaches the verified user ID to req.user for downstream protected controllers.
 */
export const authenticate = (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check if Authorization header exists
    if (!authHeader) {
      throw ApiError.unauthorized('Authentication token required');
    }

    // 2. Validate Bearer format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
      throw ApiError.unauthorized(
        "Invalid authorization format. Format must be 'Bearer <token>'"
      );
    }

    const token = parts[1].trim();

    // 3. Verify token and decode payload
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token has expired. Please log in again.');
      }
      throw ApiError.unauthorized('Invalid authentication token');
    }

    // 4. Attach verified user identity and session to request
    req.user = {
      userId: decoded.sub || decoded.userId,
      sessionId: decoded.sid || decoded.sessionId || null,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware.
 * If Authorization header is provided and valid, attaches req.user.
 * Does not fail if header is missing or token is invalid/expired.
 */
export const optionalAuthenticate = (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer' && parts[1].trim()) {
        try {
          const decoded = verifyToken(parts[1].trim());
          req.user = {
            userId: decoded.sub || decoded.userId,
            sessionId: decoded.sid || decoded.sessionId || null,
          };
        } catch (_) {
          // Ignore invalid or expired token for optional auth
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

