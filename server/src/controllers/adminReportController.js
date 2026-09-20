import moderationService from '../services/moderationService.js';
import {
  adminReportListSchema,
  reportStatusSchema,
} from '../validations/adminValidation.js';
import AppError from '../utils/AppError.js';

/**
 * GET /api/admin/reports
 * Lists reports with optional filters and pagination.
 */
export const listReports = async (req, res, next) => {
  try {
    const parseResult = adminReportListSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }
    const parsed = parseResult.data;

    const result = await moderationService.getReports({
      status: parsed.status,
      targetType: parsed.targetType,
      reason: parsed.reason,
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
 * GET /api/admin/reports/:reportId
 * Returns detailed information for a single report including resolved target entity.
 */
export const getReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await moderationService.getReportById(reportId);

    return res.status(200).json({
      success: true,
      data: { report },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/reports/:reportId/status
 * Updates report status with state-machine validation.
 * Sets resolvedBy / resolvedAt for terminal transitions.
 */
export const updateReportStatus = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const parseResult = reportStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw AppError.badRequest(
        parseResult.error.issues.map((e) => e.message).join(', '),
        'VALIDATION_ERROR'
      );
    }
    const parsed = parseResult.data;

    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };

    const report = await moderationService.updateReportStatus(
      reportId,
      req.user.userId,
      { status: parsed.status, moderationNote: parsed.moderationNote },
      context
    );

    return res.status(200).json({
      success: true,
      message: `Report status updated to ${parsed.status}`,
      data: { report },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listReports,
  getReport,
  updateReportStatus,
};
