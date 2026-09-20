import AppError from './AppError.js';

/**
 * ApiError is an alias for AppError to maintain backward compatibility
 * while standardizing error formats across the entire codebase.
 */
class ApiError extends AppError {}

export default ApiError;
