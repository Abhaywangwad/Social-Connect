import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import sessionService from './sessionService.js';
import emailService from './emailService.js';
import { generateRandomToken, hashToken } from '../utils/cryptoUtils.js';
import { generateAccessToken } from '../utils/jwt.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';
import {
  validateRegistrationInput,
  validateLoginInput,
  validatePassword,
} from '../utils/validation.js';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Formats a user document into a safe response object (omits password/internal keys).
 *
 * @param {Object} user Mongoose user document
 * @returns {Object} Safe user object
 */
export const formatSafeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  bio: user.bio,
  profilePicture: user.profilePicture || null,
  isPrivate: user.isPrivate,
  isVerified: user.isVerified,
  emailVerified: Boolean(user.emailVerified),
  emailVerifiedAt: user.emailVerifiedAt || null,
  createdAt: user.createdAt,
});

/**
 * Registers a new user account, sends an initial email verification token.
 *
 * @param {Object} userData
 * @returns {Promise<Object>} Safe user representation
 */
export const registerUser = async (userData, context = {}) => {
  // 1. Input validation & normalization
  const { username, email, password, fullName } = validateRegistrationInput(userData);

  // 2. Duplicate checks
  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    throw ApiError.conflict('Username is already taken');
  }

  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    throw ApiError.conflict('Email is already registered');
  }

  // 3. Hash password securely
  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // 4. Create and persist the user document
  let user;
  try {
    user = await User.create({
      username,
      email,
      password: hashedPassword,
      fullName,
      emailVerified: false,
      emailVerifiedAt: null,
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      const capitalizedField =
        duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1);
      throw ApiError.conflict(`${capitalizedField} is already taken`);
    }
    throw error;
  }

  // 5. Generate and dispatch email verification token
  try {
    const rawVerificationToken = generateRandomToken(32);
    const verificationTokenHash = hashToken(rawVerificationToken);

    await EmailVerificationToken.create({
      user: user._id,
      tokenHash: verificationTokenHash,
      expiresAt: new Date(Date.now() + config.emailVerificationExpiresIn),
    });

    await emailService.sendVerificationEmail(user.email, rawVerificationToken);
  } catch (emailErr) {
    console.error('[authService] Failed to send verification email on register:', emailErr.message);
  }

  // Record audit log for successful user registration
  await auditService.createAuditLog({
    actor: user._id,
    action: 'USER_REGISTERED',
    targetType: 'USER',
    targetId: user._id,
    metadata: { username: user.username, email: user.email },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return formatSafeUser(user);
};

/**
 * Authenticates user credentials, establishes a server-side session,
 * and mints short-lived Access Token and secure Refresh Token.
 *
 * @param {Object} credentials { email, password }
 * @param {Object} [metadata] { userAgent, ipAddress, requestId }
 * @returns {Promise<{ user: Object, accessToken: string, rawRefreshToken: string }>}
 */
export const loginUser = async (credentials, { userAgent = '', ipAddress = '', requestId = '' } = {}) => {
  // 1. Validate incoming login payload
  const { email, password } = validateLoginInput(credentials);

  // 2. Lookup user by email (request password hash explicitly)
  const user = await User.findOne({ email }).select('+password');

  // Constant-time security check against user enumeration
  if (!user) {
    await auditService.createAuditLog({
      actor: null,
      action: 'USER_LOGIN_FAILED',
      targetType: 'USER',
      targetId: null,
      metadata: { identifier: email, reason: 'INVALID_CREDENTIALS' },
      userAgent,
      ipAddress,
      requestId,
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 3. Compare candidate password with stored bcrypt hash
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await auditService.createAuditLog({
      actor: user._id,
      action: 'USER_LOGIN_FAILED',
      targetType: 'USER',
      targetId: user._id,
      metadata: { identifier: email, reason: 'INVALID_CREDENTIALS' },
      userAgent,
      ipAddress,
      requestId,
    });
    throw ApiError.unauthorized('Invalid email or password');
  }

  // 4. Check account status — suspended accounts cannot log in
  if (user.accountStatus === 'SUSPENDED') {
    await auditService.createAuditLog({
      actor: user._id,
      action: 'USER_LOGIN_FAILED',
      targetType: 'USER',
      targetId: user._id,
      metadata: { identifier: email, reason: 'ACCOUNT_SUSPENDED' },
      userAgent,
      ipAddress,
      requestId,
    });
    throw ApiError.forbidden(
      'Your account has been suspended. Please contact support for assistance.',
      'ACCOUNT_SUSPENDED'
    );
  }

  // 5. Create server-side Session document with hashed refresh token
  const { session, rawRefreshToken } = await sessionService.createSession({
    userId: user._id,
    userAgent,
    ipAddress,
    requestId,
  });

  // 6. Generate short-lived signed Access Token with minimal claims (sub, sid)
  const accessToken = generateAccessToken({
    userId: user._id,
    sessionId: session._id,
  });

  // Audit log for successful login
  await auditService.createAuditLog({
    actor: user._id,
    action: 'USER_LOGIN',
    targetType: 'USER',
    targetId: user._id,
    metadata: { sessionId: session._id.toString() },
    userAgent,
    ipAddress,
    requestId,
  });

  return {
    user: formatSafeUser(user),
    accessToken,
    rawRefreshToken,
  };
};

/**
 * Changes authenticated user password, revoking all existing sessions.
 *
 * @param {string} userId
 * @param {Object} param1 { currentPassword, newPassword }
 * @param {Object} [context]
 * @returns {Promise<{ message: string }>}
 */
export const changePassword = async (userId, { currentPassword, newPassword }, context = {}) => {
  if (!currentPassword || typeof currentPassword !== 'string') {
    throw ApiError.badRequest('Current password is required');
  }

  validatePassword(newPassword);

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw ApiError.unauthorized('Incorrect current password');
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from current password');
  }

  // Hash new password and save
  user.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await user.save();

  // Strict Security Policy: Invalidate all existing sessions on password change
  await sessionService.revokeAllUserSessions(userId, {
    reason: 'PASSWORD_CHANGED',
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
    audit: false, // Don't duplicate session revoke log, PASSWORD_CHANGED is primary
  });

  await auditService.createAuditLog({
    actor: userId,
    action: 'PASSWORD_CHANGED',
    targetType: 'USER',
    targetId: userId,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    message: 'Password changed successfully. Please log in again with your new credentials.',
  };
};

/**
 * Initiates forgot password recovery flow.
 * Employs anti-enumeration protection by returning generic response.
 *
 * @param {string} email
 * @returns {Promise<{ message: string }>}
 */
export const forgotPassword = async (email) => {
  const genericMessage =
    'If an account exists for this email, password reset instructions have been sent.';

  if (!email || typeof email !== 'string') {
    return { message: genericMessage };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    // Return identical message to prevent account enumeration
    return { message: genericMessage };
  }

  // Invalidate previous pending reset tokens for this user
  await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });

  // Generate secure single-use random token
  const rawResetToken = generateRandomToken(32);
  const tokenHash = hashToken(rawResetToken);

  await PasswordResetToken.create({
    user: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + config.passwordResetExpiresIn),
    usedAt: null,
  });

  await emailService.sendPasswordResetEmail(user.email, rawResetToken);

  return { message: genericMessage };
};

/**
 * Consumes a single-use password reset token and sets the new password.
 * Revokes all existing user sessions.
 *
 * @param {Object} param0 { token, newPassword }
 * @param {Object} [context]
 * @returns {Promise<{ message: string }>}
 */
export const resetPassword = async ({ token, newPassword }, context = {}) => {
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('Password reset token is required');
  }

  validatePassword(newPassword);

  const presentedHash = hashToken(token);
  const resetDoc = await PasswordResetToken.findOne({ tokenHash: presentedHash });

  if (!resetDoc || resetDoc.usedAt) {
    throw ApiError.badRequest('Invalid or already used password reset token');
  }

  if (resetDoc.expiresAt <= new Date()) {
    throw ApiError.badRequest('Password reset token has expired');
  }

  const user = await User.findById(resetDoc.user).select('+password');
  if (!user) {
    throw ApiError.notFound('Associated user account not found');
  }

  // Update password
  user.password = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await user.save();

  // Mark token as consumed
  resetDoc.usedAt = new Date();
  await resetDoc.save();

  // Invalidate all active user sessions
  await sessionService.revokeAllUserSessions(user._id, {
    reason: 'PASSWORD_RESET',
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
    audit: false,
  });

  await auditService.createAuditLog({
    actor: user._id,
    action: 'PASSWORD_RESET',
    targetType: 'USER',
    targetId: user._id,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    message: 'Password has been reset successfully. Please log in with your new password.',
  };
};

/**
 * Verifies user account email using single-use verification token.
 *
 * @param {string} token Raw token
 * @param {Object} [context]
 * @returns {Promise<{ message: string }>}
 */
export const verifyEmail = async (token, context = {}) => {
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('Verification token is required');
  }

  const presentedHash = hashToken(token);
  const tokenDoc = await EmailVerificationToken.findOne({ tokenHash: presentedHash });

  if (!tokenDoc || tokenDoc.usedAt) {
    throw ApiError.badRequest('Invalid or already used verification token');
  }

  if (tokenDoc.expiresAt <= new Date()) {
    throw ApiError.badRequest('Verification token has expired');
  }

  const user = await User.findById(tokenDoc.user);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await auditService.createAuditLog({
    actor: user._id,
    action: 'EMAIL_VERIFIED',
    targetType: 'USER',
    targetId: user._id,
    metadata: { email: user.email },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    message: 'Email verified successfully.',
  };
};

/**
 * Resends a fresh verification email to an unverified user.
 *
 * @param {string} userId
 * @returns {Promise<{ message: string }>}
 */
export const resendVerification = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.emailVerified) {
    return {
      message: 'Email is already verified.',
    };
  }

  // Invalidate previous unused verification tokens
  await EmailVerificationToken.deleteMany({ user: userId, usedAt: null });

  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);

  await EmailVerificationToken.create({
    user: userId,
    tokenHash,
    expiresAt: new Date(Date.now() + config.emailVerificationExpiresIn),
    usedAt: null,
  });

  await emailService.sendVerificationEmail(user.email, rawToken);

  return {
    message: 'Verification email has been resent.',
  };
};

/**
 * Retrieves safe profile data for an authenticated user ID.
 *
 * @param {string} userId
 * @returns {Promise<Object>} Safe user object
 */
export const getCurrentUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return formatSafeUser(user);
};

export default {
  formatSafeUser,
  registerUser,
  loginUser,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getCurrentUser,
};
