import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';

describe('Security: NoSQL Injection Protections', () => {
  it('rejects NoSQL injection operator objects in request bodies', async () => {
    // Attempt login with { email: { $ne: null } }
    const resBody = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $ne: null },
        password: 'Password123!',
      });

    expect(resBody.status).toBe(400);
    expect(resBody.body.success).toBe(false);
  });

  it('rejects NoSQL injection operators in profile update payloads', async () => {
    const user = await createTestUser();
    const login = await loginTestUser(user);

    const resUpdate = await request(app)
      .patch('/api/users/me')
      .set(login.authHeader)
      .send({
        bio: { $gt: '' },
      });

    expect(resUpdate.status).toBe(400);
    expect(resUpdate.body.success).toBe(false);
  });

  it('rejects NoSQL injection operator objects in query parameters', async () => {
    const user = await createTestUser();
    const login = await loginTestUser(user);

    const resQuery = await request(app)
      .get('/api/users/search?q[$gt]=')
      .set(login.authHeader);

    expect(resQuery.status).toBe(400);
    expect(resQuery.body.success).toBe(false);
  });
});
