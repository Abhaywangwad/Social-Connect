import reportService from '../services/reportService.js';

/**
 * POST /api/reports
 * Submits a confidential moderation report.
 */
export const createReport = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const report = await reportService.createReport(req.user.userId, req.body, context);
    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Our team will review it.',
      data: {
        report,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createReport,
};
