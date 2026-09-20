/**
 * Standard Application Error class.
 * Encapsulates HTTP status code, standardized error code string,
 * user-friendly message, and optional structured details.
 */
class AppError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || AppError.getDefaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static getDefaultCode(statusCode) {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'RATE_LIMIT_EXCEEDED';
      case 500:
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details = null) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, message, code);
  }

  static conflict(message = 'Resource already exists', code = 'CONFLICT') {
    return new AppError(409, message, code);
  }

  static tooManyRequests(message = 'Too many requests, please try again later.', code = 'RATE_LIMIT_EXCEEDED') {
    return new AppError(429, message, code);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR') {
    return new AppError(500, message, code);
  }
}

export default AppError;
