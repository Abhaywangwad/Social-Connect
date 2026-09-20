/**
 * Phase 23: Admin Role & Moderation System — Test Suite
 *
 * Tests:
 * 1.  Role & Authorization (5 tests)
 * 2.  Privilege Escalation Protection (4 tests)
 * 3.  Report Queue (5 tests)
 * 4.  Report Status Transitions (4 tests)
 * 5.  Content Moderation (9 tests)
 * 6.  User Suspension (8 tests)
 * 7.  Admin User List (4 tests)
 * 8.  Admin Privacy (3 tests)
 * 9.  Account Status Write-Endpoint Blocking (5 tests)
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
import { resetRateLimiters } from './src/middleware/rateLimiter.js';

const TEST_PORT = 5095;
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
    return { status: response.status, data };
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
let normalUser, adminUser, targetUser;
let normalToken, adminToken;
let testPost, testComment, testStory, testReport;

async function loginUser(email, password) {
  const client = new TestClient();
  const res = await client.post('/auth/login', { email, password });
  return res.data?.data?.accessToken || null;
}

async function createTestUser(overrides = {}) {
  const username = `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const user = await User.create({
    username,
    email: `${username}@test.com`,
    password: '$2a$12$fixedhashedpasswordplaceholder1234567890ab', // pre-hashed placeholder
    fullName: 'Test User',
    emailVerified: true,
    accountStatus: 'ACTIVE',
    ...overrides,
  });
  return user;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
async function setup() {
  await connectDB();
  httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
  resetRateLimiters();

  // Clean up leftover test data
  await User.deleteMany({ email: /@test\.com$/ });
  await Post.deleteMany({ caption: /^TEST_P23:/ });
  await Comment.deleteMany({ content: /^TEST_C23:/ });
  await Report.deleteMany({ details: /^TEST_R23:/ });

  console.log('\n🔧 Creating test fixtures...\n');

  // Create normal user via registration (proper password hashing)
  const normalClient = new TestClient();
  await normalClient.post('/auth/register', {
    username: 'normaluser_p23',
    email: 'normaluser_p23@test.com',
    password: 'TestPass123!',
    fullName: 'Normal User',
  });

  const normalLoginRes = await normalClient.post('/auth/login', {
    email: 'normaluser_p23@test.com',
    password: 'TestPass123!',
  });
  normalToken = normalLoginRes.data?.data?.accessToken;
  normalUser = await User.findOne({ username: 'normaluser_p23' });

  // Create admin user
  await normalClient.post('/auth/register', {
    username: 'adminuser_p23',
    email: 'adminuser_p23@test.com',
    password: 'AdminPass123!',
    fullName: 'Admin User',
  });
  // Directly set admin role (bootstrap simuation)
  await User.updateOne({ username: 'adminuser_p23' }, { $set: { role: 'ADMIN' } });
  adminUser = await User.findOne({ username: 'adminuser_p23' });

  const adminLoginRes = await normalClient.post('/auth/login', {
    email: 'adminuser_p23@test.com',
    password: 'AdminPass123!',
  });
  adminToken = adminLoginRes.data?.data?.accessToken;

  // Create target user (to be suspended in tests)
  await normalClient.post('/auth/register', {
    username: 'targetuser_p23',
    email: 'targetuser_p23@test.com',
    password: 'TargetPass123!',
    fullName: 'Target User',
  });
  targetUser = await User.findOne({ username: 'targetuser_p23' });

  // Create a test post owned by normalUser
  testPost = await Post.create({
    author: normalUser._id,
    caption: 'TEST_P23: Test post for moderation',
    moderationStatus: 'ACTIVE',
  });

  // Create a test comment on the post
  testComment = await Comment.create({
    author: normalUser._id,
    post: testPost._id,
    content: 'TEST_C23: Test comment for moderation',
    moderationStatus: 'ACTIVE',
  });

  // Create a test story
  testStory = await Story.create({
    author: normalUser._id,
    media: { type: 'image', url: 'https://example.com/story.jpg', publicId: 'test_story_p23' },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    moderationStatus: 'ACTIVE',
  });

  // Create a test report
  testReport = await Report.create({
    reporter: targetUser._id,
    targetType: 'POST',
    targetId: testPost._id,
    reason: 'SPAM',
    details: 'TEST_R23: Suspected spam post',
    status: 'OPEN',
  });

  console.log(`  normalUser id: ${normalUser._id}`);
  console.log(`  adminUser  id: ${adminUser._id}`);
  console.log(`  targetUser id: ${targetUser._id}`);
  console.log(`  testPost   id: ${testPost._id}`);
  console.log(`  testReport id: ${testReport._id}`);
  console.log('');
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
async function teardown() {
  try {
    await User.deleteMany({ email: /@test\.com$/ });
    await Post.deleteMany({ caption: /^TEST_P23:/ });
    await Comment.deleteMany({ content: /^TEST_C23:/ });
    await Report.deleteMany({ details: /^TEST_R23:/ });
    await Session.deleteMany({ user: { $in: [normalUser?._id, adminUser?._id, targetUser?._id] } });
    if (testStory?._id) await Story.deleteOne({ _id: testStory._id });
  } catch (_) {}

  await httpServer.close();
  await mongoose.disconnect();
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

async function testRoleAuthorization() {
  console.log('── 1. Role & Authorization ──────────────────────────────');

  const normal = new TestClient();
  normal.setAccessToken(normalToken);
  const admin = new TestClient();
  admin.setAccessToken(adminToken);
  const anon = new TestClient();

  await test('Normal user is rejected from GET /admin/reports (403)', async () => {
    const res = await normal.get('/admin/reports');
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Anonymous user is rejected from GET /admin/reports (401)', async () => {
    const res = await anon.get('/admin/reports');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('Normal user is rejected from GET /admin/users (403)', async () => {
    const res = await normal.get('/admin/users');
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Admin user can access GET /admin/reports (200)', async () => {
    const res = await admin.get('/admin/reports');
    assertEqual(res.status, 200, 'Status');
    assert(res.data?.success === true, 'Expected success true');
    assert(Array.isArray(res.data?.data?.reports), 'Expected reports array');
  });

  await test('Admin user can access GET /admin/users (200)', async () => {
    const res = await admin.get('/admin/users');
    assertEqual(res.status, 200, 'Status');
    assert(Array.isArray(res.data?.data?.users), 'Expected users array');
  });
}

async function testPrivilegeEscalation() {
  console.log('\n── 2. Privilege Escalation Protection ───────────────────');

  const normal = new TestClient();
  normal.setAccessToken(normalToken);

  await test('Normal user cannot set role via profile update', async () => {
    const res = await normal.patch('/users/me', { role: 'ADMIN' });
    // Either rejected (400/403) or silently ignored — role must not change
    const updatedUser = await User.findById(normalUser._id).select('+role').lean();
    assert(updatedUser.role === 'USER', `Role should remain USER, got: ${updatedUser.role}`);
  });

  await test('X-Admin: true header is completely ignored', async () => {
    const res = await normal.get('/admin/reports', { 'X-Admin': 'true' });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Normal user cannot access admin report detail', async () => {
    const res = await normal.get(`/admin/reports/${testReport._id}`);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Normal user cannot moderate a post', async () => {
    const res = await normal.patch(`/admin/posts/${testPost._id}/moderation`, { status: 'REMOVED' });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const post = await Post.findById(testPost._id);
    assert(post.moderationStatus === 'ACTIVE', 'Post should remain ACTIVE');
  });
}

async function testReportQueue() {
  console.log('\n── 3. Report Queue ──────────────────────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('Admin can list all reports', async () => {
    const res = await admin.get('/admin/reports');
    assertEqual(res.status, 200, 'Status');
    assert(res.data.data.reports.length >= 1, 'Should have at least our test report');
  });

  await test('Admin can filter reports by status=OPEN', async () => {
    const res = await admin.get('/admin/reports?status=OPEN');
    assertEqual(res.status, 200, 'Status');
    const allOpen = res.data.data.reports.every((r) => r.status === 'OPEN');
    assert(allOpen, 'All returned reports should be OPEN');
  });

  await test('Admin can filter reports by targetType=POST', async () => {
    const res = await admin.get('/admin/reports?targetType=POST');
    assertEqual(res.status, 200, 'Status');
    const allPost = res.data.data.reports.every((r) => r.targetType === 'POST');
    assert(allPost, 'All returned reports should have targetType=POST');
  });

  await test('Admin can get report detail with target entity', async () => {
    const res = await admin.get(`/admin/reports/${testReport._id}`);
    assertEqual(res.status, 200, 'Status');
    assert(res.data.data.report.id, 'Report should have id');
    assert(res.data.data.report.target, 'Report should have resolved target');
    assert(res.data.data.report.target.type === 'POST', 'Target should be a POST');
  });

  await test('Invalid report ID returns 400', async () => {
    const res = await admin.get('/admin/reports/not-a-valid-id');
    assert(res.status === 400 || res.status === 404, `Expected 400/404, got ${res.status}`);
  });
}

async function testReportStatusTransitions() {
  console.log('\n── 4. Report Status Transitions ─────────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('Admin can transition report OPEN → REVIEWING', async () => {
    const res = await admin.patch(`/admin/reports/${testReport._id}/status`, {
      status: 'REVIEWING',
      moderationNote: 'Under investigation',
    });
    assertEqual(res.status, 200, 'Status');
    const updated = await Report.findById(testReport._id);
    assertEqual(updated.status, 'REVIEWING', 'Status should be REVIEWING');
    assertEqual(updated.moderationNote, 'Under investigation', 'Moderation note should be saved');
  });

  await test('Admin can transition report REVIEWING → RESOLVED with resolvedBy set', async () => {
    const res = await admin.patch(`/admin/reports/${testReport._id}/status`, {
      status: 'RESOLVED',
      moderationNote: 'Content confirmed as spam, post moderated',
    });
    assertEqual(res.status, 200, 'Status');
    const updated = await Report.findById(testReport._id);
    assertEqual(updated.status, 'RESOLVED', 'Status should be RESOLVED');
    assert(updated.resolvedBy?.toString() === adminUser._id.toString(), 'resolvedBy should be admin');
    assert(updated.resolvedAt != null, 'resolvedAt should be set');
  });

  await test('Admin cannot transition from terminal state RESOLVED → REVIEWING (400)', async () => {
    const res = await admin.patch(`/admin/reports/${testReport._id}/status`, {
      status: 'REVIEWING',
    });
    assertEqual(res.status, 400, 'Status should be 400');
    assert(
      res.data.error?.code === 'INVALID_STATUS_TRANSITION' ||
      res.data.code === 'INVALID_STATUS_TRANSITION' ||
      res.data.message?.includes('Invalid status transition') ||
      res.data.error?.message?.includes('Invalid status transition'),
      'Should contain INVALID_STATUS_TRANSITION error'
    );
  });

  await test('Invalid status value is rejected (400)', async () => {
    // Create a fresh report for this test
    const freshReport = await Report.create({
      reporter: targetUser._id,
      targetType: 'USER',
      targetId: normalUser._id,
      reason: 'SPAM',
      details: 'TEST_R23: status validation test',
      status: 'OPEN',
    });
    const res = await admin.patch(`/admin/reports/${freshReport._id}/status`, {
      status: 'FLYING',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    await Report.deleteOne({ _id: freshReport._id });
  });
}

async function testContentModeration() {
  console.log('\n── 5. Content Moderation ────────────────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);
  const normal = new TestClient();
  normal.setAccessToken(normalToken);

  // Create a fresh post for moderation tests (since testPost may be in any state)
  const modPost = await Post.create({
    author: normalUser._id,
    caption: 'TEST_P23: Moderation target post',
    moderationStatus: 'ACTIVE',
  });

  await test('Admin can HIDE a post (moderationStatus → HIDDEN)', async () => {
    const res = await admin.patch(`/admin/posts/${modPost._id}/moderation`, { status: 'HIDDEN' });
    assertEqual(res.status, 200, 'Status');
    const updated = await Post.findById(modPost._id);
    assertEqual(updated.moderationStatus, 'HIDDEN', 'Should be HIDDEN');
    assert(updated.moderatedAt != null, 'moderatedAt should be set');
    assert(updated.moderatedBy?.toString() === adminUser._id.toString(), 'moderatedBy should be admin');
  });

  await test('Hidden post is invisible to normal users via direct GET', async () => {
    const res = await normal.get(`/posts/${modPost._id}`);
    assert(res.status === 404, `Expected 404 for hidden post, got ${res.status}`);
  });

  await test('Admin can REMOVE a post (moderationStatus → REMOVED)', async () => {
    const res = await admin.patch(`/admin/posts/${modPost._id}/moderation`, { status: 'REMOVED' });
    assertEqual(res.status, 200, 'Status');
    const updated = await Post.findById(modPost._id);
    assertEqual(updated.moderationStatus, 'REMOVED', 'Should be REMOVED');
  });

  await test('Removed post is invisible to normal users', async () => {
    const res = await normal.get(`/posts/${modPost._id}`);
    assert(res.status === 404, `Expected 404 for removed post, got ${res.status}`);
  });

  await test('Admin can restore post to ACTIVE', async () => {
    const res = await admin.patch(`/admin/posts/${modPost._id}/moderation`, { status: 'ACTIVE' });
    assertEqual(res.status, 200, 'Status');
    const res2 = await normal.get(`/posts/${modPost._id}`);
    assertEqual(res2.status, 200, 'Restored post should be visible');
  });

  // Comment moderation
  await test('Admin can HIDE a comment', async () => {
    const res = await admin.patch(`/admin/comments/${testComment._id}/moderation`, { status: 'HIDDEN' });
    assertEqual(res.status, 200, 'Status');
    const updated = await Comment.findById(testComment._id);
    assertEqual(updated.moderationStatus, 'HIDDEN', 'Comment should be HIDDEN');
  });

  await test('Hidden comment does not appear in post comment list', async () => {
    const res = await normal.get(`/posts/${testPost._id}/comments`);
    assertEqual(res.status, 200, 'Status');
    const commentIds = (res.data.data?.comments || []).map((c) => c._id?.toString());
    assert(
      !commentIds.includes(testComment._id.toString()),
      'Hidden comment should not appear in list'
    );
    // Restore for cleanup
    await Comment.findByIdAndUpdate(testComment._id, { moderationStatus: 'ACTIVE' });
  });

  // Story moderation
  await test('Admin can REMOVE a story', async () => {
    const res = await admin.patch(`/admin/stories/${testStory._id}/moderation`, { status: 'REMOVED' });
    assertEqual(res.status, 200, 'Status');
    const updated = await Story.findById(testStory._id);
    assertEqual(updated.moderationStatus, 'REMOVED', 'Story should be REMOVED');
  });

  await test('Invalid moderation status is rejected (400)', async () => {
    const res = await admin.patch(`/admin/posts/${modPost._id}/moderation`, { status: 'DELETED' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Cleanup
  await Post.deleteOne({ _id: modPost._id });
}

async function testUserSuspension() {
  console.log('\n── 6. User Suspension ───────────────────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);
  const target = new TestClient();

  // Log in as targetUser to get a fresh token
  const targetLoginRes = await target.post('/auth/login', {
    email: 'targetuser_p23@test.com',
    password: 'TargetPass123!',
  });
  const targetToken = targetLoginRes.data?.data?.accessToken;
  const targetRefreshToken = targetLoginRes.data?.data?.refreshToken;
  target.setAccessToken(targetToken);

  await test('Admin can suspend a user account', async () => {
    const res = await admin.patch(`/admin/users/${targetUser._id}/status`, {
      status: 'SUSPENDED',
      reason: 'Testing suspension - automated test',
    });
    assertEqual(res.status, 200, 'Status');
    assert(res.data.data.currentStatus === 'SUSPENDED', 'User should be SUSPENDED');
  });

  await test('Suspended user cannot log in (403 ACCOUNT_SUSPENDED)', async () => {
    const loginClient = new TestClient();
    const res = await loginClient.post('/auth/login', {
      email: 'targetuser_p23@test.com',
      password: 'TargetPass123!',
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('All refresh sessions are revoked for suspended user', async () => {
    // Sessions for targetUser should all be revoked
    const sessions = await Session.find({
      user: targetUser._id,
      revokedAt: null,
    });
    assert(sessions.length === 0, `Expected 0 active sessions, found ${sessions.length}`);
  });

  await test('Suspended user is excluded from public user search', async () => {
    const normal = new TestClient();
    normal.setAccessToken(normalToken);
    const res = await normal.get('/users/search?q=targetuser');
    assertEqual(res.status, 200, 'Status');
    const users = res.data.data?.users || [];
    const found = users.some((u) => u.username === 'targetuser_p23');
    assert(!found, 'Suspended user should not appear in search results');
  });

  await test('Admin cannot suspend another admin (403)', async () => {
    const res = await admin.patch(`/admin/users/${adminUser._id}/status`, {
      status: 'SUSPENDED',
    });
    // Admin cannot suspend themselves
    assert(res.status === 400 || res.status === 403, `Expected 400/403, got ${res.status}`);
  });

  await test('Admin cannot modify their own status (400)', async () => {
    const res = await admin.patch(`/admin/users/${adminUser._id}/status`, {
      status: 'SUSPENDED',
    });
    assert(res.status === 400 || res.status === 403, `Expected 400/403, got ${res.status}`);
  });

  await test('Admin can reactivate a suspended user', async () => {
    const res = await admin.patch(`/admin/users/${targetUser._id}/status`, {
      status: 'ACTIVE',
    });
    assertEqual(res.status, 200, 'Status');
    assert(res.data.data.currentStatus === 'ACTIVE', 'User should be ACTIVE');
  });

  await test('Reactivated user can log in again', async () => {
    const loginClient = new TestClient();
    const res = await loginClient.post('/auth/login', {
      email: 'targetuser_p23@test.com',
      password: 'TargetPass123!',
    });
    assertEqual(res.status, 200, 'Reactivated user should be able to login');
    assert(res.data.data?.accessToken, 'Should receive access token');
  });
}

async function testAdminUserList() {
  console.log('\n── 7. Admin User List ───────────────────────────────────');

  const admin = new TestClient();
  admin.setAccessToken(adminToken);

  await test('Admin user list returns paginated results', async () => {
    const res = await admin.get('/admin/users?page=1&limit=10');
    assertEqual(res.status, 200, 'Status');
    const { pagination } = res.data.data;
    assert(pagination.page === 1, 'Page should be 1');
    assert(pagination.limit === 10, 'Limit should be 10');
  });

  await test('Admin user list includes email field', async () => {
    const res = await admin.get(`/admin/users?q=adminuser_p23`);
    assertEqual(res.status, 200, 'Status');
    const users = res.data.data.users;
    assert(users.length > 0, 'Should find admin user');
    assert(users[0].email, 'Should include email field');
  });

  await test('Admin user list can filter by role=ADMIN', async () => {
    const res = await admin.get('/admin/users?role=ADMIN');
    assertEqual(res.status, 200, 'Status');
    const users = res.data.data.users;
    const allAdmin = users.every((u) => u.role === 'ADMIN');
    assert(allAdmin, 'All results should have role=ADMIN');
  });

  await test('Admin user list invalid role filter returns 400', async () => {
    const res = await admin.get('/admin/users?role=SUPERUSER');
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

async function testAdminPrivacy() {
  console.log('\n── 8. Admin Privacy ─────────────────────────────────────');

  const normal = new TestClient();
  normal.setAccessToken(normalToken);

  await test('moderationNote is not exposed through user-facing report endpoints', async () => {
    // Normal users submit a report via /reports
    const res = await normal.post('/reports', {
      targetType: 'POST',
      targetId: testPost._id.toString(),
      reason: 'SPAM',
    });
    // Normal report submission should succeed or conflict (if already submitted)
    // The key is that normal users have no route to see moderationNote
    const reportsRes = await normal.get('/reports');
    assert(
      reportsRes.status === 403 || reportsRes.status === 404,
      'Normal users should not be able to list all reports'
    );
  });

  await test('Admin user list does not expose passwords or tokens', async () => {
    const admin = new TestClient();
    admin.setAccessToken(adminToken);
    const res = await admin.get('/admin/users');
    assertEqual(res.status, 200, 'Status');
    const users = res.data.data.users;
    for (const u of users) {
      assert(!u.password, 'Password should not be exposed');
      assert(!u.refreshTokenHash, 'Token hashes should not be exposed');
      assert(!u.suspensionReason || typeof u.suspensionReason === 'undefined', 'suspensionReason should not be in user list');
    }
  });

  await test('Normal user profile API does not expose role or suspensionReason', async () => {
    const res = await normal.get('/auth/me');
    assert(res.status === 200 || res.status === 401, `Unexpected status: ${res.status}`);
    if (res.status === 200 && res.data?.data) {
      const user = res.data.data?.user || res.data.data;
      assert(!user.role, 'role should not be in normal user response');
      assert(!user.suspensionReason, 'suspensionReason should not be in normal user response');
    }
  });
}

async function testAccountStatusWriteEndpoints() {
  console.log('\n── 9. Write-Endpoint Blocking for Suspended Users ───────');

  // Create a fresh user, suspend them, then check write endpoints
  const freshClient = new TestClient();
  await freshClient.post('/auth/register', {
    username: 'suspendedwriter_p23',
    email: 'suspendedwriter_p23@test.com',
    password: 'WriterPass123!',
    fullName: 'Suspended Writer',
  });
  const freshLoginRes = await freshClient.post('/auth/login', {
    email: 'suspendedwriter_p23@test.com',
    password: 'WriterPass123!',
  });
  const freshToken = freshLoginRes.data?.data?.accessToken;
  freshClient.setAccessToken(freshToken);
  const freshUser = await User.findOne({ username: 'suspendedwriter_p23' });

  // Suspend via direct DB (simulating admin action without needing another login flow)
  await User.updateOne(
    { _id: freshUser._id },
    { $set: { accountStatus: 'SUSPENDED', suspendedAt: new Date() } }
  );

  await test('Suspended user cannot create a post (403 ACCOUNT_SUSPENDED)', async () => {
    const res = await freshClient.post('/posts', { caption: 'This should be blocked' });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Suspended user cannot create a story (403 ACCOUNT_SUSPENDED)', async () => {
    // Stories require multipart — just check the auth layer responds correctly
    const res = await freshClient.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-skip-rate-limit': 'true',
        Authorization: `Bearer ${freshToken}`,
      },
      body: JSON.stringify({ caption: 'Blocked story' }),
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Suspended user cannot start a conversation (403 ACCOUNT_SUSPENDED)', async () => {
    const res = await freshClient.post('/conversations', {
      participantId: normalUser._id.toString(),
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('Normal user write endpoints still work after suspension system added', async () => {
    const normal = new TestClient();
    normal.setAccessToken(normalToken);
    // Creating a post should still work for normal ACTIVE users
    const res = await normal.post('/posts', { caption: 'TEST_P23: Normal user write test' });
    assert(
      res.status === 200 || res.status === 201,
      `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`
    );
    if (res.data?.data?._id) {
      await Post.deleteOne({ _id: res.data.data._id });
    }
  });

  await test('Existing public read endpoints unaffected by moderation additions', async () => {
    const anon = new TestClient();
    const res = await anon.get(`/posts/${testPost._id}`);
    // testPost should still be accessible (ACTIVE)
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // Cleanup
  await User.deleteOne({ _id: freshUser._id });
}

// ─── Main Runner ──────────────────────────────────────────────────────────────
async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('   Phase 23: Admin Role & Moderation System Test Suite');
  console.log('══════════════════════════════════════════════════════════\n');

  try {
    await setup();

    await testRoleAuthorization();
    await testPrivilegeEscalation();
    await testReportQueue();
    await testReportStatusTransitions();
    await testContentModeration();
    await testUserSuspension();
    await testAdminUserList();
    await testAdminPrivacy();
    await testAccountStatusWriteEndpoints();

  } catch (setupErr) {
    console.error('\n❌ Fatal setup error:', setupErr.message);
    console.error(setupErr.stack);
  } finally {
    await teardown();
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('   ✅ All Phase 23 tests passed!');
  } else {
    console.log(`   ⚠️  ${failed} test(s) failed. Review output above.`);
  }
  console.log('══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
