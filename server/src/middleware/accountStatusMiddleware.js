import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

/**
 * Account Status Middleware.
 *
 * Enforces account suspension on sensitive write endpoints.
 * Must be chained AFTER authMiddleware.
 *
 * Design:
 * ─────────────────────────────────────────────────────────
 * Account suspension is primarily enforced via:
 *   1. Session revocation — suspended user cannot refresh tokens.
 *   2. Login rejection   — suspended user cannot log in.
 *
 * However, a suspended user may hold a short-lived access token that was
 * issued before suspension. Since that token remains cryptographically valid
 * until its TTL (~15 min), this middleware provides a secondary enforcement
 * layer on important write operations.
 *
 * Applied to:
 *   POST /api/posts
 *   POST /api/posts/:id/comments
 *   POST /api/comments/:id/replies
 *   POST /api/stories
 *   POST /api/conversations
 *   Socket message:send (enforced inside socketHandlers.js)
 *
 * NOT applied to every read endpoint (would add unnecessary DB load).
 *
 * Limitation:
 * Read-only endpoints (feed, profile, search) do not check account status live.
 * A suspended user with a still-valid access token can read the feed for up
 * to ~15 minutes. This is an accepted, documented trade-off.
 */
export const requireActiveAccount = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      throw ApiError.unauthorized('Authentication required');
    }

    const user = await User.findById(req.user.userId)
      .select('accountStatus')
      .lean();

    if (!user) {
      throw ApiError.unauthorized('User account not found');
    }

    if (user.accountStatus !== 'ACTIVE') {
      throw ApiError.forbidden(
        'Your account has been suspended. You cannot perform this action.',
        'ACCOUNT_SUSPENDED'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default requireActiveAccount;
