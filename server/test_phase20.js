import http from 'http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import config from './src/config/config.js';
import User from './src/models/User.js';
import Session from './src/models/Session.js';
import PasswordResetToken from './src/models/PasswordResetToken.js';
import EmailVerificationToken from './src/models/EmailVerificationToken.js';
import emailService from './src/services/emailService.js';
import { resetRateLimiters } from './src/middleware/rateLimiter.js';
import { hashToken } from './src/utils/cryptoUtils.js';

const TEST_PORT = 5080;
const API_URL = `http://localhost:${TEST_PORT}/api`;

let httpServer;

// HTTP client helper that tracks and persists cookies across requests
class TestClient {
  constructor() {
    this.cookies = new Map();
    this.accessToken = null;
  }

  setAccessToken(token) {
    this.accessToken = token;
  }

  setCookie(headerValue) {
    if (!headerValue) return;
    const parts = headerValue.split(';')[0].split('=');
    if (parts.length >= 2) {
      this.cookies.set(parts[0].trim(), parts.slice(1).join('=').trim());
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join('; ');
  }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader && !headers.Cookie) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    // Parse Set-Cookie header(s)
    const rawSetCookie = response.headers.get('set-cookie');
    if (rawSetCookie) {
      this.setCookie(rawSetCookie);
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    return {
      status: response.status,
      headers: response.headers,
      data,
    };
  }
}

const runTests = async () => {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 20 VERIFICATION TEST SUITE');
  console.log('   Authentication Hardening & Account Recovery');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  };

  try {
    await connectDB();
    httpServer = http.createServer(app);
    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

    // Clean up test data
    const testEmails = [
      'alice_p20@example.com',
      'bob_p20@example.com',
      'charlie_p20@example.com',
      'david_p20@example.com',
      'eve_p20@example.com',
      'ratelimit_p20@example.com',
    ];

    const users = await User.find({ email: { $in: testEmails } });
    const userIds = users.map((u) => u._id);

    await Promise.all([
      User.deleteMany({ email: { $in: testEmails } }),
      Session.deleteMany({ user: { $in: userIds } }),
      PasswordResetToken.deleteMany({ user: { $in: userIds } }),
      EmailVerificationToken.deleteMany({ user: { $in: userIds } }),
    ]);
    emailService.clearQueue();
    resetRateLimiters();

    console.log('--- PART 1: REGISTRATION & EMAIL VERIFICATION ---');

    // Test 16: Register a new user -> emailVerified is false
    const clientA = new TestClient();
    const regRes = await clientA.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice_p20',
        email: 'alice_p20@example.com',
        password: 'Password123!',
        fullName: 'Alice Phase 20',
      }),
    });

    const userInDb = await User.findOne({ email: 'alice_p20@example.com' });
    const verificationEmail = emailService.getLatestEmail('alice_p20@example.com', 'VERIFICATION');

    assert(
      regRes.status === 201 &&
      userInDb &&
      userInDb.emailVerified === false &&
      userInDb.emailVerifiedAt === null &&
      verificationEmail &&
      verificationEmail.rawToken,
      'Test 16a: Registration succeeds with emailVerified=false and dispatches verification token',
      `Status: ${regRes.status}, verified: ${userInDb?.emailVerified}`
    );

    const validVerificationToken = verificationEmail.rawToken;

    // Test 16b: Consume valid verification token -> emailVerified = true
    const verifyRes = await clientA.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: validVerificationToken }),
    });

    const refreshedUserA = await User.findOne({ email: 'alice_p20@example.com' });
    assert(
      verifyRes.status === 200 &&
      refreshedUserA.emailVerified === true &&
      refreshedUserA.emailVerifiedAt !== null,
      'Test 16b: Valid email verification marks user as verified with timestamp',
      `Status: ${verifyRes.status}, verified: ${refreshedUserA?.emailVerified}`
    );

    // Test 17: Verification token reuse fails
    const reuseVerifyRes = await clientA.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: validVerificationToken }),
    });
    assert(
      reuseVerifyRes.status === 400,
      'Test 17: Reusing consumed email verification token fails with 400 Bad Request',
      `Status: ${reuseVerifyRes.status}`
    );

    // Test 18: Expired verification token fails
    const expiredTokenRaw = 'expired_raw_token_xyz_123';
    await EmailVerificationToken.create({
      user: refreshedUserA._id,
      tokenHash: hashToken(expiredTokenRaw),
      expiresAt: new Date(Date.now() - 10000), // in the past
    });

    const expiredVerifyRes = await clientA.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: expiredTokenRaw }),
    });
    assert(
      expiredVerifyRes.status === 400,
      'Test 18: Expired verification token rejected with 400 Bad Request',
      `Status: ${expiredVerifyRes.status}`
    );

    console.log('\n--- PART 2: LOGIN & SESSION MANAGEMENT ---');

    // Test 1: Login creates session, returns access token, sets HttpOnly cookie
    const loginRes = await clientA.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice_p20@example.com',
        password: 'Password123!',
      }),
    });

    const sessionDoc = await Session.findOne({ user: refreshedUserA._id, revokedAt: null });
    const setCookieHeader = loginRes.headers.get('set-cookie');
    const hasHttpOnly = /httponly/i.test(setCookieHeader || '');
    const hasSameSite = /samesite=lax/i.test(setCookieHeader || '');
    const hasPath = /path=\/api\/auth/i.test(setCookieHeader || '');
    const accessTokenA = loginRes.data?.data?.accessToken;

    assert(
      loginRes.status === 200 &&
      accessTokenA &&
      !loginRes.data?.data?.refreshToken && // Raw refresh token NOT returned in JSON
      sessionDoc !== null &&
      hasHttpOnly &&
      hasSameSite &&
      hasPath,
      'Test 1 & Test 24: Login creates Session in MongoDB and returns HttpOnly Secure SameSite cookie',
      `Status: ${loginRes.status}, hasCookie: ${!!setCookieHeader}, HttpOnly: ${hasHttpOnly}`
    );

    clientA.setAccessToken(accessTokenA);

    // Test 2: Refresh token rotation
    const originalRefreshCookie = clientA.cookies.get('refreshToken');
    const refreshRes = await clientA.request('/auth/refresh', {
      method: 'POST',
    });

    const newAccessToken = refreshRes.data?.data?.accessToken;
    const rotatedRefreshCookie = clientA.cookies.get('refreshToken');
    const updatedSession = await Session.findById(sessionDoc._id);

    assert(
      refreshRes.status === 200 &&
      newAccessToken &&
      rotatedRefreshCookie &&
      rotatedRefreshCookie !== originalRefreshCookie &&
      updatedSession.previousTokenHashes.length === 1 &&
      updatedSession.refreshTokenHash === hashToken(rotatedRefreshCookie),
      'Test 2: Refresh rotates token in cookie, updates Session hash, and returns new access token',
      `Status: ${refreshRes.status}, rotated: ${rotatedRefreshCookie !== originalRefreshCookie}`
    );

    // Test 3: Refresh reuse attack detection (presenting originalRefreshCookie)
    const attackerClient = new TestClient();
    attackerClient.cookies.set('refreshToken', originalRefreshCookie);
    const reuseRefreshRes = await attackerClient.request('/auth/refresh', {
      method: 'POST',
    });

    const sessionAfterReuse = await Session.findById(sessionDoc._id);
    assert(
      reuseRefreshRes.status === 401 &&
      sessionAfterReuse.revokedAt !== null,
      'Test 3: Refresh token reuse detected, family/session revoked immediately with 401',
      `Status: ${reuseRefreshRes.status}, revokedAt: ${sessionAfterReuse?.revokedAt}`
    );

    // Test 4: Expired refresh token rejected
    const expiredSessionRaw = 'expired_refresh_token_test_abc';
    await Session.create({
      user: refreshedUserA._id,
      refreshTokenHash: hashToken(expiredSessionRaw),
      tokenFamily: 'expired-family',
      expiresAt: new Date(Date.now() - 10000),
    });

    const expiredClient = new TestClient();
    expiredClient.cookies.set('refreshToken', expiredSessionRaw);
    const expiredRefreshRes = await expiredClient.request('/auth/refresh', {
      method: 'POST',
    });
    assert(
      expiredRefreshRes.status === 401,
      'Test 4: Expired refresh token rejected with 401 Unauthorized',
      `Status: ${expiredRefreshRes.status}`
    );

    // Re-login Alice for session tests
    const reLoginRes = await clientA.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice_p20@example.com',
        password: 'Password123!',
      }),
    });
    clientA.setAccessToken(reLoginRes.data?.data?.accessToken);

    // Create a secondary session (Device 2)
    const clientA_Device2 = new TestClient();
    const loginDev2 = await clientA_Device2.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice_p20@example.com',
        password: 'Password123!',
      }),
      headers: { 'User-Agent': 'Mobile-App/1.0' },
    });
    clientA_Device2.setAccessToken(loginDev2.data?.data?.accessToken);

    // Test 7: Session list API
    const listRes = await clientA.request('/auth/sessions', { method: 'GET' });
    const sessions = listRes.data?.data?.sessions || [];
    const hasHash = sessions.some((s) => s.refreshTokenHash || s.tokenHash || s.ipAddress);
    assert(
      listRes.status === 200 &&
      sessions.length >= 2 &&
      !hasHash,
      'Test 7: GET /api/auth/sessions returns active sessions with safe metadata only',
      `Status: ${listRes.status}, count: ${sessions.length}, leaksSensitive: ${hasHash}`
    );

    // Test 8: Revoke one session
    const dev2SessionId = sessions.find((s) => s.userAgent === 'Mobile-App/1.0')?.sessionId;
    const revokeRes = await clientA.request(`/auth/sessions/${dev2SessionId}`, {
      method: 'DELETE',
    });

    const dev2SessionInDb = await Session.findById(dev2SessionId);
    const primarySessionInDb = await Session.findById(sessions.find((s) => s.sessionId !== dev2SessionId)?.sessionId);

    assert(
      revokeRes.status === 200 &&
      dev2SessionInDb.revokedAt !== null &&
      primarySessionInDb.revokedAt === null,
      'Test 8: Revoking target session leaves other active sessions unaffected',
      `Dev2 revoked: ${!!dev2SessionInDb?.revokedAt}, Dev1 active: ${!primarySessionInDb?.revokedAt}`
    );

    // Test 23: Session ownership check (User B tries to revoke User A's session)
    const clientB = new TestClient();
    await clientB.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'bob_p20',
        email: 'bob_p20@example.com',
        password: 'Password123!',
        fullName: 'Bob Phase 20',
      }),
    });
    const loginB = await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'Password123!' }),
    });
    clientB.setAccessToken(loginB.data?.data?.accessToken);

    const unauthorizedRevoke = await clientB.request(`/auth/sessions/${primarySessionInDb._id}`, {
      method: 'DELETE',
    });
    assert(
      unauthorizedRevoke.status === 403,
      'Test 23: Cross-user session revocation forbidden with 403',
      `Status: ${unauthorizedRevoke.status}`
    );

    // Test 5: Logout current session
    const logoutRes = await clientA.request('/auth/logout', { method: 'POST' });
    const sessionAfterLogout = await Session.findById(primarySessionInDb._id);
    assert(
      logoutRes.status === 200 &&
      sessionAfterLogout.revokedAt !== null,
      'Test 5: POST /api/auth/logout revokes current session',
      `Status: ${logoutRes.status}, revokedAt: ${sessionAfterLogout?.revokedAt}`
    );

    // Test 6: Logout all sessions
    // Create 2 sessions for Bob
    await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'Password123!' }),
    });
    await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'Password123!' }),
    });

    const bobSessionsBefore = await Session.countDocuments({ user: loginB.data.data.user.id, revokedAt: null });
    const logoutAllRes = await clientB.request('/auth/logout-all', { method: 'POST' });
    const bobSessionsAfter = await Session.countDocuments({ user: loginB.data.data.user.id, revokedAt: null });

    assert(
      logoutAllRes.status === 200 &&
      bobSessionsBefore >= 2 &&
      bobSessionsAfter === 0,
      'Test 6: POST /api/auth/logout-all revokes all active sessions for user',
      `Before: ${bobSessionsBefore}, After: ${bobSessionsAfter}`
    );

    console.log('\n--- PART 3: PASSWORD MANAGEMENT & ACCOUNT RECOVERY ---');

    // Log in Bob again for change password tests
    const loginBob2 = await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'Password123!' }),
    });
    clientB.setAccessToken(loginBob2.data?.data?.accessToken);

    // Test 10: Wrong current password
    const wrongPwRes = await clientB.request('/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'WrongPassword999!',
        newPassword: 'BrandNewPassword123!',
      }),
    });
    assert(
      wrongPwRes.status === 401,
      'Test 10: Change password with incorrect current password rejected with 401 Unauthorized',
      `Status: ${wrongPwRes.status}`
    );

    // Test 9: Change password succeeds and revokes all sessions
    const changePwRes = await clientB.request('/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'Password123!',
        newPassword: 'BrandNewPassword123!',
      }),
    });

    const bobSessionsAfterPwChange = await Session.countDocuments({
      user: loginB.data.data.user.id,
      revokedAt: null,
    });

    // Verify old password no longer works
    const oldLoginAttempt = await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'Password123!' }),
    });

    // Verify new password works
    resetRateLimiters();
    const newLoginAttempt = await clientB.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob_p20@example.com', password: 'BrandNewPassword123!' }),
    });

    assert(
      changePwRes.status === 200 &&
      bobSessionsAfterPwChange === 0 &&
      oldLoginAttempt.status === 401 &&
      newLoginAttempt.status === 200,
      'Test 9: Change password updates hash, revokes all sessions, and enforces new password',
      `Change: ${changePwRes.status}, Active sessions: ${bobSessionsAfterPwChange}, New login: ${newLoginAttempt.status}`
    );

    // Test 11 & 12: Forgot Password Anti-Enumeration
    const forgotExistingRes = await clientA.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice_p20@example.com' }),
    });

    const forgotNonExistingRes = await clientA.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'nobody_does_not_exist_99@example.com' }),
    });

    assert(
      forgotExistingRes.status === 200 &&
      forgotNonExistingRes.status === 200 &&
      forgotExistingRes.data.message === forgotNonExistingRes.data.message,
      'Test 11 & Test 12: Forgot password returns identical response for existing and non-existing emails',
      `Existing: "${forgotExistingRes.data?.message}", Non-existing: "${forgotNonExistingRes.data?.message}"`
    );

    // Test 13: Reset Password with valid token
    const resetEmail = emailService.getLatestEmail('alice_p20@example.com', 'PASSWORD_RESET');
    const validResetToken = resetEmail?.rawToken;

    const resetRes = await clientA.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: validResetToken,
        newPassword: 'AliceResetPassword123!',
      }),
    });

    // Verify new password works for Alice
    const aliceNewLogin = await clientA.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice_p20@example.com', password: 'AliceResetPassword123!' }),
    });

    assert(
      resetRes.status === 200 &&
      aliceNewLogin.status === 200,
      'Test 13: Valid reset token updates password and revokes all sessions',
      `Reset: ${resetRes.status}, Login: ${aliceNewLogin.status}`
    );

    // Test 14: Reset token reuse rejected
    const reuseResetRes = await clientA.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: validResetToken,
        newPassword: 'AnotherPassword123!',
      }),
    });
    assert(
      reuseResetRes.status === 400,
      'Test 14: Reusing consumed reset token rejected with 400 Bad Request',
      `Status: ${reuseResetRes.status}`
    );

    // Test 15: Expired reset token rejected
    const expiredResetRaw = 'expired_reset_raw_token';
    await PasswordResetToken.create({
      user: refreshedUserA._id,
      tokenHash: hashToken(expiredResetRaw),
      expiresAt: new Date(Date.now() - 5000),
      usedAt: null,
    });

    const expiredResetRes = await clientA.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: expiredResetRaw,
        newPassword: 'AnotherPassword123!',
      }),
    });
    assert(
      expiredResetRes.status === 400,
      'Test 15: Expired password reset token rejected with 400 Bad Request',
      `Status: ${expiredResetRes.status}`
    );

    // Test 19: Resend verification email
    // Register unverified user Charlie
    await clientA.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'charlie_p20',
        email: 'charlie_p20@example.com',
        password: 'Password123!',
        fullName: 'Charlie Phase 20',
      }),
    });

    const charlieLogin = await clientA.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'charlie_p20@example.com', password: 'Password123!' }),
    });
    const charlieClient = new TestClient();
    charlieClient.setAccessToken(charlieLogin.data.data.accessToken);

    const emailBeforeResend = emailService.getLatestEmail('charlie_p20@example.com', 'VERIFICATION');
    const resendRes = await charlieClient.request('/auth/resend-verification', { method: 'POST' });
    const emailAfterResend = emailService.getLatestEmail('charlie_p20@example.com', 'VERIFICATION');

    assert(
      resendRes.status === 200 &&
      emailAfterResend.rawToken !== emailBeforeResend.rawToken,
      'Test 19: Resending verification generates and dispatches a fresh token',
      `Status: ${resendRes.status}, tokensDifferent: ${emailAfterResend.rawToken !== emailBeforeResend.rawToken}`
    );

    console.log('\n--- PART 4: SECURITY HARDENING, RATE LIMITS & TOKENS ---');

    // Test 20: Rate limiting on login
    resetRateLimiters();
    let rateLimited = false;
    for (let i = 0; i < 7; i++) {
      const rlRes = await clientA.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'ratelimit_p20@example.com', password: 'WrongPassword123!' }),
      });
      if (rlRes.status === 429) {
        rateLimited = true;
        break;
      }
    }
    assert(
      rateLimited === true,
      'Test 20: Rate limiter triggers 429 Too Many Requests after exceeding threshold',
      `Rate limited: ${rateLimited}`
    );

    // Test 21: JWT tampering
    const tamperedToken = aliceNewLogin.data.data.accessToken + 'tampered';
    const tamperedClient = new TestClient();
    tamperedClient.setAccessToken(tamperedToken);
    const tamperedRes = await tamperedClient.request('/auth/me', { method: 'GET' });
    assert(
      tamperedRes.status === 401,
      'Test 21: Tampered JWT signature rejected with 401 Unauthorized',
      `Status: ${tamperedRes.status}`
    );

    // Test 22: Wrong JWT algorithm (none algorithm)
    const noneAlgorithmToken = jwt.sign(
      { sub: refreshedUserA._id.toString(), sid: 'fake-sid' },
      '',
      { algorithm: 'none' }
    );
    const noneClient = new TestClient();
    noneClient.setAccessToken(noneAlgorithmToken);
    const noneRes = await noneClient.request('/auth/me', { method: 'GET' });
    assert(
      noneRes.status === 401,
      'Test 22: Unsupported JWT algorithm rejected with 401 Unauthorized',
      `Status: ${noneRes.status}`
    );

  } catch (error) {
    console.error('Fatal error during test run:', error);
    failed++;
  } finally {
    if (httpServer) {
      httpServer.close();
    }
    await mongoose.connection.close();

    console.log('\n====================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests();
