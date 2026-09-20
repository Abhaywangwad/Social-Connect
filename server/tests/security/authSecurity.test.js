import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Session from '../../src/models/Session.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Security: Authentication, Session Revocation & IDOR Protection', () => {
  describe('Authorization Header Verification', () => {
    it('rejects requests with missing Authorization header with 401', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects requests with garbage or invalid token with 401', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid.token.garbage');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects requests with expired token with 401', async () => {
      const user = await createTestUser();
      const expiredToken = generateAccessToken({ userId: user._id }, '1ms');
      await new Promise((r) => setTimeout(r, 15));

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects requests with malformed Bearer scheme with 401', async () => {
      const user = await createTestUser();
      const login = await loginTestUser(user);

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Basic ${login.accessToken}`);

      expect(res.status).toBe(401);
    });

    it('rejects refresh requests when session has been revoked in DB', async () => {
      const user = await createTestUser();
      const login = await loginTestUser(user);

      // Revoke session directly
      await Session.findByIdAndUpdate(login.session._id, { revokedAt: new Date() });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${login.refreshToken}`]);

      expect(res.status).toBe(401);
    });
  });

  describe('IDOR Prevention (Resource Ownership)', () => {
    it('prevents User B from editing User A post', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const loginB = await loginTestUser(userB);

      const postA = await createTestPost(userA._id);

      const res = await request(app)
        .patch(`/api/posts/${postA._id}`)
        .set(loginB.authHeader)
        .send({ caption: 'IDOR attempt' });

      expect(res.status).toBe(403);
    });

    it('prevents User B from deleting User A post', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const loginB = await loginTestUser(userB);

      const postA = await createTestPost(userA._id);

      const res = await request(app)
        .delete(`/api/posts/${postA._id}`)
        .set(loginB.authHeader);

      expect(res.status).toBe(403);
    });
  });

  describe('Privilege Escalation Protection', () => {
    it('ignores client-supplied X-Admin or role claims', async () => {
      const user = await createTestUser({ role: 'USER' });
      const login = await loginTestUser(user);

      const res = await request(app)
        .get('/api/admin/reports')
        .set(login.authHeader)
        .set('X-Admin', 'true')
        .set('X-Role', 'ADMIN');

      expect(res.status).toBe(403);
    });
  });
});
