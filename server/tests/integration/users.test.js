import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';

describe('Integration: Users, Profiles & Blocking', () => {
  describe('GET & PATCH /api/users/me', () => {
    it('returns the authenticated user profile', async () => {
      const user = await createTestUser({ fullName: 'Alice Profile' });
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .get('/api/users/me')
        .set(loginData.authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe(user.username);
      expect(res.body.data.user.fullName).toBe('Alice Profile');
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('updates user profile allowed fields (fullName, bio)', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .patch('/api/users/me')
        .set(loginData.authHeader)
        .send({
          fullName: 'Updated Name',
          bio: 'Updated bio content',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.fullName).toBe('Updated Name');
      expect(res.body.data.user.bio).toBe('Updated bio content');
    });

    it('rejects forbidden internal fields (role, followersCount, isVerified)', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      // Attempt privilege escalation to ADMIN
      const resRole = await request(app)
        .patch('/api/users/me')
        .set(loginData.authHeader)
        .send({ role: 'ADMIN' });
      expect(resRole.status).toBe(400);

      // Attempt internal counter manipulation
      const resFollowers = await request(app)
        .patch('/api/users/me')
        .set(loginData.authHeader)
        .send({ followersCount: 999999 });
      expect(resFollowers.status).toBe(400);

      // Attempt fake verification badge
      const resVerified = await request(app)
        .patch('/api/users/me')
        .set(loginData.authHeader)
        .send({ isVerified: true });
      expect(resVerified.status).toBe(400);
    });
  });

  describe('GET /api/users/:username', () => {
    it('retrieves public user profile for existing username', async () => {
      const user = await createTestUser({ username: 'publicprofileuser', bio: 'Hello World' });

      const res = await request(app).get(`/api/users/${user.username}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('publicprofileuser');
      expect(res.body.data.user.bio).toBe('Hello World');
    });

    it('returns 404 for non-existent username', async () => {
      const res = await request(app).get('/api/users/nonexistentuser_xyz_999');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/users/search', () => {
    it('searches users by query and safely escapes regex special characters', async () => {
      const userA = await createTestUser({ username: 'searchtarget', fullName: 'Search Target' });
      const userB = await createTestUser();
      const loginB = await loginTestUser(userB);

      // Valid search
      const res = await request(app)
        .get('/api/users/search?q=target')
        .set(loginB.authHeader);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);

      // Regex special characters do not cause ReDoS or internal errors
      const regexRes = await request(app)
        .get('/api/users/search?q=.*+?^$')
        .set(loginB.authHeader);
      expect(regexRes.status).toBe(200);

      // Short search query rejected
      const shortRes = await request(app)
        .get('/api/users/search?q=a')
        .set(loginB.authHeader);
      expect(shortRes.status).toBe(400);
    });
  });

  describe('User Blocking Lifecycle', () => {
    it('blocks a user, checks block status, and unblocks', async () => {
      const userA = await createTestUser({ username: 'blocker_user' });
      const userB = await createTestUser({ username: 'blocked_user' });
      const loginA = await loginTestUser(userA);

      // 1. Block userB
      const blockRes = await request(app)
        .post(`/api/users/${userB.username}/block`)
        .set(loginA.authHeader);
      expect(blockRes.status).toBe(200);
      expect(blockRes.body.success).toBe(true);

      // 2. Check block status
      const statusRes = await request(app)
        .get(`/api/users/${userB.username}/block-status`)
        .set(loginA.authHeader);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.isBlocked).toBe(true);

      // 3. Check blocked list
      const listRes = await request(app)
        .get('/api/users/me/blocked')
        .set(loginA.authHeader);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.users.length).toBeGreaterThanOrEqual(1);

      // 4. Blocked user is excluded from userA's search results
      const searchRes = await request(app)
        .get(`/api/users/search?q=${userB.username}`)
        .set(loginA.authHeader);
      expect(searchRes.status).toBe(200);
      const found = searchRes.body.data.users.some((u) => u.username === userB.username);
      expect(found).toBe(false);

      // 5. Unblock userB
      const unblockRes = await request(app)
        .delete(`/api/users/${userB.username}/block`)
        .set(loginA.authHeader);
      expect(unblockRes.status).toBe(200);
    });
  });
});
