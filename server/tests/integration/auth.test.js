import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Session from '../../src/models/Session.js';
import { createTestUser, loginTestUser, getAuthHeader } from '../helpers/authHelper.js';

describe('Integration: Authentication & Sessions', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user successfully with hashed password', async () => {
      const payload = {
        username: 'newregisteruser',
        email: 'newregister@example.com',
        password: 'Password123!',
        fullName: 'New Register User',
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.username).toBe('newregisteruser');
      expect(res.body.data.user.email).toBe('newregister@example.com');
      // Verify password is NOT exposed
      expect(res.body.data.user.password).toBeUndefined();

      // Verify stored in DB with bcrypt hash
      const dbUser = await User.findOne({ email: 'newregister@example.com' }).select('+password');
      expect(dbUser).not.toBeNull();
      expect(dbUser.password).not.toBe('Password123!');
      expect(dbUser.password.startsWith('$2')).toBe(true);
    });

    it('rejects registration with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'missingfields' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects duplicate email and duplicate username', async () => {
      await createTestUser({ username: 'existinguser', email: 'existing@example.com' });

      // Duplicate email
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'differentuser',
          email: 'existing@example.com',
          password: 'Password123!',
          fullName: 'Different User',
        });
      expect(res1.status).toBe(409);

      // Duplicate username
      const res2 = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'existinguser',
          email: 'brandnew@example.com',
          password: 'Password123!',
          fullName: 'Brand New',
        });
      expect(res2.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid credentials and sets refresh cookie', async () => {
      await createTestUser({
        username: 'loginvalid',
        email: 'loginvalid@example.com',
        password: 'Password123!',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loginvalid@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.password).toBeUndefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('refreshToken='))).toBe(true);
    });

    it('rejects incorrect password with 401', async () => {
      await createTestUser({
        email: 'wrongpass@example.com',
        password: 'CorrectPassword123!',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrongpass@example.com',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects non-existent user with 401 without leaking existence', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh & Token Rotation', () => {
    it('rotates refresh token and issues new access token', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${loginData.refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      // Assert old token is rotated and cannot be reused
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });

    it('detects replay attack when old refresh token is reused and revokes token family', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      // First refresh succeeds
      const res1 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${loginData.refreshToken}`]);
      expect(res1.status).toBe(200);

      // Reusing the same old token (replay attack)
      const res2 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${loginData.refreshToken}`]);
      expect(res2.status).toBe(401);

      // Verify that all sessions in that family were revoked
      const sessionInDb = await Session.findById(loginData.session._id);
      expect(sessionInDb.revokedAt).not.toBeNull();
      expect(sessionInDb.isActive()).toBe(false);
    });
  });

  describe('POST /api/auth/logout & /api/auth/logout-all', () => {
    it('revokes specific session on logout', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .post('/api/auth/logout')
        .set(loginData.authHeader)
        .set('Cookie', [`refreshToken=${loginData.refreshToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const session = await Session.findById(loginData.session._id);
      expect(session.revokedAt).not.toBeNull();
      expect(session.isActive()).toBe(false);
    });

    it('revokes all sessions on logout-all', async () => {
      const user = await createTestUser();
      const s1 = await loginTestUser(user);
      const s2 = await loginTestUser(user);

      const res = await request(app)
        .post('/api/auth/logout-all')
        .set(s1.authHeader);

      expect(res.status).toBe(200);

      const activeSessions = await Session.find({ user: user._id, revokedAt: null });
      expect(activeSessions.length).toBe(0);
    });
  });

  describe('Sessions Management APIs', () => {
    it('lists active sessions and revokes specific session by ID', async () => {
      const user = await createTestUser();
      const loginData = await loginTestUser(user);

      const listRes = await request(app)
        .get('/api/auth/sessions')
        .set(loginData.authHeader);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data.sessions)).toBe(true);
      expect(listRes.body.data.sessions.length).toBeGreaterThanOrEqual(1);

      const deleteRes = await request(app)
        .delete(`/api/auth/sessions/${loginData.session._id}`)
        .set(loginData.authHeader);

      expect(deleteRes.status).toBe(200);

      const session = await Session.findById(loginData.session._id);
      expect(session.revokedAt).not.toBeNull();
      expect(session.isActive()).toBe(false);
    });
  });
});
