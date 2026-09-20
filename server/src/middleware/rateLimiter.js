import ApiError from '../utils/ApiError.js';

// In-memory hit tracker: key -> { count, resetTime }
const rateLimitStores = new Map();

/**
 * Creates an in-memory sliding-window rate limiting middleware.
 *
 * @param {Object} options
 * @param {number} options.windowMs Window duration in milliseconds
 * @param {number} options.max Max requests allowed within window
 * @param {string} [options.message]
 * @param {Function} [options.keyGenerator]
 * @returns {import('express').RequestHandler}
 */
export const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = 'Too many requests, please try again later.',
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
}) => {
  const store = new Map();
  rateLimitStores.set(store, { windowMs });

  return (req, res, next) => {
    // Allow unit-test bypass ONLY when running in the test environment.
    // This header MUST NOT be accepted in development or production, as any
    // client could use it to bypass rate limiting entirely (F-01).
    if (process.env.NODE_ENV === 'test' && req.headers['x-skip-rate-limit'] === 'true') {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - 1));
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
      return next();
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return next(ApiError.tooManyRequests(message));
    }

    next();
  };
};

/**
 * Login Rate Limiter:
 * Keyed on IP + normalized email to prevent targeted credential stuffing
 * while preventing single-IP lockouts across entire organizational subnets.
 */
export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `login:${ip}:${email}`;
  },
});

export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many registration requests from this IP. Please try again later.',
  keyGenerator: (req) => `reg:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

export const forgotPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
  keyGenerator: (req) => `forgot:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

export const resendVerificationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many verification email requests. Please try again in an hour.',
  keyGenerator: (req) => `resend:${req.user?.userId || req.ip || 'unknown'}`,
});

export const resetPasswordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many password reset attempts. Please try again later.',
  keyGenerator: (req) => `reset:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

export const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: 'Too many token refresh requests. Please try again later.',
  keyGenerator: (req) => `refresh:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

export const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  message: 'Too many requests from this IP. Please slow down.',
  keyGenerator: (req) => `global:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

export const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 search queries per minute
  message: 'Search rate limit exceeded. Please wait a minute before searching again.',
  keyGenerator: (req) => `search:${req.user?.userId || req.ip || 'unknown'}`,
});

export const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 reports per hour
  message: 'Too many reports submitted. Please try again later.',
  keyGenerator: (req) => `report:${req.user?.userId || req.ip || 'unknown'}`,
});

export const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute
  message: 'Messaging rate limit exceeded. Please slow down.',
  keyGenerator: (req) => `msg:${req.user?.userId || req.ip || 'unknown'}`,
});

export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 uploads per minute
  message: 'Upload rate limit exceeded. Please wait a moment before uploading again.',
  keyGenerator: (req) => `upload:${req.user?.userId || req.ip || 'unknown'}`,
});

/**
 * Admin Rate Limiter:
 * Applied to all /api/admin/* endpoints.
 * 100 requests per 15 minutes per IP — generous enough for active moderation
 * work but protective against scripted enumeration or abuse.
 */
export const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Admin API rate limit exceeded. Please slow down.',
  keyGenerator: (req) => `admin:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
});

/**
 * Clears all rate limiter stores (used in test setup/teardown).
 */
export const resetRateLimiters = () => {
  for (const [store] of rateLimitStores.entries()) {
    store.clear();
  }
};

export default {
  createRateLimiter,
  globalLimiter,
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  refreshLimiter,
  searchLimiter,
  reportLimiter,
  messageLimiter,
  uploadLimiter,
  adminLimiter,
  resetRateLimiters,
};

