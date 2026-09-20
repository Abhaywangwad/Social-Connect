import ApiError from './ApiError.js';

/**
 * Validates registration input data.
 * Throws ApiError.badRequest with a clear message if validation fails.
 *
 * @param {Object} data
 * @param {string} data.username
 * @param {string} data.email
 * @param {string} data.password
 * @param {string} data.fullName
 * @returns {Object} normalized input data
 */
export const validateRegistrationInput = ({ username, email, password, fullName }) => {
  // 1. Check presence of required fields
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw ApiError.badRequest('Username is required');
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Password is required');
  }

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    throw ApiError.badRequest('Full name is required');
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedFullName = fullName.trim();

  // 2. Validate username
  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    throw ApiError.badRequest('Username must be between 3 and 30 characters');
  }

  const usernameRegex = /^[a-zA-Z0-9_.]+$/;
  if (!usernameRegex.test(trimmedUsername)) {
    throw ApiError.badRequest(
      'Username can only contain letters, numbers, underscores, and periods'
    );
  }

  // 3. Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    throw ApiError.badRequest('Please provide a valid email address');
  }

  // 4. Validate password policy
  if (password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    throw ApiError.badRequest('Password cannot exceed 128 characters');
  }

  // Password complexity: at least one letter and one number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    throw ApiError.badRequest(
      'Password must contain at least one letter and one number'
    );
  }

  // 5. Validate fullName
  if (trimmedFullName.length < 2 || trimmedFullName.length > 50) {
    throw ApiError.badRequest('Full name must be between 2 and 50 characters');
  }

  return {
    username: trimmedUsername.toLowerCase(),
    email: trimmedEmail,
    password,
    fullName: trimmedFullName,
  };
};

/**
 * Validates login input credentials.
 * Throws ApiError.badRequest if fields are missing or invalid format.
 *
 * @param {Object} data
 * @param {string} data.email
 * @param {string} data.password
 * @returns {Object} normalized input data
 */
export const validateLoginInput = ({ email, password }) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw ApiError.badRequest('Email is required');
  }

  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Password is required');
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
};

/**
 * Validates a password against application complexity rules.
 *
 * @param {string} password
 * @returns {string} Validated password
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    throw ApiError.badRequest('Password is required');
  }

  if (password.length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    throw ApiError.badRequest('Password cannot exceed 128 characters');
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    throw ApiError.badRequest(
      'Password must contain at least one letter and one number'
    );
  }

  return password;
};

