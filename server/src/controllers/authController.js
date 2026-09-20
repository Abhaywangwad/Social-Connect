import authService from '../services/authService.js';
import sessionService from '../services/sessionService.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import auditService from '../services/auditService.js';

const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Cookie options for the HttpOnly refresh token.
 */
const getRefreshCookieOptions = (maxAgeMs = 30 * 24 * 60 * 60 * 1000) => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  // 'strict' prevents the refresh token cookie from being sent on any
  // cross-site request (including top-level navigations), providing the
  // strongest CSRF defence for the /api/auth/refresh endpoint (F-07).
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: maxAgeMs,
});

/**
 * Attaches the rotating refresh token to an HttpOnly response cookie.
 */
const setRefreshTokenCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE_NAME, token, getRefreshCookieOptions());
};

/**
 * Clears the refresh token cookie upon logout or password change.
 */
const clearRefreshTokenCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
};

/**
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };
    const user = await authService.registerUser(req.body, context);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email address.',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { user, accessToken, rawRefreshToken } = await authService.loginUser(
      req.body,
      {
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.socket?.remoteAddress || '',
        requestId: req.id,
      }
    );

    // Set HttpOnly refresh cookie (never returned in plaintext JSON)
    setRefreshTokenCookie(res, rawRefreshToken);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh
 * Reads refresh token from secure HttpOnly cookie (or header fallback for non-browser clients).
 */
export const refresh = async (req, res, next) => {
  try {
    const rawRefreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME] ||
      req.headers['x-refresh-token'];

    if (!rawRefreshToken) {
      throw ApiError.unauthorized('Refresh token is required');
    }

    const { newRawRefreshToken, accessToken } = await sessionService.refreshSession(
      rawRefreshToken,
      {
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.socket?.remoteAddress || '',
        requestId: req.id,
      }
    );

    // Set rotated refresh token in secure cookie
    setRefreshTokenCookie(res, newRawRefreshToken);

    res.status(200).json({
      success: true,
      message: 'Access token refreshed successfully',
      data: {
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Revokes the current authenticated session and clears the refresh cookie.
 */
export const logout = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };

    if (req.user?.sessionId) {
      await sessionService.revokeSession(req.user.sessionId, req.user.userId, {
        ...context,
        reason: 'USER_LOGOUT',
      });
    }

    await auditService.createAuditLog({
      actor: req.user.userId,
      action: 'USER_LOGOUT',
      targetType: 'SESSION',
      targetId: req.user.sessionId || null,
      metadata: { sessionId: req.user.sessionId },
      ...context,
    });

    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout-all
 * Revokes all active sessions for the current user and clears the refresh cookie.
 */
export const logoutAll = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };

    const revokedCount = await sessionService.revokeAllUserSessions(req.user.userId, {
      ...context,
      reason: 'USER_LOGOUT_ALL',
      audit: false,
    });

    await auditService.createAuditLog({
      actor: req.user.userId,
      action: 'USER_LOGOUT_ALL',
      targetType: 'USER',
      targetId: req.user.userId,
      metadata: { numberOfSessionsRevoked: revokedCount },
      ...context,
    });

    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: 'Successfully logged out from all devices',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/sessions
 * Returns the current user's active sessions (safe projections only).
 */
export const getSessions = async (req, res, next) => {
  try {
    const sessions = await sessionService.getUserActiveSessions(
      req.user.userId,
      req.user.sessionId
    );

    res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revokes one specific session belonging to the current user.
 */
export const revokeSession = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
      reason: 'USER_REVOKED',
    };

    await sessionService.revokeSession(req.params.sessionId, req.user.userId, context);

    // If revoking current session, also clear cookie
    if (req.user.sessionId === req.params.sessionId) {
      clearRefreshTokenCookie(res);
    }

    res.status(200).json({
      success: true,
      message: 'Session revoked successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/auth/change-password
 */
export const changePassword = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };
    const result = await authService.changePassword(req.user.userId, req.body, context);
    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body?.email);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };
    const result = await authService.resetPassword(req.body || {}, context);
    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-email
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const context = {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      requestId: req.id,
    };
    const result = await authService.verifyEmail(req.body?.token, context);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-verification
 */
export const resendVerification = async (req, res, next) => {
  try {
    const result = await authService.resendVerification(req.user.userId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.userId);

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe,
};
