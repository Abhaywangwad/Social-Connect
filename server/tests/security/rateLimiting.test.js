import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';

describe('Security: Rate Limiting & Abuse Prevention', () => {
  it('triggers 429 Too Many Requests when login attempts exceed max limit', async () => {
    const user = await createTestUser({ email: 'ratelimit_login@example.com' });

    // Login limiter has max: 5
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimit_login@example.com', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
    }

    // 6th attempt should be blocked with 429
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ratelimit_login@example.com', password: 'WrongPassword!' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(blockedRes.headers['x-ratelimit-limit']).toBeDefined();
  });
});
