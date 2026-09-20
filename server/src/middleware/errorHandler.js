import { ZodError } from 'zod';
import config from '../config/config.js';
import logger, { sanitizeUrl, maskSecrets } from '../utils/logger.js';
import AppError from '../utils/AppError.js';
import errorTracker from '../utils/errorTracker.js';

/**
 * Global centralized error-handling middleware.
 * Standardizes all application, validation, database, and system errors into
 * a predictable error envelope:
 * {
 *   success: false,
 *   message: "...",
 *   error: {
 *     code: "...",
 *     message: "...",
 *     requestId: "...",
 *     details?: [...]
 *   }
 * }
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || AppError.getDefaultCode(statusCode);
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;

  // 1. Handle Zod Schema Validation Errors
  if (err instanceof ZodError || err.name === 'ZodError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const rawIssues = Array.isArray(err.issues)
      ? err.issues
      : Array.isArray(err.errors)
      ? err.errors
      : [];
    details = rawIssues.map((e) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
    message = details.length > 0
      ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(', ')
      : err.message || 'Validation failed';
  }
  // 2. Handle Mongoose Validation Errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    details = Object.values(err.errors || {}).map((val) => ({
      field: val.path,
      message: val.message,
    }));
    message = details.map((d) => d.message).join(', ');
  }
  // 3. Handle Mongoose Duplicate Key Error (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    code = 'RESOURCE_CONFLICT';
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} is already taken`;
    details = [{ field, message }];
  }
  // 4. Handle Mongoose Invalid ObjectId CastError
  else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid format for resource identifier: ${err.value}`;
    details = [{ field: err.path, message }];
  }
  // 5. Handle Database Connectivity & Timeout Errors
  else if (
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoTimeoutError' ||
    err.name === 'MongoNetworkError'
  ) {
    statusCode = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'Database service is temporarily unavailable. Please retry shortly.';
  }
  // 6. Handle JWT Authentication & Expiration Errors
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired. Please refresh your session.';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Authentication token is invalid or malformed.';
  }
  // 7. Handle Multer Upload Errors
  else if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    if (err.code === 'LIMIT_FILE_SIZE') {
      code = 'FILE_TOO_LARGE';
      message = 'File too large. Maximum allowed size is 10 MB per image.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      code = 'TOO_MANY_FILES';
      message = 'Too many files. A post cannot exceed 10 images.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      code = 'UNEXPECTED_FIELD';
      message = `Unexpected upload field: '${err.field}'. Use 'media'.`;
    } else {
      message = `Upload error: ${err.message}`;
    }
    details = [{ code: err.code, message }];
  }
  // 8. Handle Malformed JSON payload syntax error
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Malformed JSON in request body';
  }

  // 9. Process and Track Unexpected Server Errors (500+)
  if (statusCode >= 500) {
    const sanitizedRoute = sanitizeUrl(req?.originalUrl || req?.url);
    logger.error(`[UnhandledError] ${err.message}`, {
      requestId: req?.id,
      route: sanitizedRoute,
      method: req?.method,
      statusCode,
      errorCode: code,
      stack: err.stack,
    });

    // Capture in error tracking client with sanitized credentials
    // IMPORTANT: mask req.body before capturing — it may contain plaintext
    // passwords (e.g. on a failed login request). F-04.
    errorTracker.captureException(err, {
      requestId: req?.id,
      route: sanitizedRoute,
      method: req?.method,
      statusCode,
      body: req?.body ? maskSecrets(req.body) : undefined,
    });

    if (config.isProd) {
      message = 'An unexpected internal server error occurred. Please try again later.';
      details = null;
    }
  }

  const responseBody = {
    success: false,
    message,
    error: {
      code,
      message,
      requestId: req?.id || null,
      ...(details ? { details } : {}),
    },
    ...(config.isDev && { stack: err.stack }),
  };

  res.status(statusCode).json(responseBody);
};

/**
 * 404 handler — catches requests that didn't match any route.
 * Register this BEFORE the errorHandler but AFTER all routes.
 */
export const notFound = (req, _res, next) => {
  const error = new AppError(404, `Route not found: ${req.originalUrl}`, 'ROUTE_NOT_FOUND');
  next(error);
};
