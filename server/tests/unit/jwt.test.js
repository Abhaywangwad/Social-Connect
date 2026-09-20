import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  verifyAccessToken,
  generateToken,
  verifyToken,
} from '../../src/utils/jwt.js';

describe('Unit: JWT Token Utility', () => {
  const userId = '654321098765432109876543';
  const sessionId = '123456789012345678901234';

  it('generates a valid access token with normalized claims', () => {
    const token = generateAccessToken({ userId, sessionId });
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(userId);
    expect(decoded.userId).toBe(userId);
    expect(decoded.sid).toBe(sessionId);
    expect(decoded.sessionId).toBe(sessionId);
  });

  it('rejects an expired token', async () => {
    const token = generateAccessToken({ userId, sessionId }, '1ms');
    // Wait 10ms so token expires
    await new Promise((r) => setTimeout(r, 15));

    expect(() => verifyAccessToken(token)).toThrow(/jwt expired/i);
  });

  it('rejects a token signed with an invalid secret or tampered signature', () => {
    const token = generateAccessToken({ userId, sessionId });
    const tampered = token.slice(0, -4) + 'abcd';

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects unsigned "none" algorithm tokens', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: userId, userId })).toString('base64url');
    const unsignedToken = `${header}.${payload}.`;

    expect(() => verifyAccessToken(unsignedToken)).toThrow();
  });

  it('maintains backwards compatibility for generateToken and verifyToken', () => {
    const token = generateToken({ userId, sessionId });
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(userId);
  });
});
