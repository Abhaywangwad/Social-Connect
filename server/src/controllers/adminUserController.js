import moderationService from '../services/moderationService.js';
import {
  adminUserListSchema,
  userStatusSchema,
} from '../validations/adminValidation.js';
import AppError from '../utils/AppError.js';
import { getIO } from '../socket/index.js';

/**
 * GET /api/admin/users
 * Admin-facing user list with search and filters.
 * Returns email (operationally useful for support) — never returns passwords or tokens.
 */
export const listUsers = async (req, res, next) => {
  try {
    const parseResult = adminUserListSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }
    const parsed = parseResult.data;

    const result = await moderationService.listUsers({
      q: parsed.q,
      accountStatus: parsed.accountStatus,
      role: parsed.role,
      page: parsed.page,
      limit: parsed.limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/users/:userId/status
 * Suspends or reactivates a user account.
 *
 * On suspension:
 * - All active refresh sessions are revoked immediately
 * - Active socket connections are disconnected
 * - accountStatus set to SUSPENDED + suspendedAt + suspensionReason recorded
 *
 * On reactivation:
 * - accountStatus restored to ACTIVE
 * - suspendedAt and suspensionReason cleared
 * - No new sessions are automatically issued (user must log in again)
 */
export const updateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const parseResult = userStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }
    const parsed = parseResult.data;

    // Get Socket.IO instance for socket disconnect on suspension
    // If not yet initialized (test environment), io will be null — handled safely in service
    let io = null;
    try {
      io = getIO();
    } catch (_) {
      // Socket.IO not initialized — proceed without socket disconnect
    }

    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const result = await moderationService.updateUserStatus(
      userId,
      req.user.userId,
      { status: parsed.status, reason: parsed.reason },
      io,
      context
    );

    const actionVerb = parsed.status === 'SUSPENDED' ? 'suspended' : 'reactivated';
    return res.status(200).json({
      success: true,
      message: `User account has been ${actionVerb}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listUsers,
  updateUserStatus,
};
