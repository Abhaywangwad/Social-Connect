import { verifyToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';
import metrics from '../utils/metrics.js';

/**
 * Socket.IO Authentication Middleware.
 *
 * Authenticates incoming socket connections during the handshake.
 * Supports token passed in socket.handshake.auth.token or Authorization header.
 *
 * Security:
 * - Never trusts client-supplied user IDs; identity is strictly extracted from verified JWT.
 * - Masks internal JWT errors and stack traces to prevent info leakage.
 * - Never logs raw tokens or sensitive headers during authentication failures.
 */
export const socketAuth = (socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization;
    let token = socket.handshake.auth?.token;

    if (!token && authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else {
        token = authHeader.trim();
      }
    }

    if (!token) {
      metrics.recordSocketAuthFailure();
      logger.warn('[Socket.IO] Authentication handshake rejected: token missing', {
        socketId: socket.id,
        transport: socket.conn?.transport?.name,
      });

      const err = new Error('Authentication token required');
      err.data = {
        code: 'AUTHENTICATION_FAILED',
        message: 'Authentication token required',
      };
      return next(err);
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      metrics.recordSocketAuthFailure();
      logger.warn('[Socket.IO] Authentication handshake rejected: invalid token payload', {
        socketId: socket.id,
      });

      const err = new Error('Invalid token payload');
      err.data = {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid token payload',
      };
      return next(err);
    }

    // Attach authenticated identity to socket
    socket.user = {
      userId: (decoded.sub || decoded.userId).toString(),
      sessionId: decoded.sid || decoded.sessionId ? (decoded.sid || decoded.sessionId).toString() : null,
    };

    next();
  } catch (error) {
    metrics.recordSocketAuthFailure();
    logger.warn('[Socket.IO] Authentication handshake failed: token verification error', {
      socketId: socket.id,
      errorName: error.name,
    });

    const err = new Error('Authentication failed');
    err.data = {
      code: 'AUTHENTICATION_FAILED',
      message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or malformed token',
    };
    next(err);
  }
};

export default socketAuth;
