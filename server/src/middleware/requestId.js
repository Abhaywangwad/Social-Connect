import crypto from 'crypto';

/**
 * Middleware that attaches or propagates a unique X-Request-ID to every request.
 * Useful for correlating client requests, log entries, and socket events.
 */
export const requestIdMiddleware = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  // Enforce reasonable length and format if client supplied one, else generate a secure UUID
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0 && incomingId.length <= 64
      ? incomingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

export default requestIdMiddleware;
