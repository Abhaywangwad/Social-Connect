import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Security: Centralized Error Handling & Sanitization', () => {
  it('returns structured 404 response for unknown routes', async () => {
    const res = await request(app).get('/api/unknown/nonexistent/endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toBeDefined();
  });

  it('masks internal stack traces and database internal details', async () => {
    // Request with an invalid BSON ObjectId format
    const res = await request(app).get('/api/posts/not-a-valid-bson-id');

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
    // Stack trace should not be exposed in error response
    expect(res.body.stack).toBeUndefined();
    expect(res.body.error.stack).toBeUndefined();
  });
});
