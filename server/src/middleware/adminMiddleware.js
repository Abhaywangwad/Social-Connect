import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import auditService from '../services/auditService.js';

/**
 * Admin Authorization Middleware.
 *
 * Must be chained AFTER authMiddleware so that req.user.userId is already set.
 *
 * Flow:
 *   Request
 *     → authMiddleware   (verifies JWT, attaches req.user.userId)
 *     → requireAdmin     (verifies role = ADMIN via DB lookup)
 *     → Admin Controller
 *
 * Design Decision — Role loaded from DB (not JWT):
 * ─────────────────────────────────────────────────
 * The JWT contains only { sub (userId), sid (sessionId) } — no role claim.
 * This avoids the stale-role problem where a demoted admin could still
 * use a valid access token to perform admin actions until its TTL expires.
 *
 * The cost is one targeted DB lookup per admin request:
 *   User.findById(userId).select('role accountStatus').lean()
 *
 * This is acceptable because:
 * 1. Admin endpoints are low-frequency moderation tools, not hot social paths.
 * 2. The query uses the primary _id index — O(log n), extremely fast.
 * 3. The projection is minimal (role + accountStatus only).
 * 4. Stale-role attacks are fully prevented.
 *
 * Security:
 * - Never trusts client-supplied headers like X-Admin: true
 * - Never trusts role from request body or query string
 * - Role can only be set by trusted server-side scripts (create_admin.js)
 */
export const requireAdmin = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Single targeted projection — only load what's needed for authorization
    const user = await User.findById(req.user.userId)
      .select('role accountStatus')
      .lean();

    if (!user) {
      throw ApiError.unauthorized('User account not found');
    }

    // Suspended admins lose admin access immediately
    if (user.accountStatus === 'SUSPENDED') {
      throw ApiError.forbidden(
        'Your account has been suspended',
        'ACCOUNT_SUSPENDED'
      );
    }

    if (user.role !== 'ADMIN') {
      await auditService.createAuditLog({
        actor: req.user.userId,
        action: 'ADMIN_ACCESS_DENIED',
        targetType: 'SYSTEM',
        targetId: null,
        metadata: {
          path: req.originalUrl,
          method: req.method,
          userRole: user.role,
        },
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.socket?.remoteAddress || '',
        requestId: req.id,
      });

      throw ApiError.forbidden(
        'Admin access required to perform this action',
        'ADMIN_ACCESS_REQUIRED'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default requireAdmin;
