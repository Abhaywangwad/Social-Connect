import auditService from '../services/auditService.js';
import {
  auditLogQuerySchema,
  auditLogIdParamSchema,
  userActivitySummaryQuerySchema,
} from '../validations/adminAuditValidation.js';
import AppError from '../utils/AppError.js';

/**
 * GET /api/admin/audit-logs
 * Retrieves paginated audit logs with search/filter options.
 */
export const listAuditLogs = async (req, res, next) => {
  try {
    const parseResult = auditLogQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }
    const parsed = parseResult.data;

    const result = await auditService.getAuditLogs({
      actorId: parsed.actorId,
      action: parsed.action,
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      from: parsed.from,
      to: parsed.to,
      page: parsed.page,
      limit: parsed.limit,
    });

    return res.status(200).json({
      success: true,
      message: 'Audit logs fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/audit-logs/:auditLogId
 * Retrieves detailed information for a single audit log.
 */
export const getAuditLog = async (req, res, next) => {
  try {
    const parseResult = auditLogIdParamSchema.safeParse(req.params);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }

    const log = await auditService.getAuditLogById(parseResult.data.auditLogId);

    return res.status(200).json({
      success: true,
      message: 'Audit log retrieved successfully',
      data: { log },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/audit-logs/users/:userId/summary
 * Retrieves administrative activity summary for a user.
 */
export const getUserActivitySummary = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const parseResult = userActivitySummaryQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }

    const summary = await auditService.getUserActivitySummary(userId, parseResult.data);

    return res.status(200).json({
      success: true,
      message: 'User activity summary fetched successfully',
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listAuditLogs,
  getAuditLog,
  getUserActivitySummary,
};
