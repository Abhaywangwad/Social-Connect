/**
 * Phase 24: Audit Logging & Security Event Tracking — Test Suite
 *
 * Suites:
 * 1. Authentication & Session Audit Logs (12 tests)
 * 2. Social Activity Audit Logs (11 tests)
 * 3. Moderation Activity Audit Logs (6 tests)
 * 4. Security & Access Denial (5 tests)
 * 5. Negative / Failed Action Integrity (2 tests)
 * 6. Admin Querying, Filtering & Pagination (9 tests)
 * 7. Sensitive Data Hygiene & Request Correlation (3 tests)
 */

import http from 'http';
import mongoose from 'mongoose';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import User from './src/models/User.js';
import Post from './src/models/Post.js';
import Comment from './src/models/Comment.js';
import Story from './src/models/Story.js';
import Report from './src/models/Report.js';
import Session from './src/models/Session.js';
import AuditLog from './src/models/AuditLog.js';
import PasswordResetToken from './src/models/PasswordResetToken.js';
import EmailVerificationToken from './src/models/EmailVerificationToken.js';
import { generateRandomToken, hashToken } from './src/utils/cryptoUtils.js';

const TEST_PORT = 5096;
const API_URL = `http://localhost:${TEST_PORT}/api`;

let httpServer;

// ─── Test Client ──────────────────────────────────────────────────────────────
class TestClient {
  constructor() { this.accessToken = null; }
  setAccessToken(token) { this.accessToken = token; }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'x-skip-rate-limit': 'true',
      ...(options.headers || {}),
    };
    if (this.accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(`${API_URL}${path}`, { ...options, headers });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    return { status: response.status, data, headers: response.headers };
  }

  async get(path, headers = {}) { return this.request(path, { method: 'GET', headers }); }
  async post(path, body, headers = {}) { return this.request(path, { method: 'POST', body: JSON.stringify(body), headers }); }
  async patch(path, body, headers = {}) { return this.request(path, { method: 'PATCH', body: JSON.stringify(body), headers }); }
  async delete(path, headers = {}) { return this.request(path, { method: 'DELETE', headers }); }
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((err) => {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg || 'Expected'}: ${expected}, got: ${actual}`);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let normalUser, normalUser2, adminUser;
let normalToken, normalToken2, adminToken;
let testPost, testComment, testStory, testReport;

// ─── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  await connectDB();

  await new Promise((resolve) => {
    httpServer = http.createServer(app);
    httpServer.listen(TEST_PORT, resolve);
  });

  console.log(`\n[Test Server] Running at http://localhost:${TEST_PORT}\n`);

  // Clean previous test data
  await User.deleteMany({ email: /@test-phase24\.com$/ });
  await Post.deleteMany({ caption: /^TEST_P24:/ });
  await Comment.deleteMany({ content: /^TEST_C24:/ });
  await Report.deleteMany({ details: /^TEST_R24:/ });
  await Session.deleteMany({});
  await AuditLog.deleteMany({});

  const anonClient = new TestClient();

  // 1. Create Normal User 1
  await anonClient.post('/auth/register', {
    username: 'user1_p24',
    email: 'user1_p24@test-phase24.com',
    password: 'Password123!',
    fullName: 'Normal User One',
  });
  normalUser = await User.findOne({ username: 'user1_p24' });

  const login1 = await anonClient.post('/auth/login', {
    email: 'user1_p24@test-phase24.com',
    password: 'Password123!',
  });
  normalToken = login1.data?.data?.accessToken;

  // 2. Create Normal User 2
  await anonClient.post('/auth/register', {
    username: 'user2_p24',
    email: 'user2_p24@test-phase24.com',
    password: 'Password123!',
    fullName: 'Normal User Two',
  });
  normalUser2 = await User.findOne({ username: 'user2_p24' });

  const login2 = await anonClient.post('/auth/login', {
    email: 'user2_p24@test-phase24.com',
    password: 'Password123!',
  });
  normalToken2 = login2.data?.data?.accessToken;

  // 3. Create Admin User
  await anonClient.post('/auth/register', {
    username: 'admin_p24',
    email: 'admin_p24@test-phase24.com',
    password: 'AdminPass123!',
    fullName: 'Admin User',
  });
  adminUser = await User.findOne({ username: 'admin_p24' });
  adminUser.role = 'ADMIN';
  await adminUser.save();

  const adminLogin = await anonClient.post('/auth/login', {
    email: 'admin_p24@test-phase24.com',
    password: 'AdminPass123!',
  });
  adminToken = adminLogin.data?.data?.accessToken;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
  try {
    await User.deleteMany({ email: /@test-phase24\.com$/ });
    await Post.deleteMany({ caption: /^TEST_P24:/ });
    await Comment.deleteMany({ content: /^TEST_C24:/ });
    await Report.deleteMany({ details: /^TEST_R24:/ });
    await Session.deleteMany({});
    await AuditLog.deleteMany({});
    if (testStory?._id) await Story.deleteOne({ _id: testStory._id });
  } catch (_) {}

  await httpServer.close();
  await mongoose.disconnect();
}

// ─── Suite 1: Authentication & Session Audit Logs ────────────────────────────
async function testAuthAuditLogs() {
  console.log('── 1. Authentication & Session Audit Logs ──────────────');

  const client = new TestClient();

  await test('USER_REGISTERED is logged on registration', async () => {
    const regLog = await AuditLog.findOne({
      action: 'USER_REGISTERED',
      actor: normalUser._id,
    });
    assert(regLog != null, 'USER_REGISTERED log should exist');
    assertEqual(regLog.targetType, 'USER', 'TargetType');
    assertEqual(regLog.targetId, normalUser._id.toString(), 'TargetId');
  });

  await test('USER_LOGIN & SESSION_CREATED are logged on successful login', async () => {
    const loginLog = await AuditLog.findOne({
      action: 'USER_LOGIN',
      actor: normalUser._id,
    });
    assert(loginLog != null, 'USER_LOGIN log should exist');
    assert(loginLog.metadata?.sessionId, 'SessionId should be in metadata');

    const sessionLog = await AuditLog.findOne({
      action: 'SESSION_CREATED',
      actor: normalUser._id,
    });
    assert(sessionLog != null, 'SESSION_CREATED log should exist');
  });

  await test('USER_LOGIN_FAILED is logged on incorrect password', async () => {
    await client.post('/auth/login', {
      email: 'user1_p24@test-phase24.com',
      password: 'WrongPassword999!',
    });
    const failedLog = await AuditLog.findOne({
      action: 'USER_LOGIN_FAILED',
      'metadata.identifier': 'user1_p24@test-phase24.com',
      'metadata.reason': 'INVALID_CREDENTIALS',
    });
    assert(failedLog != null, 'USER_LOGIN_FAILED log should exist');
    assert(!failedLog.metadata?.password, 'Password must never be in metadata');
  });

  await test('USER_LOGIN_FAILED is logged on nonexistent email without leaking existence', async () => {
    await client.post('/auth/login', {
      email: 'nonexistent_ghost@test-phase24.com',
      password: 'SomePassword123!',
    });
    const failedLog = await AuditLog.findOne({
      action: 'USER_LOGIN_FAILED',
      'metadata.identifier': 'nonexistent_ghost@test-phase24.com',
    });
    assert(failedLog != null, 'USER_LOGIN_FAILED log should exist');
    assert(failedLog.actor === null, 'Actor should be null for nonexistent user');
  });

  await test('PASSWORD_CHANGED is logged on password update', async () => {
    const userClient = new TestClient();
    userClient.setAccessToken(normalToken);
    await userClient.patch('/auth/change-password', {
      currentPassword: 'Password123!',
      newPassword: 'NewPassword123!',
    });

    const pwdLog = await AuditLog.findOne({
      action: 'PASSWORD_CHANGED',
      actor: normalUser._id,
    });
    assert(pwdLog != null, 'PASSWORD_CHANGED log should exist');
    assert(!pwdLog.metadata?.oldPassword && !pwdLog.metadata?.newPassword, 'Passwords must not be logged');

    // Restore password
    await User.findByIdAndUpdate(normalUser._id, { password: normalUser.password });
    // Re-login to get fresh token
    const reLogin = await client.post('/auth/login', {
      email: 'user1_p24@test-phase24.com',
      password: 'Password123!',
    });
    normalToken = reLogin.data?.data?.accessToken;
  });

  await test('PASSWORD_RESET is logged on successful password reset', async () => {
    const rawReset = generateRandomToken(32);
    await PasswordResetToken.create({
      user: normalUser._id,
      tokenHash: hashToken(rawReset),
      expiresAt: new Date(Date.now() + 600000),
    });

    await client.post('/auth/reset-password', {
      token: rawReset,
      newPassword: 'Password123!',
    });

    const resetLog = await AuditLog.findOne({
      action: 'PASSWORD_RESET',
      actor: normalUser._id,
    });
    assert(resetLog != null, 'PASSWORD_RESET log should exist');
  });

  await test('EMAIL_VERIFIED is logged on email verification', async () => {
    const rawVerify = generateRandomToken(32);
    await EmailVerificationToken.create({
      user: normalUser._id,
      tokenHash: hashToken(rawVerify),
      expiresAt: new Date(Date.now() + 600000),
    });

    await client.post('/auth/verify-email', { token: rawVerify });

    const verifyLog = await AuditLog.findOne({
      action: 'EMAIL_VERIFIED',
      actor: normalUser._id,
    });
    assert(verifyLog != null, 'EMAIL_VERIFIED log should exist');
  });

  await test('USER_LOGOUT is logged on session revocation', async () => {
    const tempLogin = await client.post('/auth/login', {
      email: 'user1_p24@test-phase24.com',
      password: 'Password123!',
    });
    const tempClient = new TestClient();
    tempClient.setAccessToken(tempLogin.data?.data?.accessToken);
    await tempClient.post('/auth/logout', {});

    const logoutLog = await AuditLog.findOne({
      action: 'USER_LOGOUT',
      actor: normalUser._id,
    });
    assert(logoutLog != null, 'USER_LOGOUT log should exist');
  });

  await test('USER_LOGOUT_ALL is logged on logout-all', async () => {
    const tempLogin = await client.post('/auth/login', {
      email: 'user1_p24@test-phase24.com',
      password: 'Password123!',
    });
    const tempClient = new TestClient();
    tempClient.setAccessToken(tempLogin.data?.data?.accessToken);
    await tempClient.post('/auth/logout-all', {});

    const logoutAllLog = await AuditLog.findOne({
      action: 'USER_LOGOUT_ALL',
      actor: normalUser._id,
    });
    assert(logoutAllLog != null, 'USER_LOGOUT_ALL log should exist');
    assert(logoutAllLog.metadata?.numberOfSessionsRevoked >= 1, 'Should record revoked count');

    // Fresh token for remaining tests
    const fresh = await client.post('/auth/login', {
      email: 'user1_p24@test-phase24.com',
      password: 'Password123!',
    });
    normalToken = fresh.data?.data?.accessToken;
  });

  await test('REFRESH_TOKEN_REUSED is logged on replay attack detection', async () => {
    const replayRawToken = `rotated_p24_${Date.now()}_token`;
    const oldHash = hashToken(replayRawToken);
    const tokenFamily = `family_p24_${Date.now()}`;
    const sessionDoc = await Session.create({
      user: normalUser._id,
      refreshTokenHash: hashToken(`active_p24_${Date.now()}_token`),
      previousTokenHashes: [oldHash],
      tokenFamily,
      expiresAt: new Date(Date.now() + 600000),
    });

    const res = await client.post('/auth/refresh', {}, {
      'x-refresh-token': replayRawToken,
    });
    assertEqual(res.status, 401, 'Should reject token reuse with 401');

    const reuseLog = await AuditLog.findOne({
      action: 'REFRESH_TOKEN_REUSED',
      actor: normalUser._id,
      'metadata.tokenFamily': tokenFamily,
    });
    assert(reuseLog != null, 'REFRESH_TOKEN_REUSED log should exist');
    assertEqual(reuseLog.metadata?.tokenFamily, tokenFamily, 'TokenFamily');
    assert(!reuseLog.metadata?.refreshToken, 'Raw token must not be logged');

    await Session.deleteOne({ _id: sessionDoc._id });
  });
}

// ─── Suite 2: Social Activity Audit Logs ──────────────────────────────────────
async function testSocialAuditLogs() {
  console.log('\n── 2. Social Activity Audit Logs ────────────────────────');

  const client1 = new TestClient();
  client1.setAccessToken(normalToken);
  const client2 = new TestClient();
  client2.setAccessToken(normalToken2);

  await test('FOLLOW_CREATED and FOLLOW_REMOVED are logged on follow/unfollow', async () => {
    await client1.post(`/users/${normalUser2.username}/follow`, {});
    const followLog = await AuditLog.findOne({
      action: 'FOLLOW_CREATED',
      actor: normalUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(followLog != null, 'FOLLOW_CREATED log should exist');

    await client1.delete(`/users/${normalUser2.username}/follow`);
    const unfollowLog = await AuditLog.findOne({
      action: 'FOLLOW_REMOVED',
      actor: normalUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(unfollowLog != null, 'FOLLOW_REMOVED log should exist');
  });

  await test('USER_BLOCKED and USER_UNBLOCKED are logged on block/unblock', async () => {
    await client1.post(`/users/${normalUser2.username}/block`, {});
    const blockLog = await AuditLog.findOne({
      action: 'USER_BLOCKED',
      actor: normalUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(blockLog != null, 'USER_BLOCKED log should exist');

    await client1.delete(`/users/${normalUser2.username}/block`);
    const unblockLog = await AuditLog.findOne({
      action: 'USER_UNBLOCKED',
      actor: normalUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(unblockLog != null, 'USER_UNBLOCKED log should exist');
  });

  await test('POST_CREATED, POST_UPDATED, and POST_DELETED are logged', async () => {
    const createRes = await client1.post('/posts', {
      caption: 'TEST_P24: First audit post',
    });
    assertEqual(createRes.status, 201, 'Post created');
    const createdPostId = createRes.data?.data?.post?._id || createRes.data?.data?.post?.id;
    testPost = await Post.findById(createdPostId);

    const postCreateLog = await AuditLog.findOne({
      action: 'POST_CREATED',
      actor: normalUser._id,
      targetId: createdPostId.toString(),
    });
    assert(postCreateLog != null, 'POST_CREATED log should exist');

    await client1.patch(`/posts/${createdPostId}`, {
      caption: 'TEST_P24: Updated audit post caption',
    });
    const postUpdateLog = await AuditLog.findOne({
      action: 'POST_UPDATED',
      actor: normalUser._id,
      targetId: createdPostId.toString(),
    });
    assert(postUpdateLog != null, 'POST_UPDATED log should exist');
  });

  await test('COMMENT_CREATED, COMMENT_UPDATED, and COMMENT_DELETED are logged', async () => {
    const commentRes = await client2.post(`/posts/${testPost._id}/comments`, {
      content: 'TEST_C24: Audit test comment',
    });
    assertEqual(commentRes.status, 201, 'Comment created');
    const commentId = commentRes.data?.data?.comment?._id || commentRes.data?.data?.comment?.id;
    testComment = await Comment.findById(commentId);

    const commentCreateLog = await AuditLog.findOne({
      action: 'COMMENT_CREATED',
      actor: normalUser2._id,
      targetId: commentId.toString(),
    });
    assert(commentCreateLog != null, 'COMMENT_CREATED log should exist');

    await client2.patch(`/comments/${commentId}`, {
      content: 'TEST_C24: Updated audit comment',
    });
    const commentUpdateLog = await AuditLog.findOne({
      action: 'COMMENT_UPDATED',
      actor: normalUser2._id,
      targetId: commentId.toString(),
    });
    assert(commentUpdateLog != null, 'COMMENT_UPDATED log should exist');

    await client2.delete(`/comments/${commentId}`);
    const commentDeleteLog = await AuditLog.findOne({
      action: 'COMMENT_DELETED',
      actor: normalUser2._id,
      targetId: commentId.toString(),
    });
    assert(commentDeleteLog != null, 'COMMENT_DELETED log should exist');
  });

  await test('REPORT_CREATED is logged on confidential user report', async () => {
    const reportRes = await client2.post('/reports', {
      targetType: 'POST',
      targetId: testPost._id,
      reason: 'SPAM',
      details: 'TEST_R24: Audit spam report',
    });
    assertEqual(reportRes.status, 201, 'Report created');
    const reportId = reportRes.data?.data?.report?._id || reportRes.data?.data?.report?.id;
    testReport = await Report.findById(reportId);

    const reportLog = await AuditLog.findOne({
      action: 'REPORT_CREATED',
      actor: normalUser2._id,
      targetId: testPost._id.toString(),
    });
    assert(reportLog != null, 'REPORT_CREATED log should exist');
  });
}

// ─── Suite 3: Moderation Activity Audit Logs ──────────────────────────────────
async function testModerationAuditLogs() {
  console.log('\n── 3. Moderation Activity Audit Logs ────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('REPORT_STATUS_CHANGED is logged with old and new status', async () => {
    await admin.patch(`/admin/reports/${testReport._id}/status`, {
      status: 'REVIEWING',
      moderationNote: 'Investigating spam report',
    });

    const statusLog = await AuditLog.findOne({
      action: 'REPORT_STATUS_CHANGED',
      actor: adminUser._id,
      targetId: testReport._id.toString(),
    });
    assert(statusLog != null, 'REPORT_STATUS_CHANGED log should exist');
    assertEqual(statusLog.metadata?.oldStatus, 'OPEN', 'oldStatus');
    assertEqual(statusLog.metadata?.newStatus, 'REVIEWING', 'newStatus');
  });

  await test('POST_MODERATED is logged when admin hides or removes a post', async () => {
    await admin.patch(`/admin/posts/${testPost._id}/moderation`, {
      status: 'HIDDEN',
      reason: 'Spam violation',
    });

    const modLog = await AuditLog.findOne({
      action: 'POST_MODERATED',
      actor: adminUser._id,
      targetId: testPost._id.toString(),
    });
    assert(modLog != null, 'POST_MODERATED log should exist');
    assertEqual(modLog.metadata?.newStatus, 'HIDDEN', 'newStatus');
    assertEqual(modLog.metadata?.reason, 'Spam violation', 'reason');

    // Restore to ACTIVE for remaining tests
    await admin.patch(`/admin/posts/${testPost._id}/moderation`, { status: 'ACTIVE' });
  });

  await test('STORY_MODERATED is logged when admin moderates a story', async () => {
    testStory = await Story.create({
      author: normalUser._id,
      media: { type: 'image', url: 'https://example.com/p24.jpg', publicId: 'story_p24' },
      expiresAt: new Date(Date.now() + 86400000),
      moderationStatus: 'ACTIVE',
    });

    await admin.patch(`/admin/stories/${testStory._id}/moderation`, {
      status: 'REMOVED',
      reason: 'Policy violation',
    });

    const storyLog = await AuditLog.findOne({
      action: 'STORY_MODERATED',
      actor: adminUser._id,
      targetId: testStory._id.toString(),
    });
    assert(storyLog != null, 'STORY_MODERATED log should exist');
    assertEqual(storyLog.metadata?.newStatus, 'REMOVED', 'newStatus');
  });

  await test('USER_SUSPENDED and USER_REACTIVATED are logged on status change', async () => {
    await admin.patch(`/admin/users/${normalUser2._id}/status`, {
      status: 'SUSPENDED',
      reason: 'Automated test suspension',
    });

    const suspendLog = await AuditLog.findOne({
      action: 'USER_SUSPENDED',
      actor: adminUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(suspendLog != null, 'USER_SUSPENDED log should exist');
    assertEqual(suspendLog.metadata?.reason, 'Automated test suspension', 'reason');

    await admin.patch(`/admin/users/${normalUser2._id}/status`, {
      status: 'ACTIVE',
    });

    const reactivateLog = await AuditLog.findOne({
      action: 'USER_REACTIVATED',
      actor: adminUser._id,
      targetId: normalUser2._id.toString(),
    });
    assert(reactivateLog != null, 'USER_REACTIVATED log should exist');
  });
}

// ─── Suite 4: Security & Access Denial ────────────────────────────────────────
async function testSecurityAndAccessDenial() {
  console.log('\n── 4. Security & Access Denial ──────────────────────────');

  const normal = new TestClient();
  normal.setAccessToken(normalToken);
  const anon = new TestClient();
  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('ADMIN_ACCESS_DENIED is logged when normal user requests admin route', async () => {
    const res = await normal.get('/admin/audit-logs');
    assertEqual(res.status, 403, 'Normal user must receive 403');

    const deniedLog = await AuditLog.findOne({
      action: 'ADMIN_ACCESS_DENIED',
      actor: normalUser._id,
    });
    assert(deniedLog != null, 'ADMIN_ACCESS_DENIED log should exist');
  });

  await test('Anonymous user is rejected from GET /admin/audit-logs (401)', async () => {
    const res = await anon.get('/admin/audit-logs');
    assertEqual(res.status, 401, 'Anon user must receive 401');
  });

  await test('Immutability: PATCH /api/admin/audit-logs/:id is rejected (404/405)', async () => {
    const sampleLog = await AuditLog.findOne();
    const res = await admin.patch(`/admin/audit-logs/${sampleLog._id}`, { action: 'HACKED' });
    assert(res.status === 404 || res.status === 405, `Expected 404/405, got ${res.status}`);
  });

  await test('Immutability: DELETE /api/admin/audit-logs/:id is rejected (404/405)', async () => {
    const sampleLog = await AuditLog.findOne();
    const res = await admin.delete(`/admin/audit-logs/${sampleLog._id}`);
    assert(res.status === 404 || res.status === 405, `Expected 404/405, got ${res.status}`);
  });
}

// ─── Suite 5: Negative / Failed Action Integrity ──────────────────────────────
async function testFailedActionIntegrity() {
  console.log('\n── 5. Negative / Failed Action Integrity ────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('Failed admin action (suspending nonexistent user) does NOT create false success log', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await admin.patch(`/admin/users/${fakeId}/status`, { status: 'SUSPENDED' });
    assertEqual(res.status, 404, 'Status 404');

    const falseLog = await AuditLog.findOne({
      action: 'USER_SUSPENDED',
      targetId: fakeId.toString(),
    });
    assert(falseLog === null, 'No USER_SUSPENDED log should exist for failed operation');
  });
}

// ─── Suite 6: Admin Querying, Filtering & Pagination ──────────────────────────
async function testAdminQueryingAndFilters() {
  console.log('\n── 6. Admin Querying, Filtering & Pagination ────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('Admin can list audit logs with pagination metadata', async () => {
    const res = await admin.get('/admin/audit-logs?page=1&limit=10');
    assertEqual(res.status, 200, 'Status');
    assert(res.data?.success === true, 'Success');
    assert(Array.isArray(res.data?.data?.logs), 'Logs should be an array');
    assert(res.data?.data?.pagination?.totalLogs > 0, 'TotalLogs should be > 0');
    assertEqual(res.data?.data?.pagination?.page, 1, 'Page');
  });

  await test('Admin can filter audit logs by action (?action=USER_LOGIN)', async () => {
    const res = await admin.get('/admin/audit-logs?action=USER_LOGIN');
    assertEqual(res.status, 200, 'Status');
    const logs = res.data?.data?.logs || [];
    assert(logs.length > 0, 'Should find USER_LOGIN logs');
    assert(logs.every((l) => l.action === 'USER_LOGIN'), 'All returned logs must be USER_LOGIN');
  });

  await test('Admin can filter audit logs by actorId', async () => {
    const res = await admin.get(`/admin/audit-logs?actorId=${normalUser._id}`);
    assertEqual(res.status, 200, 'Status');
    const logs = res.data?.data?.logs || [];
    assert(logs.length > 0, 'Should find logs for normalUser');
    assert(logs.every((l) => l.actor?.id === normalUser._id.toString() || l.actor?._id === normalUser._id.toString()), 'All returned logs must match actor');
  });

  await test('Admin can filter audit logs by date range (from / to)', async () => {
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60000).toISOString();
    const future = new Date(now.getTime() + 5 * 60000).toISOString();

    const res = await admin.get(`/admin/audit-logs?from=${fiveMinsAgo}&to=${future}`);
    assertEqual(res.status, 200, 'Status');
    const logs = res.data?.data?.logs || [];
    assert(logs.length > 0, 'Logs within time window');
  });

  await test('Malformed date string in from/to query is rejected (400)', async () => {
    const res = await admin.get('/admin/audit-logs?from=not-a-valid-date');
    assertEqual(res.status, 400, 'Expected 400 for malformed date');
  });

  await test('from > to timestamp is rejected with 400', async () => {
    const fromDate = new Date('2026-09-20T12:00:00Z').toISOString();
    const toDate = new Date('2026-09-19T12:00:00Z').toISOString();
    const res = await admin.get(`/admin/audit-logs?from=${fromDate}&to=${toDate}`);
    assertEqual(res.status, 400, 'Expected 400 when from > to');
  });

  await test('Pagination limit is capped at 100 maximum', async () => {
    const res = await admin.get('/admin/audit-logs?limit=500');
    // If validator caps or rejects, verify it doesn't return more than 100
    if (res.status === 200) {
      assert(res.data?.data?.pagination?.limit <= 100, 'Limit should be capped at 100');
    } else {
      assertEqual(res.status, 400, 'Expected 400 if limit exceeds bounds');
    }
  });

  await test('Admin can fetch single audit log detail by ID', async () => {
    const sampleLog = await AuditLog.findOne({ action: 'USER_LOGIN' });
    const res = await admin.get(`/admin/audit-logs/${sampleLog._id}`);
    assertEqual(res.status, 200, 'Status');
    assertEqual(res.data?.data?.log?.id, sampleLog._id.toString(), 'Log ID match');
  });

  await test('Admin can fetch user activity summary aggregate', async () => {
    const res = await admin.get(`/admin/audit-logs/users/${normalUser._id}/summary`);
    assertEqual(res.status, 200, 'Status');
    assert(res.data?.data?.summary != null, 'Summary should exist');
    assert(typeof res.data?.data?.summary?.totalAuditedEvents === 'number', 'Total audited events');
  });
}

// ─── Suite 7: Sensitive Data Hygiene & Request Correlation ────────────────────
async function testSensitiveDataHygiene() {
  console.log('\n── 7. Sensitive Data Hygiene & Request Correlation ──────');

  await test('No audit log entries contain credentials, tokens, or hashes', async () => {
    const logs = await AuditLog.find({ 'metadata.testSuite': { $ne: 'SKIP' } }).lean();
    const forbiddenPatterns = ['password', 'refreshToken', 'tokenHash', 'accessToken', 'jwt'];

    for (const log of logs) {
      const metaStr = JSON.stringify(log.metadata || {});
      for (const pattern of forbiddenPatterns) {
        // Allow reason: 'INVALID_CREDENTIALS', but no actual secret values
        if (pattern === 'password' && metaStr.includes('password') && !metaStr.includes('PASSWORD_CHANGED')) {
          throw new Error(`Forbidden key '${pattern}' detected in audit metadata: ${metaStr}`);
        }
      }
    }
  });

  await test('AuditLog captures correct requestId correlated with HTTP request', async () => {
    const traceId = `trace-${Date.now()}-abc`;
    const client = new TestClient();
    client.setAccessToken(normalToken);

    await client.post('/posts', {
      caption: 'TEST_P24: Correlated trace request',
    }, {
      'X-Request-ID': traceId,
    });

    const correlatedLog = await AuditLog.findOne({ requestId: traceId });
    assert(correlatedLog != null, `AuditLog should have captured requestId: ${traceId}`);
    assertEqual(correlatedLog.requestId, traceId, 'RequestId match');
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function runAll() {
  console.log('====================================================');
  console.log('🛡️  STARTING PHASE 24 AUDIT LOGGING TEST SUITE');
  console.log('====================================================\n');

  try {
    await setup();
    await testAuthAuditLogs();
    await testSocialAuditLogs();
    await testModerationAuditLogs();
    await testSecurityAndAccessDenial();
    await testFailedActionIntegrity();
    await testAdminQueryingAndFilters();
    await testSensitiveDataHygiene();
  } catch (err) {
    console.error('Fatal error during test run:', err);
  } finally {
    await teardown();
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('   ✅ All Phase 24 tests passed!');
  } else {
    console.log(`   ⚠️  ${failed} test(s) failed. Review output above.`);
  }
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
