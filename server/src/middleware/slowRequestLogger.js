import config from '../config/config.js';
import logger, { sanitizeUrl } from '../utils/logger.js';

/**
 * Middleware that monitors API request execution durations and logs warnings
 * for slow operations exceeding the threshold (configurable, default: 500ms).
 */
export const slowRequestLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const thresholdMs = config.slowRequestThresholdMs || 500;

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    if (durationMs >= thresholdMs) {
      const sanitizedRoute = sanitizeUrl(req.originalUrl || req.url);
      logger.warn(`[SLOW_REQUEST] ${req.method} ${sanitizedRoute} took ${durationMs.toFixed(2)}ms`, {
        requestId: req.id,
        method: req.method,
        route: sanitizedRoute,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        thresholdMs,
      });
    }
  });

  next();
};

export default slowRequestLogger;
