import User from '../../src/models/User.js';
import { sessionService } from '../../src/services/sessionService.js';
import { generateAccessToken } from '../../src/utils/jwt.js';

import bcrypt from 'bcryptjs';

let userCounter = 0;

/**
 * Creates and persists a test user in MongoDB.
 *
 * @param {Object} [overrides]
 * @returns {Promise<import('../../src/models/User.js').default>}
 */
export const createTestUser = async (overrides = {}) => {
  userCounter++;
  const uniqueTag = `${Date.now()}_${userCounter}`;

  const rawPassword = overrides.password || 'Password123!';
  const hashedPassword = rawPassword.startsWith('$2')
    ? rawPassword
    : await bcrypt.hash(rawPassword, 8); // Fast 8 rounds for test efficiency

  const defaultData = {
    username: `testuser_${uniqueTag}`,
    email: `testuser_${uniqueTag}@example.com`,
    password: hashedPassword,
    fullName: `Test User ${userCounter}`,
    bio: 'Test user bio description',
    isVerified: true,
    role: 'USER',
    accountStatus: 'ACTIVE',
  };

  const user = await User.create({
    ...defaultData,
    ...overrides,
    password: hashedPassword,
  });

  return user;
};

/**
 * Creates and persists an administrator user.
 *
 * @param {Object} [overrides]
 * @returns {Promise<import('../../src/models/User.js').default>}
 */
export const createAdminUser = async (overrides = {}) => {
  return createTestUser({
    role: 'ADMIN',
    ...overrides,
  });
};

/**
 * Creates a valid session and returns authenticated tokens and auth headers.
 *
 * @param {Object} user
 * @returns {Promise<{ accessToken: string, refreshToken: string, session: Object, authHeader: { Authorization: string } }>}
 */
export const loginTestUser = async (user) => {
  const { session, rawRefreshToken } = await sessionService.createSession({
    userId: user._id,
    userAgent: 'vitest-agent',
    ipAddress: '127.0.0.1',
  });

  const accessToken = generateAccessToken({
    userId: user._id,
    sessionId: session._id,
  });

  return {
    user,
    session,
    accessToken,
    refreshToken: rawRefreshToken,
    authHeader: { Authorization: `Bearer ${accessToken}` },
  };
};

/**
 * Generates an Authorization header object.
 *
 * @param {string} token
 * @returns {{ Authorization: string }}
 */
export const getAuthHeader = (token) => ({
  Authorization: `Bearer ${token}`,
});

export default {
  createTestUser,
  createAdminUser,
  loginTestUser,
  getAuthHeader,
};
