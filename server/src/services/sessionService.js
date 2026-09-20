import crypto from 'crypto';
import mongoose from 'mongoose';
import Session from '../models/Session.js';
import { generateRandomToken, hashToken } from '../utils/cryptoUtils.js';
import { generateAccessToken } from '../utils/jwt.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

/**
 * Parses duration string (e.g., '15m', '30d', '1h') or returns number in milliseconds.
 */
const parseDurationMs = (duration, defaultMs = 30 * 24 * 60 * 60 * 1000) => {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return defaultMs;

  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return defaultMs;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return defaultMs;
  }
};

export const sessionService = {
  /**
   * Creates a new user session and returns raw refresh token to client.
   *
   * @param {Object} param0
   * @param {string} param0.userId
   * @param {string} [param0.userAgent]
   * @param {string} [param0.ipAddress]
   * @returns {Promise<{ session: Object, rawRefreshToken: string }>}
   */
  async createSession({ userId, userAgent = '', ipAddress = '', requestId = '' }) {
    const rawRefreshToken = generateRandomToken(32);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const tokenFamily = crypto.randomUUID();

    const refreshLifetimeMs = parseDurationMs(config.jwtRefreshExpiresIn);
    const expiresAt = new Date(Date.now() + refreshLifetimeMs);

    const session = await Session.create({
      user: userId,
      refreshTokenHash,
      previousTokenHashes: [],
      tokenFamily,
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: (userAgent || '').slice(0, 500),
      ipAddress: (ipAddress || '').slice(0, 100),
    });

    await auditService.createAuditLog({
      actor: userId,
      action: 'SESSION_CREATED',
      targetType: 'SESSION',
      targetId: session._id,
      metadata: { sessionId: session._id.toString() },
      userAgent,
      ipAddress,
      requestId,
    });

    return {
      session,
      rawRefreshToken,
    };
  },

  /**
   * Refreshes an active session, rotating the refresh token and issuing a new access token.
   * Enforces Token Reuse Detection: if an already-rotated token hash is presented,
   * the entire token family is immediately revoked to thwart replay attacks.
   *
   * @param {string} rawRefreshToken
   * @param {Object} [metadata]
   * @param {string} [metadata.userAgent]
   * @param {string} [metadata.ipAddress]
   * @param {string} [metadata.requestId]
   * @returns {Promise<{ session: Object, newRawRefreshToken: string, accessToken: string }>}
   */
  async refreshSession(rawRefreshToken, { userAgent = '', ipAddress = '', requestId = '' } = {}) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw ApiError.unauthorized('Refresh token is required');
    }

    const presentedHash = hashToken(rawRefreshToken);

    // 1. Check for token reuse in historical rotated tokens
    const reuseSuspiciousSession = await Session.findOne({
      previousTokenHashes: presentedHash,
    });

    if (reuseSuspiciousSession) {
      // Immediate Security Response: Revoke entire token family
      await Session.updateMany(
        { tokenFamily: reuseSuspiciousSession.tokenFamily },
        { $set: { revokedAt: new Date() } }
      );

      await auditService.createAuditLog({
        actor: reuseSuspiciousSession.user,
        action: 'REFRESH_TOKEN_REUSED',
        targetType: 'SESSION',
        targetId: reuseSuspiciousSession._id,
        metadata: {
          sessionId: reuseSuspiciousSession._id.toString(),
          tokenFamily: reuseSuspiciousSession.tokenFamily,
        },
        userAgent,
        ipAddress,
        requestId,
      });

      throw ApiError.unauthorized(
        'Suspicious refresh token reuse detected. All sessions have been revoked for your security.'
      );
    }

    // 2. Locate active session by current token hash
    const session = await Session.findOne({ refreshTokenHash: presentedHash });

    if (!session) {
      throw ApiError.unauthorized('Invalid or revoked refresh token');
    }

    // 3. Verify session is not explicitly revoked
    if (session.revokedAt) {
      throw ApiError.unauthorized('Session has been revoked. Please log in again.');
    }

    // 4. Verify session has not expired
    if (session.expiresAt <= new Date()) {
      throw ApiError.unauthorized('Session has expired. Please log in again.');
    }

    // 5. Rotate Refresh Token: Generate replacement token and save hash
    const newRawRefreshToken = generateRandomToken(32);
    const newHash = hashToken(newRawRefreshToken);

    session.previousTokenHashes.push(session.refreshTokenHash);
    session.refreshTokenHash = newHash;
    session.lastUsedAt = new Date();
    if (userAgent) session.userAgent = userAgent.slice(0, 500);
    if (ipAddress) session.ipAddress = ipAddress.slice(0, 100);

    await session.save();

    // 6. Generate fresh short-lived Access Token
    const accessToken = generateAccessToken({
      userId: session.user,
      sessionId: session._id,
    });

    return {
      session,
      newRawRefreshToken,
      accessToken,
    };
  },

  /**
   * Revokes a single session by its identifier.
   * Enforces ownership: users can only revoke their own sessions.
   *
   * @param {string} sessionId
   * @param {string} currentUserId
   * @param {Object} [context]
   * @returns {Promise<boolean>}
   */
  async revokeSession(sessionId, currentUserId, context = {}) {
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      throw ApiError.badRequest('Invalid session ID format');
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    if (session.user.toString() !== currentUserId.toString()) {
      throw ApiError.forbidden('You are not authorized to revoke this session');
    }

    if (!session.revokedAt) {
      session.revokedAt = new Date();
      await session.save();

      await auditService.createAuditLog({
        actor: currentUserId,
        action: 'SESSION_REVOKED',
        targetType: 'SESSION',
        targetId: session._id,
        metadata: { sessionId: session._id.toString(), reason: context.reason || 'USER_REVOKED' },
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
      });
    }

    return true;
  },

  /**
   * Revokes all active sessions for a given user (e.g., Logout from All Devices,
   * Password Change, Password Reset).
   *
   * @param {string} userId
   * @param {Object} [context]
   * @returns {Promise<number>} Number of sessions revoked
   */
  async revokeAllUserSessions(userId, context = {}) {
    if (!userId) return 0;

    const result = await Session.updateMany(
      { user: userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    const count = result.modifiedCount || 0;
    if (count > 0 && context.audit !== false) {
      await auditService.createAuditLog({
        actor: userId,
        action: 'SESSION_REVOKED',
        targetType: 'USER',
        targetId: userId,
        metadata: { numberOfSessionsRevoked: count, reason: context.reason || 'ALL_SESSIONS_REVOKED' },
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
      });
    }

    return count;
  },

  /**
   * Retrieves all active sessions for the authenticated user with safe projections.
   *
   * @param {string} userId
   * @param {string} [currentSessionId]
   * @returns {Promise<Array<Object>>}
   */
  async getUserActiveSessions(userId, currentSessionId = null) {
    const sessions = await Session.find({
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .lean();

    return sessions.map((s) => ({
      sessionId: s._id.toString(),
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      userAgent: s.userAgent || 'Unknown Device',
      isCurrent: Boolean(
        currentSessionId && s._id.toString() === currentSessionId.toString()
      ),
    }));
  },
};

export default sessionService;
