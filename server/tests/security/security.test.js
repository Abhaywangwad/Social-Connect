/**
 * =============================================================================
 * Social Connect — Phase 33: Security Test Suite
 * =============================================================================
 *
 * Tests REAL security behaviors of the application, not just status codes.
 *
 * IMPORTANT: The global test lifecycle (testLifecycle.js) calls clearDatabase()
 * in beforeEach, so ALL test fixtures must be created INSIDE each it() block or
 * in a beforeEach hook within the describe block.
 *
 * Coverage:
 *  SEC-01  Authentication bypass / missing auth headers
 *  SEC-02  IDOR — post resource isolation between users
 *  SEC-03  IDOR — conversation isolation
 *  SEC-04  Mass assignment — privilege escalation via req.body
 *  SEC-05  NoSQL injection via login endpoint
 *  SEC-06  NoSQL injection via search endpoint
 *  SEC-07  JWT algorithm confusion / tampered tokens
 *  SEC-08  Admin endpoint access by normal user
 *  SEC-09  Suspended user write restriction
 *  SEC-10  Blocked user bypass attempt
 *  SEC-11  Moderated post visibility in public feed (F-03 fix regression)
 *  SEC-12  Rate limit bypass header restriction (F-01 fix regression)
 *  SEC-13  Sensitive data not leaked in user profile responses
 *  SEC-14  profilePicture URL scheme restriction (F-02 fix regression)
 *  SEC-15  Request body size limit enforced
 *  SEC-16  Unknown route returns 404 not stack trace
 *  SEC-17  Expired token correctly rejected
 *  SEC-18  Session revocation prevents further access
 *  SEC-19  Password not returned in search response
 *  SEC-20  File upload — only valid image magic bytes accepted
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Post from '../../src/models/Post.js';
import Block from '../../src/models/Block.js';
import { createTestUser, createAdminUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost, createTestConversation } from '../helpers/entityHelper.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { sessionService } from '../../src/services/sessionService.js';
import jwt from 'jsonwebtoken';

// ─── Skip Rate Limiter ────────────────────────────────────────────────────────
// In NODE_ENV=test this header is accepted (after F-01 fix, it is still
// allowed in test mode only, which is the correct and expected behaviour).
const SKIP_RL = { 'x-skip-rate-limit': 'true' };

// ─── Fake ObjectId ────────────────────────────────────────────────────────────
const FAKE_OID = new mongoose.Types.ObjectId().toString();

// =============================================================================
// SEC-01: Authentication Bypass — Missing/Malformed Auth Headers
// =============================================================================
describe('SEC-01: Authentication bypass', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/users/me').set(SKIP_RL);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for malformed bearer format', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: 'Basic somebase64value' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for bearer with empty token string', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: 'Bearer ' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a completely invalid token', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: 'Bearer not.a.real.jwt' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with wrong secret', async () => {
    const fakeToken = jwt.sign({ sub: FAKE_OID, userId: FAKE_OID }, 'wrong_secret', {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: `Bearer ${fakeToken}` });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SEC-02: IDOR — Post Resource Isolation
// =============================================================================
describe('SEC-02: IDOR on post resources', () => {
  it('owner can update their own post', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);
    const post = await createTestPost(userA._id);

    const res = await request(app)
      .patch(`/api/posts/${post._id}`)
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ caption: 'Updated by owner' });
    expect(res.status).toBe(200);
    expect(res.body.data.post.caption).toBe('Updated by owner');
  });

  it('non-owner cannot update another user\'s post — IDOR blocked (403)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userBTokens = await loginTestUser(userB);
    const post = await createTestPost(userA._id);

    const res = await request(app)
      .patch(`/api/posts/${post._id}`)
      .set({ ...SKIP_RL, ...userBTokens.authHeader })
      .send({ caption: 'Injected caption by attacker' });
    expect(res.status).toBe(403);
  });

  it('non-owner cannot delete another user\'s post — IDOR blocked (403)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userBTokens = await loginTestUser(userB);
    const post = await createTestPost(userA._id);

    const res = await request(app)
      .delete(`/api/posts/${post._id}`)
      .set({ ...SKIP_RL, ...userBTokens.authHeader });
    expect(res.status).toBe(403);
  });

  it('unauthenticated client cannot delete any post', async () => {
    const userA = await createTestUser();
    const post = await createTestPost(userA._id);

    const res = await request(app)
      .delete(`/api/posts/${post._id}`)
      .set(SKIP_RL);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SEC-03: IDOR — Conversation Resource Isolation
// =============================================================================
describe('SEC-03: IDOR on conversations', () => {
  it('third-party user cannot access a conversation they are not part of (403 or 404)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userATokens = await loginTestUser(userA);
    const conv = await createTestConversation(userA._id, userB._id);

    // Create a completely separate user C
    const userC = await createTestUser();
    const userCTokens = await loginTestUser(userC);

    const res = await request(app)
      .get(`/api/conversations/${conv._id}`)
      .set({ ...SKIP_RL, ...userCTokens.authHeader });
    // Must not return 200 — the user is not a participant
    expect(res.status).toBeOneOf([403, 404]);
    expect(res.body.success).toBe(false);
  });

  it('unauthenticated client cannot read any conversation', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const conv = await createTestConversation(userA._id, userB._id);

    const res = await request(app)
      .get(`/api/conversations/${conv._id}`)
      .set(SKIP_RL);
    expect(res.status).toBe(401);
  });

  it('participant can access their own conversation', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userATokens = await loginTestUser(userA);
    const conv = await createTestConversation(userA._id, userB._id);

    const res = await request(app)
      .get(`/api/conversations/${conv._id}`)
      .set({ ...SKIP_RL, ...userATokens.authHeader });
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// SEC-04: Mass Assignment — Privilege Escalation via req.body
// =============================================================================
describe('SEC-04: Mass assignment protection', () => {
  it('cannot promote self to ADMIN by sending role in body (PATCH /api/users/me)', async () => {
    const userA = await createTestUser({ role: 'USER' });
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ role: 'ADMIN' });

    // Should either 400 (strict schema rejects extra fields) or 200 with role unchanged
    if (res.status === 200) {
      const refreshed = await User.findById(userA._id).lean();
      expect(refreshed.role).toBe('USER'); // role must NOT have been updated
    } else {
      // Validation rejected the field
      expect(res.status).toBe(400);
    }
  });

  it('cannot set own accountStatus to ACTIVE via profile update', async () => {
    const suspendedUser = await createTestUser({ accountStatus: 'SUSPENDED' });
    const suspendedTokens = await loginTestUser(suspendedUser);

    await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...suspendedTokens.authHeader })
      .send({ accountStatus: 'ACTIVE', fullName: 'Legit Name Update' });

    const refreshed = await User.findById(suspendedUser._id).lean();
    // Account status must still be SUSPENDED regardless of response code
    expect(refreshed.accountStatus).toBe('SUSPENDED');
  });

  it('cannot set own isVerified flag via profile update', async () => {
    const unverified = await createTestUser({ isVerified: false });
    const unverifiedTokens = await loginTestUser(unverified);

    await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...unverifiedTokens.authHeader })
      .send({ isVerified: true });

    const refreshed = await User.findById(unverified._id).lean();
    expect(refreshed.isVerified).toBe(false);
  });

  it('cannot modify post moderationStatus via post update', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);
    const post = await createTestPost(userA._id);

    await request(app)
      .patch(`/api/posts/${post._id}`)
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ moderationStatus: 'APPROVED', caption: 'Caption' });

    const refreshed = await Post.findById(post._id).lean();
    // moderationStatus should remain 'ACTIVE' (the default), not 'APPROVED'
    expect(refreshed.moderationStatus).toBe('ACTIVE');
  });
});

// =============================================================================
// SEC-05: NoSQL Injection via Login Endpoint
// =============================================================================
describe('SEC-05: NoSQL injection via login', () => {
  it('rejects $gt operator as email value with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(SKIP_RL)
      .send({ email: { $gt: '' }, password: 'anything' });
    // Zod validation requires email to be a string — must reject
    expect(res.status).toBe(400);
  });

  it('rejects object as password value with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(SKIP_RL)
      .send({ email: 'attacker@example.com', password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('rejects $where operator in email field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(SKIP_RL)
      .send({ email: { $where: 'this.username.length > 0' }, password: 'x' });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// SEC-06: NoSQL Injection via Search Endpoint
// =============================================================================
describe('SEC-06: NoSQL injection via search', () => {
  it('search with MongoDB operator in q does not crash and returns safe results', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .get('/api/users/search')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .query({ q: '{ $gt: "" }' });
    // Should return valid 200 with 0 results, not crash
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      const users = res.body.data?.users || [];
      users.forEach(u => {
        expect(u.username).not.toMatch(/\$/);
      });
    }
  });

  it('search with regex special chars is safely escaped and returns 200', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .get('/api/users/search')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .query({ q: '.*injected.*' });
    expect([200, 400]).toContain(res.status);
  });
});

// =============================================================================
// SEC-07: JWT Algorithm Confusion / Token Tampering
// =============================================================================
describe('SEC-07: JWT algorithm confusion and tampering', () => {
  it('rejects a token signed with HS384 (wrong algorithm)', async () => {
    const fakeToken = jwt.sign({ sub: FAKE_OID, userId: FAKE_OID }, 'secret', {
      algorithm: 'HS384',
      expiresIn: '15m',
    });
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: `Bearer ${fakeToken}` });
    expect(res.status).toBe(401);
  });

  it('rejects tokens with modified payload claims (signature mismatch)', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const [header, , sig] = userATokens.accessToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: FAKE_OID, userId: FAKE_OID, role: 'ADMIN' })
    ).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;

    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: `Bearer ${tamperedToken}` });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SEC-08: Admin Endpoint Access by Normal User
// =============================================================================
describe('SEC-08: Admin authorization enforcement', () => {
  it('normal user cannot access admin user list (403)', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .get('/api/admin/users')
      .set({ ...SKIP_RL, ...userATokens.authHeader });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('ADMIN_ACCESS_REQUIRED');
  });

  it('unauthenticated client cannot access admin endpoints (401)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set(SKIP_RL);
    expect(res.status).toBe(401);
  });

  it('admin user can access admin user list (200)', async () => {
    const adminUser = await createAdminUser();
    const adminTokens = await loginTestUser(adminUser);

    const res = await request(app)
      .get('/api/admin/users')
      .set({ ...SKIP_RL, ...adminTokens.authHeader });
    expect(res.status).toBe(200);
  });

  it('admin token issued before demotion is rejected after DB role change', async () => {
    // Create admin, issue token, then demote in DB — token should no longer work
    const demoted = await createAdminUser();
    const demotedTokens = await loginTestUser(demoted);

    // Demote the user in DB AFTER token was issued
    await User.findByIdAndUpdate(demoted._id, { role: 'USER' });

    const res = await request(app)
      .get('/api/admin/users')
      .set({ ...SKIP_RL, ...demotedTokens.authHeader });
    // Must be 403 even though the JWT was issued when they were ADMIN
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// SEC-09: Suspended User Write Restriction
// =============================================================================
describe('SEC-09: Suspended user write enforcement', () => {
  it('suspended user cannot create a post (403)', async () => {
    const suspendedUser = await createTestUser({ accountStatus: 'SUSPENDED' });
    const suspendedTokens = await loginTestUser(suspendedUser);

    const res = await request(app)
      .post('/api/posts')
      .set({ ...SKIP_RL, ...suspendedTokens.authHeader })
      .send({ caption: 'Should not be allowed' });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('suspended user cannot create a story (403)', async () => {
    const suspendedUser = await createTestUser({ accountStatus: 'SUSPENDED' });
    const suspendedTokens = await loginTestUser(suspendedUser);

    const res = await request(app)
      .post('/api/stories')
      .set({ ...SKIP_RL, ...suspendedTokens.authHeader })
      .send({});
    expect(res.status).toBe(403);
  });

  it('suspended user cannot initiate a conversation (403)', async () => {
    const suspendedUser = await createTestUser({ accountStatus: 'SUSPENDED' });
    const suspendedTokens = await loginTestUser(suspendedUser);
    const userA = await createTestUser();

    const res = await request(app)
      .post('/api/conversations')
      .set({ ...SKIP_RL, ...suspendedTokens.authHeader })
      .send({ userId: userA._id.toString() });
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// SEC-10: Blocked User Bypass Attempt
// =============================================================================
describe('SEC-10: Blocked user access control', () => {
  it("blocked user cannot view blocker's public profile (404)", async () => {
    const blocker = await createTestUser();
    const blockee = await createTestUser();
    const blockeeTokens = await loginTestUser(blockee);

    // blocker blocks blockee
    await Block.create({ blocker: blocker._id, blocked: blockee._id });

    const res = await request(app)
      .get(`/api/users/${blocker.username}`)
      .set({ ...SKIP_RL, ...blockeeTokens.authHeader });
    expect(res.status).toBe(404);
  });

  it("blocked user cannot view blocker's post list", async () => {
    const blocker = await createTestUser();
    const blockee = await createTestUser();
    const blockeeTokens = await loginTestUser(blockee);

    await Block.create({ blocker: blocker._id, blocked: blockee._id });

    const res = await request(app)
      .get(`/api/users/${blocker.username}/posts`)
      .set({ ...SKIP_RL, ...blockeeTokens.authHeader });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// SEC-11: Moderated Post Not Visible in Public Feed (F-03 fix regression)
// =============================================================================
describe('SEC-11: Moderated post not in public feed', () => {
  it('a HIDDEN post does not appear in the public /api/posts feed', async () => {
    const userA = await createTestUser();
    const hiddenPost = await createTestPost(userA._id, { moderationStatus: 'HIDDEN' });

    // Use limit within max allowed (50)
    const res = await request(app)
      .get('/api/posts')
      .set(SKIP_RL)
      .query({ limit: 50 });

    expect(res.status).toBe(200);
    const ids = (res.body.data?.posts || []).map(p => p._id?.toString());
    expect(ids).not.toContain(hiddenPost._id.toString());
  });

  it('a REMOVED post does not appear in the public feed', async () => {
    const userA = await createTestUser();
    const removedPost = await createTestPost(userA._id, { moderationStatus: 'REMOVED' });

    const res = await request(app)
      .get('/api/posts')
      .set(SKIP_RL)
      .query({ limit: 50 });

    expect(res.status).toBe(200);
    const ids = (res.body.data?.posts || []).map(p => p._id?.toString());
    expect(ids).not.toContain(removedPost._id.toString());
  });

  it('active posts still appear in the feed', async () => {
    const userA = await createTestUser();
    const activePost = await createTestPost(userA._id, { moderationStatus: 'ACTIVE' });

    const res = await request(app)
      .get('/api/posts')
      .set(SKIP_RL)
      .query({ limit: 50 });

    expect(res.status).toBe(200);
    const ids = (res.body.data?.posts || []).map(p => p._id?.toString());
    expect(ids).toContain(activePost._id.toString());
  });

  it('accessing a HIDDEN post directly via /api/posts/:id returns 404', async () => {
    const userA = await createTestUser();
    const hiddenPost = await createTestPost(userA._id, { moderationStatus: 'HIDDEN' });

    const res = await request(app)
      .get(`/api/posts/${hiddenPost._id}`)
      .set(SKIP_RL);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// SEC-12: Rate Limit Bypass Header Restriction (F-01 fix regression)
// =============================================================================
describe('SEC-12: Rate limit bypass header is test-only (F-01)', () => {
  it('x-skip-rate-limit is honoured in NODE_ENV=test and prevents 429', async () => {
    // We should still be able to make requests in the test env
    // Key assertion: we get an auth error (401), not a rate-limit (429)
    const res = await request(app)
      .post('/api/auth/login')
      .set({ 'x-skip-rate-limit': 'true' })
      .send({ email: 'nonexistent@example.com', password: 'Password123' });
    expect(res.status).not.toBe(429);
    // Should be 401 (invalid credentials) or 400 (validation)
    expect([400, 401]).toContain(res.status);
  });
});

// =============================================================================
// SEC-13: Sensitive Data Not Leaked in API Responses
// =============================================================================
describe('SEC-13: Sensitive field exposure in responses', () => {
  it('GET /api/users/:username does not return email or password', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userBTokens = await loginTestUser(userB);

    const res = await request(app)
      .get(`/api/users/${userA.username}`)
      .set({ ...SKIP_RL, ...userBTokens.authHeader });
    expect(res.status).toBe(200);
    const user = res.body.data?.user;
    expect(user).toBeDefined();
    expect(user.email).toBeUndefined();
    expect(user.password).toBeUndefined();
  });

  it('GET /api/auth/me does not return password hash', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .get('/api/auth/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader });
    expect(res.status).toBe(200);
    const user = res.body.data?.user;
    expect(user.password).toBeUndefined();
  });

  it('POST /api/auth/login response does not contain password hash', async () => {
    const testUser = await createTestUser();
    const res = await request(app)
      .post('/api/auth/login')
      .set(SKIP_RL)
      .send({ email: testUser.email, password: 'Password123!' });

    expect(res.status).toBe(200);
    const user = res.body.data?.user;
    expect(user.password).toBeUndefined();
  });

  it('POST /api/auth/register response does not contain password hash', async () => {
    const uniqueTag = `${Date.now()}_sec13`;
    const res = await request(app)
      .post('/api/auth/register')
      .set(SKIP_RL)
      .send({
        username: `secreg_${uniqueTag}`,
        email: `secreg_${uniqueTag}@example.com`,
        password: 'Password123!',
        fullName: 'Security Tester',
      });

    expect(res.status).toBe(201);
    const user = res.body.data?.user;
    expect(user.password).toBeUndefined();
  });

  it('post objects do not expose author.password or author.email', async () => {
    const userA = await createTestUser();
    const post = await createTestPost(userA._id);

    const res = await request(app)
      .get(`/api/posts/${post._id}`)
      .set(SKIP_RL);
    expect(res.status).toBe(200);
    const author = res.body.data?.post?.author;
    if (author && typeof author === 'object') {
      expect(author.password).toBeUndefined();
      expect(author.email).toBeUndefined();
    }
  });
});

// =============================================================================
// SEC-14: profilePicture URL Scheme Restriction (F-02 fix regression)
// =============================================================================
describe('SEC-14: profilePicture URL scheme restriction (F-02)', () => {
  it('rejects javascript: scheme in profilePicture', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ profilePicture: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('rejects data: URI in profilePicture', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ profilePicture: 'data:text/html,<script>alert(1)</script>' });
    expect(res.status).toBe(400);
  });

  it('rejects plain http: URL in profilePicture (must be https)', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ profilePicture: 'http://example.com/avatar.jpg' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid https: URL for profilePicture', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ profilePicture: 'https://res.cloudinary.com/test/image/upload/avatar.jpg' });
    expect(res.status).toBe(200);
  });

  it('accepts empty string to clear profilePicture', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const res = await request(app)
      .patch('/api/users/me')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .send({ profilePicture: '' });
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// SEC-15: Request Body Size Limit
// =============================================================================
describe('SEC-15: Request body size limit', () => {
  it('rejects request body larger than 100 KB with 413', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    // Generate a payload > 100 KB
    const oversizedPayload = JSON.stringify({ caption: 'A'.repeat(120_000) });

    const res = await request(app)
      .post('/api/posts')
      .set({ ...SKIP_RL, ...userATokens.authHeader, 'Content-Type': 'application/json' })
      .send(oversizedPayload);

    expect(res.status).toBe(413);
  });
});

// =============================================================================
// SEC-16: Unknown Routes Return 404 Not Stack Traces
// =============================================================================
describe('SEC-16: Unknown route handling', () => {
  it('returns 404 for completely unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent/route').set(SKIP_RL);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('does not expose internal paths in 404 responses', async () => {
    const res = await request(app).get('/api/doesnotexist').set(SKIP_RL);
    const body = JSON.stringify(res.body);
    // Must not expose node_modules path or stack frame syntax
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/at Object\./);
  });

  it('404 response follows standard error envelope format', async () => {
    const res = await request(app).get('/completely/missing').set(SKIP_RL);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
  });
});

// =============================================================================
// SEC-17: Expired Token Rejection
// =============================================================================
describe('SEC-17: Expired token rejection', () => {
  it('expired access token returns 401', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    const expiredToken = generateAccessToken(
      { userId: userA._id, sessionId: userATokens.session._id },
      '-1s' // Already expired
    );
    const res = await request(app)
      .get('/api/users/me')
      .set({ ...SKIP_RL, Authorization: `Bearer ${expiredToken}` });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SEC-18: Session Revocation Prevents Access
// =============================================================================
describe('SEC-18: Session revocation prevents token refresh', () => {
  it('refresh attempt with a revoked session returns 401', async () => {
    const sessionUser = await createTestUser();
    const sessionUserTokens = await loginTestUser(sessionUser);

    // Revoke the session
    await sessionService.revokeSession(
      sessionUserTokens.session._id,
      sessionUser._id,
      { reason: 'SECURITY_TEST' }
    );

    // Now try to use the refresh token
    const res = await request(app)
      .post('/api/auth/refresh')
      .set(SKIP_RL)
      .set('Cookie', [`refreshToken=${sessionUserTokens.refreshToken}`]);

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SEC-19: Password Not Returned in Search Response
// =============================================================================
describe('SEC-19: Password hash never exposed', () => {
  it('user search results do not contain password hashes or email', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    // Create a second user so search has something to return
    await createTestUser();

    const res = await request(app)
      .get('/api/users/search')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .query({ q: 'testuser' });

    expect(res.status).toBe(200);
    const users = res.body.data?.users || [];
    users.forEach(u => {
      expect(u.password).toBeUndefined();
      expect(u.email).toBeUndefined();
    });
  });
});

// =============================================================================
// SEC-20: File Upload — Invalid Magic Bytes Rejected
// =============================================================================
describe('SEC-20: File upload magic byte validation', () => {
  it('rejects HTML content disguised as image/jpeg (invalid magic bytes)', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    // A buffer of HTML bytes but labeled as JPEG
    const htmlBuffer = Buffer.from('<html><script>alert("xss")</script></html>');

    const res = await request(app)
      .post('/api/posts')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .attach('media', htmlBuffer, { filename: 'evil.jpg', contentType: 'image/jpeg' });

    // Should be rejected — either 400 (invalid signature) or 415 (unsupported)
    expect(res.status).toBeOneOf([400, 415, 422]);
  });

  it('rejects file with .php extension even with image MIME type label', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    // Extension .php is not in ALLOWED_EXTENSIONS — must be rejected at the fileFilter stage
    const jpegLikeBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const res = await request(app)
      .post('/api/posts')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .attach('media', jpegLikeBuffer, { filename: 'shell.php', contentType: 'image/jpeg' });

    expect(res.status).toBeOneOf([400, 415, 422]);
  });

  it('rejects a valid-looking multipart with no actual image content', async () => {
    const userA = await createTestUser();
    const userATokens = await loginTestUser(userA);

    // Empty buffer with image content-type — invalid magic bytes
    const emptyBuffer = Buffer.alloc(5, 0);

    const res = await request(app)
      .post('/api/posts')
      .set({ ...SKIP_RL, ...userATokens.authHeader })
      .attach('media', emptyBuffer, { filename: 'empty.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBeOneOf([400, 415, 422]);
  });
});
