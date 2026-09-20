import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import config from '../../src/config/config.js';
import { maskSecrets, sanitizeUrl } from '../../src/utils/logger.js';
import metrics from '../../src/utils/metrics.js';
import errorTracker from '../../src/utils/errorTracker.js';

describe('Observability: Request Correlation, Logging & Health', () => {
  beforeEach(() => {
    metrics.reset();
    errorTracker.clearLastCaptured();
  });

  // ─── 1. Request ID Generation & Propagation ──────────────────────────────────
  describe('Request ID Correlation', () => {
    it('generates a unique X-Request-ID when not provided by client', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
    });

    it('propagates client-supplied X-Request-ID header', async () => {
      const customId = 'client-trace-id-abc-12345';
      const res = await request(app)
        .get('/api/health')
        .set('X-Request-ID', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('attaches requestId to error response payload', async () => {
      const customId = 'error-correlation-998877';
      const res = await request(app)
        .get('/api/unknown-route-that-does-not-exist')
        .set('X-Request-ID', customId);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.requestId).toBe(customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  // ─── 2. Secret Redaction & URL Sanitization ─────────────────────────────────
  describe('Sensitive Data Redaction', () => {
    it('redacts sensitive keys deeply from log metadata', () => {
      const rawPayload = {
        username: 'alice',
        password: 'SuperSecretPassword123!',
        tokens: {
          accessToken: 'jwt.header.payload.signature',
          refreshToken: 'refresh_xyz_secret',
        },
        meta: {
          apiKey: 'cloudinary_secret_key',
          cookie: 'session=12345',
          safeField: 'visible_data',
        },
      };

      const sanitized = maskSecrets(rawPayload);

      expect(sanitized.username).toBe('alice');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.tokens.accessToken).toBe('[REDACTED]');
      expect(sanitized.tokens.refreshToken).toBe('[REDACTED]');
      expect(sanitized.meta.apiKey).toBe('[REDACTED]');
      expect(sanitized.meta.cookie).toBe('[REDACTED]');
      expect(sanitized.meta.safeField).toBe('visible_data');
    });

    it('sanitizes sensitive query parameters from URLs', () => {
      const rawUrl = '/api/auth/verify?token=secret123456&userId=abc12345';
      const sanitized = sanitizeUrl(rawUrl);

      expect(sanitized).toContain('token=%5BREDACTED%5D');
      expect(sanitized).toContain('userId=abc12345');
      expect(sanitized).not.toContain('secret123456');
    });

    it('preserves URLs without sensitive query parameters', () => {
      const normalUrl = '/api/users/search?q=alice&limit=10';
      const sanitized = sanitizeUrl(normalUrl);

      expect(sanitized).toBe(normalUrl);
    });
  });

  // ─── 3. Health & Readiness Probes ───────────────────────────────────────────
  describe('Health Checks & Versioning', () => {
    it('GET /api/health returns healthy status and application version', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('healthy');
      expect(res.body.version).toBe(config.version);
      expect(res.body.environment).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /api/health/ready accurately reports database readiness', async () => {
      const res = await request(app).get('/api/health/ready');

      if (mongoose.connection.readyState === 1) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('ready');
        expect(res.body.database).toBe('connected');
        expect(res.body.version).toBe(config.version);
      } else {
        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.status).toBe('unready');
        expect(res.body.database).toBe('disconnected');
      }
    });
  });

  // ─── 4. In-Memory Metrics Registry ──────────────────────────────────────────
  describe('Operational Performance Metrics', () => {
    it('records HTTP request counts and response latency', async () => {
      await request(app).get('/api/health');
      await request(app).get('/api/health');
      await request(app).get('/api/unknown-404-endpoint');

      const snapshot = metrics.getSnapshot();

      expect(snapshot.http.totalRequests).toBeGreaterThanOrEqual(3);
      expect(snapshot.http.status2xx).toBeGreaterThanOrEqual(2);
      expect(snapshot.http.status4xx).toBeGreaterThanOrEqual(1);
      expect(snapshot.http.byMethod.GET).toBeGreaterThanOrEqual(3);
      expect(typeof snapshot.http.avgLatencyMs).toBe('number');
      expect(typeof snapshot.system.heapUsedMb).toBe('number');
    });

    it('tracks Socket.IO connect, disconnect, and reason metrics', () => {
      metrics.recordSocketConnect();
      metrics.recordSocketConnect();
      expect(metrics.getSnapshot().socket.activeConnections).toBe(2);
      expect(metrics.getSnapshot().socket.totalConnections).toBe(2);

      metrics.recordSocketDisconnect('transport close');
      metrics.recordSocketDisconnect('client namespace disconnect');

      const snapshot = metrics.getSnapshot();
      expect(snapshot.socket.activeConnections).toBe(0);
      expect(snapshot.socket.totalDisconnections).toBe(2);
      expect(snapshot.socket.byDisconnectReason['transport close']).toBe(1);
      expect(snapshot.socket.byDisconnectReason['client namespace disconnect']).toBe(1);
    });

    it('GET /api/health/metrics returns in-memory performance metrics', async () => {
      const res = await request(app).get('/api/health/metrics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.http).toBeDefined();
      expect(res.body.metrics.socket).toBeDefined();
      expect(res.body.metrics.database).toBeDefined();
    });
  });

  // ─── 5. Error Tracking & Scrubbing ──────────────────────────────────────────
  describe('Error Tracking & Credential Scrubbing', () => {
    it('captures unexpected errors with scrubbed credentials and request correlation', () => {
      const testError = new Error('Test database connection spike failure');
      testError.code = 'DATABASE_SPIKE';

      errorTracker.captureException(testError, {
        requestId: 'trace-test-5544',
        route: '/api/auth/login',
        method: 'POST',
        statusCode: 500,
        headers: {
          authorization: 'Bearer sensitive-token-here',
          cookie: 'refreshToken=secret-cookie-val',
          'user-agent': 'Vitest-Runner',
        },
        body: {
          email: 'test@example.com',
          password: 'PlaintextPassword123!',
        },
      });

      const captured = errorTracker.getLastCaptured();

      expect(captured).toBeDefined();
      expect(captured.message).toBe('Test database connection spike failure');
      expect(captured.context.requestId).toBe('trace-test-5544');
      // Auth body is strictly omitted
      expect(captured.context.body).toBe('[AUTH_BODY_OMITTED]');
      // Sensitive headers are strictly redacted
      expect(captured.context.headers.authorization).toBe('[REDACTED]');
      expect(captured.context.headers.cookie).toBe('[REDACTED]');
      expect(captured.context.headers['user-agent']).toBe('Vitest-Runner');
      expect(captured.context.appVersion).toBe(config.version);
    });
  });
});
