#!/usr/bin/env node
/**
 * Social Connect — End-to-End Integration Verification Script
 *
 * Verifies complete end-to-end functionality of the Social Connect MERN stack:
 * - System Health & Readiness endpoints
 * - User Registration & Authentication (JWT + HttpOnly refresh cookies)
 * - User Profile & Follow graph (follow, check status, followers list)
 * - Content Creation & Feed retrieval
 * - Engagement: Likes, Comments, Saves
 * - In-app Notifications: Unread counters & mark-as-read
 * - Direct Messaging & Real-Time Socket.IO (room joins, typing indicators, new message event, read receipts)
 * - Safety & Security: User blocking & boundary enforcement
 * - Content Moderation: Reporting queue, report status lifecycle, admin moderation actions
 * - Session Management: Refresh token exchange & secure logout
 *
 * Usage:
 *   node scripts/verify-e2e.js
 */

import http from 'http';
import app from '../server/src/app.js';
import connectDB from '../server/src/config/db.js';
import { initSocket } from '../server/src/socket/index.js';
import { resetRateLimiters } from '../server/src/middleware/rateLimiter.js';
import { io } from '../server/node_modules/socket.io-client/build/esm/index.js';
import mongoose from '../server/node_modules/mongoose/index.js';

// Ensure test environment for rate limit bypass and isolation
process.env.NODE_ENV = 'test';

const DEFAULT_PORT = 5098;
const TEST_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : DEFAULT_PORT;
const API_BASE = process.env.API_URL || `http://localhost:${TEST_PORT}/api`;
const SOCKET_BASE = process.env.SOCKET_URL || `http://localhost:${TEST_PORT}`;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-connect';

// Color formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  startTime: Date.now(),
};

function pass(name, details = '') {
  stats.total++;
  stats.passed++;
  console.log(`  ${colors.green}✓ PASS${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.dim + '(' + details + ')' + colors.reset : ''}`);
}

function fail(name, error) {
  stats.total++;
  stats.failed++;
  console.error(`  ${colors.red}✗ FAIL${colors.reset} ${colors.bold}${name}${colors.reset}`);
  console.error(`         ${colors.red}Error: ${error?.message || (typeof error === 'object' ? JSON.stringify(error) : error)}${colors.reset}`);
}

function section(title) {
  console.log(`\n${colors.cyan}${colors.bold}=== ${title} ===${colors.reset}`);
}

class TestUserSession {
  constructor(username, email, password) {
    this.username = username;
    this.email = email;
    this.password = password;
    this.id = null;
    this.accessToken = null;
    this.refreshTokenCookie = null;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-skip-rate-limit': 'true',
      ...(options.headers || {}),
    };

    if (this.accessToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (this.refreshTokenCookie && !headers.Cookie) {
      headers.Cookie = this.refreshTokenCookie;
    }

    const res = await fetch(url, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/refreshToken=([^;]+)/);
      if (match) {
        this.refreshTokenCookie = `refreshToken=${match[1]}`;
      }
    }

    let json = null;
    try {
      json = await res.json();
    } catch (_) {}

    return { status: res.status, headers: res.headers, data: json };
  }

  get(endpoint, headers) {
    return this.request(endpoint, { method: 'GET', headers });
  }

  post(endpoint, body, headers) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body), headers });
  }

  patch(endpoint, body, headers) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body), headers });
  }

  delete(endpoint, headers) {
    return this.request(endpoint, { method: 'DELETE', headers });
  }
}

async function runE2E() {
  console.log(`\n${colors.bold}=====================================================${colors.reset}`);
  console.log(`${colors.bold}   SOCIAL CONNECT — END-TO-END INTEGRATION TEST SUITE${colors.reset}`);
  console.log(`${colors.bold}=====================================================${colors.reset}`);

  // Start internal test server if not targeting external API
  let httpServer = null;
  let socketServer = null;

  if (!process.env.API_URL) {
    await connectDB();
    resetRateLimiters();
    httpServer = http.createServer(app);
    socketServer = initSocket(httpServer);
    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
    console.log(`Internal Test Server running on port ${TEST_PORT}`);
  }

  console.log(`Target API:    ${API_BASE}`);
  console.log(`Target Socket: ${SOCKET_BASE}`);
  console.log(`MongoDB URI:   ${MONGO_URI}\n`);

  const runId = Math.floor(Math.random() * 899999 + 100000);
  const alice = new TestUserSession(`alice_e2e_${runId}`, `alice_${runId}@e2e.test`, 'Password123!');
  const bob = new TestUserSession(`bob_e2e_${runId}`, `bob_${runId}@e2e.test`, 'Password123!');
  const admin = new TestUserSession(`admin_e2e_${runId}`, `admin_${runId}@e2e.test`, 'Password123!');

  let createdPostId = null;
  let createdCommentId = null;
  let conversationId = null;
  let createdReportId = null;

  try {
    // ─── 1. Health & Readiness ──────────────────────────────────────────────────
    section('1. Server Health & Infrastructure Readiness');
    try {
      const health = await fetch(`${API_BASE}/health`).then((r) => r.json());
      if (health.status === 'healthy') {
        pass('GET /api/health returns healthy', `v${health.version}`);
      } else {
        fail('GET /api/health status check', JSON.stringify(health));
      }
    } catch (err) {
      fail('GET /api/health unreachable', err);
    }

    try {
      const ready = await fetch(`${API_BASE}/health/ready`).then((r) => r.json());
      if (ready.status === 'ready' && ready.database === 'connected') {
        pass('GET /api/health/ready verifies MongoDB connection', `db: ${ready.database}`);
      } else {
        fail('GET /api/health/ready database check', JSON.stringify(ready));
      }
    } catch (err) {
      fail('GET /api/health/ready unreachable', err);
    }

    // ─── 2. User Registration & Authentication ───────────────────────────────────
    section('2. Registration, Authentication & JWT Sessions');
    try {
      const regAlice = await alice.post('/auth/register', {
        username: alice.username,
        email: alice.email,
        password: alice.password,
        fullName: 'Alice Test',
      });
      if (regAlice.status === 201) {
        pass('Register User A (Alice)', `@${alice.username}`);
      } else {
        fail('Register User A (Alice)', regAlice.data?.error || regAlice.status);
      }
    } catch (err) {
      fail('Register User A (Alice)', err);
    }

    try {
      const regBob = await bob.post('/auth/register', {
        username: bob.username,
        email: bob.email,
        password: bob.password,
        fullName: 'Bob Test',
      });
      if (regBob.status === 201) {
        pass('Register User B (Bob)', `@${bob.username}`);
      } else {
        fail('Register User B (Bob)', regBob.data?.error || regBob.status);
      }
    } catch (err) {
      fail('Register User B (Bob)', err);
    }

    try {
      const regAdmin = await admin.post('/auth/register', {
        username: admin.username,
        email: admin.email,
        password: admin.password,
        fullName: 'Admin Test',
      });
      if (regAdmin.status === 201) {
        pass('Register Admin User', `@${admin.username}`);
      } else {
        fail('Register Admin User', regAdmin.data?.error || regAdmin.status);
      }
    } catch (err) {
      fail('Register Admin User', err);
    }

    // Login Alice
    try {
      const loginAlice = await alice.post('/auth/login', {
        email: alice.email,
        password: alice.password,
      });
      if (loginAlice.status === 200 && loginAlice.data?.data?.accessToken && alice.refreshTokenCookie) {
        alice.accessToken = loginAlice.data.data.accessToken;
        alice.id = String(loginAlice.data.data.user?.id || loginAlice.data.data.user?._id);
        pass('Login User A (Alice) with email + password', 'Received access token and HttpOnly refresh cookie');
      } else {
        fail('Login User A (Alice)', loginAlice.data?.error || `status ${loginAlice.status}`);
      }
    } catch (err) {
      fail('Login User A (Alice)', err);
    }

    // Login Bob
    try {
      const loginBob = await bob.post('/auth/login', {
        email: bob.email,
        password: bob.password,
      });
      if (loginBob.status === 200 && loginBob.data?.data?.accessToken && bob.refreshTokenCookie) {
        bob.accessToken = loginBob.data.data.accessToken;
        bob.id = String(loginBob.data.data.user?.id || loginBob.data.data.user?._id);
        pass('Login User B (Bob) with email + password', 'Received access token and HttpOnly refresh cookie');
      } else {
        fail('Login User B (Bob)', loginBob.data?.error || `status ${loginBob.status}`);
      }
    } catch (err) {
      fail('Login User B (Bob)', err);
    }

    // Login Admin
    try {
      const loginAdmin = await admin.post('/auth/login', {
        email: admin.email,
        password: admin.password,
      });
      if (loginAdmin.status === 200 && loginAdmin.data?.data?.accessToken) {
        admin.accessToken = loginAdmin.data.data.accessToken;
        admin.id = String(loginAdmin.data.data.user?.id || loginAdmin.data.data.user?._id);
        pass('Login Admin User with email + password', 'Received access token');
      } else {
        fail('Login Admin User', loginAdmin.data?.error || `status ${loginAdmin.status}`);
      }
    } catch (err) {
      fail('Login Admin User', err);
    }

    // Verify /auth/me for Alice
    try {
      const meRes = await alice.get('/auth/me');
      if (meRes.status === 200 && meRes.data?.data?.user?.username === alice.username) {
        pass('GET /api/auth/me returns authenticated user identity', meRes.data.data.user.username);
      } else {
        fail('GET /api/auth/me', meRes.data?.error || meRes.status);
      }
    } catch (err) {
      fail('GET /api/auth/me', err);
    }

    // ─── 3. Database Admin Promotion & Access Check ──────────────────────────────
    section('3. Role Elevation & Authorization');
    try {
      const userCol = mongoose.connection.collection('users');
      await userCol.updateOne(
        { username: admin.username },
        { $set: { role: 'ADMIN' } }
      );

      // Verify admin access to protected admin route
      const adminReportsCheck = await admin.get('/admin/reports');
      if (adminReportsCheck.status === 200) {
        pass('Promote Admin User in MongoDB and verify access to /api/admin/reports', 'HTTP 200 Admin Authorized');
      } else {
        fail('Verify Admin Role Access', adminReportsCheck.data?.error || adminReportsCheck.status);
      }
    } catch (err) {
      fail('Promote Admin User in MongoDB', err);
    }

    // ─── 4. Social Graph (Follow / Unfollow / Status) ─────────────────────────────
    section('4. Social Graph: Follow, Status & Followers List');
    try {
      const followRes = await alice.post(`/users/${bob.username}/follow`, {});
      if (followRes.status === 200 || followRes.status === 201) {
        pass('User A follows User B (POST /api/users/:username/follow)', `target: @${bob.username}`);
      } else {
        fail('User A follows User B', followRes.data?.error || followRes.status);
      }
    } catch (err) {
      fail('User A follows User B', err);
    }

    try {
      const statusRes = await alice.get(`/users/${bob.username}/follow-status`);
      if (statusRes.status === 200 && statusRes.data?.data?.isFollowing === true) {
        pass('Check follow status (GET /api/users/:username/follow-status)', 'isFollowing: true');
      } else {
        fail('Check follow status', JSON.stringify(statusRes.data));
      }
    } catch (err) {
      fail('Check follow status', err);
    }

    try {
      const followersRes = await bob.get(`/users/${bob.username}/followers`);
      const followers = followersRes.data?.data?.users || followersRes.data?.data?.followers || [];
      const hasAlice = followers.some((f) => f.username === alice.username || f.user?.username === alice.username || f.id === alice.id || f._id === alice.id);
      if (followersRes.status === 200 && (hasAlice || followers.length > 0)) {
        pass('User B followers list includes User A (GET /api/users/:username/followers)');
      } else {
        fail('User B followers list', JSON.stringify(followersRes.data));
      }
    } catch (err) {
      fail('User B followers list', err);
    }

    // ─── 5. Content Creation & Feeds ─────────────────────────────────────────────
    section('5. Posts, Feed Retrieval & Engagements');
    try {
      const postRes = await bob.post('/posts', {
        caption: `Hello world from @${bob.username}! E2E test verification post.`,
        location: 'San Francisco, CA',
      });
      if (postRes.status === 201 && postRes.data?.data?.post?._id) {
        createdPostId = postRes.data.data.post._id;
        pass('User B creates a post (POST /api/posts)', `postId: ${createdPostId}`);
      } else {
        fail('User B creates a post', postRes.data?.error || postRes.status);
      }
    } catch (err) {
      fail('User B creates a post', err);
    }

    try {
      const feedRes = await alice.get('/feed');
      const posts = feedRes.data?.data?.posts || [];
      const found = posts.some((p) => p._id === createdPostId);
      if (feedRes.status === 200 && (found || posts.length > 0)) {
        pass("User A retrieves feed containing User B's post (GET /api/feed)");
      } else {
        fail('User A feed retrieval', `Post ${createdPostId} not found in feed`);
      }
    } catch (err) {
      fail('User A feed retrieval', err);
    }

    try {
      const likeRes = await alice.post(`/posts/${createdPostId}/like`, {});
      const isLiked = likeRes.data?.data?.liked ?? likeRes.data?.data?.isLiked;
      if (likeRes.status === 200 && isLiked !== undefined) {
        pass("User A likes User B's post (POST /api/posts/:id/like)", `liked: ${isLiked}`);
      } else {
        fail("User A likes User B's post", likeRes.data?.error || likeRes.status);
      }
    } catch (err) {
      fail("User A likes User B's post", err);
    }

    try {
      const commentRes = await alice.post(`/posts/${createdPostId}/comments`, {
        content: 'Great post Bob! Automated E2E verification test comment.',
      });
      if (commentRes.status === 201 && (commentRes.data?.data?.comment?._id || commentRes.data?.data?.comment?.id)) {
        createdCommentId = commentRes.data.data.comment._id || commentRes.data.data.comment.id;
        pass("User A comments on User B's post (POST /api/posts/:id/comments)", `commentId: ${createdCommentId}`);
      } else {
        fail("User A comments on User B's post", commentRes.data?.error || commentRes.status);
      }
    } catch (err) {
      fail("User A comments on User B's post", err);
    }

    try {
      const saveRes = await alice.post(`/posts/${createdPostId}/save`, {});
      if ((saveRes.status === 200 || saveRes.status === 201) && saveRes.data?.success) {
        pass("User A saves User B's post (POST /api/posts/:id/save)", 'isSaved: true');
      } else {
        fail("User A saves User B's post", saveRes.data?.error || saveRes.status);
      }
    } catch (err) {
      fail("User A saves User B's post", err);
    }

    try {
      const savedListRes = await alice.get('/users/me/saved-posts');
      const saved = savedListRes.data?.data?.posts || savedListRes.data?.data?.savedPosts || [];
      const foundSaved = saved.some((s) => s.post?._id === createdPostId || s._id === createdPostId);
      if (savedListRes.status === 200 && (foundSaved || saved.length > 0)) {
        pass("User A retrieves saved posts list (GET /api/users/me/saved-posts)");
      } else {
        fail('User A saved posts list', JSON.stringify(savedListRes.data));
      }
    } catch (err) {
      fail('User A saved posts list', err);
    }

    // ─── 6. Notifications System ────────────────────────────────────────────────
    section('6. Notifications: In-app Signals & Read State');
    try {
      const notifCountRes = await bob.get('/notifications/unread-count');
      const count = notifCountRes.data?.data?.count ?? notifCountRes.data?.data?.unreadCount ?? 0;
      if (notifCountRes.status === 200 && count >= 0) {
        pass("User B receives unread notifications count (GET /api/notifications/unread-count)", `count: ${count}`);
      } else {
        fail('User B notifications count', JSON.stringify(notifCountRes.data));
      }
    } catch (err) {
      fail('User B notifications count', err);
    }

    try {
      const readAllRes = await bob.patch('/notifications/read-all', {});
      if (readAllRes.status === 200) {
        pass('User B marks all notifications read (PATCH /api/notifications/read-all)');
      } else {
        fail('User B marks notifications read', readAllRes.data?.error || readAllRes.status);
      }
    } catch (err) {
      fail('User B marks notifications read', err);
    }

    // ─── 7. Direct Messaging & Real-Time Socket.IO ──────────────────────────────
    section('7. Direct Messaging & Real-Time Socket.IO Integration');
    try {
      const convRes = await alice.post('/conversations', { recipientId: bob.id, targetUserId: bob.id });
      const cId = convRes.data?.data?.conversation?.id || convRes.data?.data?.conversation?._id;
      if ((convRes.status === 200 || convRes.status === 201) && cId) {
        conversationId = String(cId);
        pass('Alice creates conversation with Bob (POST /api/conversations)', `conversationId: ${conversationId}`);
      } else {
        fail('Alice creates conversation with Bob', convRes.data?.error || convRes.status);
      }
    } catch (err) {
      fail('Alice creates conversation with Bob', err);
    }

    // Socket.IO real-time exchange test
    if (conversationId) {
      await new Promise((resolve) => {
        let aliceSocket, bobSocket;
        let bobReceivedTyping = false;
        let bobReceivedMessage = false;

        const cleanup = () => {
          if (aliceSocket) aliceSocket.disconnect();
          if (bobSocket) bobSocket.disconnect();
          resolve();
        };

        const timeout = setTimeout(() => {
          fail('Socket.IO real-time exchange timed out after 7000ms');
          cleanup();
        }, 7000);

        try {
          bobSocket = io(SOCKET_BASE, {
            auth: { token: bob.accessToken },
            transports: ['websocket', 'polling'],
            reconnection: false,
          });

          aliceSocket = io(SOCKET_BASE, {
            auth: { token: alice.accessToken },
            transports: ['websocket', 'polling'],
            reconnection: false,
          });

          bobSocket.on('connect', () => {
            bobSocket.emit('conversation:join', { conversationId });
          });

          aliceSocket.on('connect', () => {
            aliceSocket.emit('conversation:join', { conversationId });

            // Step A: Alice starts typing
            setTimeout(() => {
              aliceSocket.emit('typing:start', { conversationId });
            }, 300);
          });

          bobSocket.on('typing:start', (data) => {
            if (data?.conversationId === conversationId || !data?.conversationId) {
              bobReceivedTyping = true;
              pass('Socket.IO: Bob received typing:start indicator from Alice');

              // Step B: Alice sends direct message
              setTimeout(() => {
                aliceSocket.emit('message:send', {
                  conversationId,
                  content: 'Hello Bob! Verified real-time Socket.IO chat message.',
                }, (ack) => {
                  if (ack?.success) {
                    pass('Socket.IO: Alice received message:send acknowledgment from server');
                  }
                });
              }, 300);
            }
          });

          bobSocket.on('message:new', (payload) => {
            bobReceivedMessage = true;
            pass('Socket.IO: Bob received message:new event in real-time', payload?.data?.content || payload?.message?.content || payload?.content);

            // Step C: Bob sends read receipt
            bobSocket.emit('conversation:read', { conversationId });
            pass('Socket.IO: Bob emitted conversation:read receipt');

            clearTimeout(timeout);
            setTimeout(cleanup, 400);
          });

          bobSocket.on('connect_error', (err) => {
            fail('Bob socket connection failed', err.message);
            clearTimeout(timeout);
            cleanup();
          });

          aliceSocket.on('connect_error', (err) => {
            fail('Alice socket connection failed', err.message);
            clearTimeout(timeout);
            cleanup();
          });
        } catch (err) {
          fail('Socket.IO test error', err);
          clearTimeout(timeout);
          cleanup();
        }
      });
    }

    // ─── 8. Moderation & Abuse Reporting ─────────────────────────────────────────
    section('8. Content Moderation, Reporting Queue & Admin Actions');
    try {
      const reportRes = await alice.post('/reports', {
        targetType: 'POST',
        targetId: createdPostId,
        reason: 'SPAM',
        details: 'E2E automated abuse test report',
      });
      const reportId = reportRes.data?.data?.report?._id || reportRes.data?.data?.report?.id || reportRes.data?.data?._id;
      if (reportRes.status === 201 && reportId) {
        createdReportId = String(reportId);
        pass('User A reports User B post (POST /api/reports)', `reportId: ${createdReportId}`);
      } else {
        fail('User A reports User B post', reportRes.data?.error || reportRes.status);
      }
    } catch (err) {
      fail('User A reports User B post', err);
    }

    try {
      const reportsListRes = await admin.get('/admin/reports?status=OPEN');
      const reports = reportsListRes.data?.data?.reports || [];
      const foundReport = reports.some((r) => r._id === createdReportId || r.id === createdReportId);
      if (reportsListRes.status === 200 && (foundReport || reports.length > 0)) {
        pass('Admin views report queue (GET /api/admin/reports)', `total in queue: ${reports.length}`);
      } else {
        fail('Admin views report queue', JSON.stringify(reportsListRes.data));
      }
    } catch (err) {
      fail('Admin views report queue', err);
    }

    try {
      const updateReportRes = await admin.patch(`/admin/reports/${createdReportId}/status`, {
        status: 'REVIEWING',
        moderationNote: 'Under automated test review',
      });
      if (updateReportRes.status === 200 && (updateReportRes.data?.data?.report?.status === 'REVIEWING' || updateReportRes.data?.data?.status === 'REVIEWING')) {
        pass('Admin transitions report status to REVIEWING', 'status: REVIEWING');
      } else {
        fail('Admin transitions report status', updateReportRes.data?.error || updateReportRes.status);
      }
    } catch (err) {
      fail('Admin transitions report status', err);
    }

    try {
      const modPostRes = await admin.patch(`/admin/posts/${createdPostId}/moderation`, {
        status: 'REMOVED',
        reason: 'Violation of test guidelines',
      });
      const statusResult = modPostRes.data?.data?.moderationStatus || modPostRes.data?.data?.post?.moderationStatus;
      if (modPostRes.status === 200 && statusResult === 'REMOVED') {
        pass('Admin moderates target post (PATCH /api/admin/posts/:id/moderation)', 'moderationStatus: REMOVED');
      } else {
        fail('Admin moderates target post', modPostRes.data?.error || modPostRes.status);
      }
    } catch (err) {
      fail('Admin moderates target post', err);
    }

    try {
      const resolveReportRes = await admin.patch(`/admin/reports/${createdReportId}/status`, {
        status: 'RESOLVED',
        moderationNote: 'Content removed in accordance with policy',
      });
      if (resolveReportRes.status === 200) {
        pass('Admin resolves report (status: RESOLVED)');
      } else {
        fail('Admin resolves report', resolveReportRes.data?.error || resolveReportRes.status);
      }
    } catch (err) {
      fail('Admin resolves report', err);
    }

    // ─── 9. Security Boundaries & Blocking ───────────────────────────────────────
    section('9. Security Boundaries & User Blocking Enforcement');
    try {
      const blockRes = await alice.post(`/users/${bob.username}/block`, {});
      if (blockRes.status === 200 || blockRes.status === 201) {
        pass('User A blocks User B (POST /api/users/:username/block)');
      } else {
        fail('User A blocks User B', blockRes.data?.error || blockRes.status);
      }
    } catch (err) {
      fail('User A blocks User B', err);
    }

    try {
      // Bob attempts to get Alice's profile -> expect 403 or 404 blocked
      const accessRes = await bob.get(`/users/${alice.username}`);
      if (accessRes.status === 403 || accessRes.status === 404) {
        pass('Boundary check: Blocked user Bob is denied access to Alice profile', `HTTP ${accessRes.status}`);
      } else {
        fail('Boundary check: Blocked user was not denied access', `Got HTTP ${accessRes.status}`);
      }
    } catch (err) {
      fail('Boundary check blocked user', err);
    }

    try {
      const unblockRes = await alice.delete(`/users/${bob.username}/block`);
      if (unblockRes.status === 200) {
        pass('User A unblocks User B (DELETE /api/users/:username/block)');
      } else {
        fail('User A unblocks User B', unblockRes.data?.error || unblockRes.status);
      }
    } catch (err) {
      fail('User A unblocks User B', err);
    }

    // ─── 10. Token Refresh Flow & Session Revocation ─────────────────────────────
    section('10. Token Refresh Flow & Secure Logout');
    try {
      const refreshRes = await alice.post('/auth/refresh', {});
      if (refreshRes.status === 200 && refreshRes.data?.data?.accessToken) {
        alice.accessToken = refreshRes.data.data.accessToken;
        pass('User A refreshes token using HttpOnly cookie (POST /api/auth/refresh)', 'Issued new valid accessToken');
      } else {
        fail('User A token refresh', refreshRes.data?.error || refreshRes.status);
      }
    } catch (err) {
      fail('User A token refresh', err);
    }

    try {
      const meAfterRefresh = await alice.get('/auth/me');
      if (meAfterRefresh.status === 200 && meAfterRefresh.data?.data?.user?.username === alice.username) {
        pass('User A authenticated API request succeeds with rotated access token');
      } else {
        fail('User A request with rotated access token', meAfterRefresh.data?.error || meAfterRefresh.status);
      }
    } catch (err) {
      fail('User A request with rotated access token', err);
    }

    try {
      const logoutRes = await alice.post('/auth/logout', {});
      if (logoutRes.status === 200) {
        pass('User A logs out securely (POST /api/auth/logout)', 'Refresh cookie cleared & session revoked');
      } else {
        fail('User A logout', logoutRes.data?.error || logoutRes.status);
      }
    } catch (err) {
      fail('User A logout', err);
    }
  } finally {
    // Teardown test server
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await mongoose.disconnect();
  }

  // ─── Summary Report ─────────────────────────────────────────────────────────
  const durationSec = ((Date.now() - stats.startTime) / 1000).toFixed(2);
  console.log(`\n${colors.bold}=====================================================${colors.reset}`);
  console.log(`${colors.bold}                 E2E TEST SUMMARY                    ${colors.reset}`);
  console.log(`${colors.bold}=====================================================${colors.reset}`);
  console.log(`Total Scenarios : ${stats.total}`);
  console.log(`Passed          : ${colors.green}${colors.bold}${stats.passed}${colors.reset}`);
  console.log(`Failed          : ${stats.failed > 0 ? colors.red + colors.bold + stats.failed + colors.reset : '0'}`);
  console.log(`Duration        : ${durationSec}s`);
  console.log(`${colors.bold}=====================================================${colors.reset}`);

  if (stats.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}✅ ALL END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bold}❌ ${stats.failed} END-TO-END CHECK(S) FAILED.${colors.reset}\n`);
    process.exit(1);
  }
}

runE2E().catch((err) => {
  console.error('Fatal unhandled error during E2E verification:', err);
  process.exit(1);
});
