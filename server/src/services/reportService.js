import mongoose from 'mongoose';
import Report, {
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
} from '../models/Report.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Story from '../models/Story.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

export const reportService = {
  /**
   * Submits a moderation report against a User, Post, Comment, or Story.
   *
   * @param {string} reporterId Authenticated user submitting the report
   * @param {Object} reportData { targetType, targetId, reason, details }
   * @returns {Promise<Object>} Created report
   */
  async createReport(reporterId, { targetType, targetId, reason, details = '' } = {}, context = {}) {
    // 1. Validate targetType enum
    if (!targetType || !REPORT_TARGET_TYPES.includes(targetType)) {
      throw ApiError.badRequest(
        `Invalid targetType. Must be one of: ${REPORT_TARGET_TYPES.join(', ')}`
      );
    }

    // 2. Validate targetId format
    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      throw ApiError.badRequest('Invalid target ID format');
    }

    // 3. Verify target existence
    let targetExists = false;
    if (targetType === 'USER') {
      targetExists = await User.exists({ _id: targetId });
    } else if (targetType === 'POST') {
      targetExists = await Post.exists({ _id: targetId });
    } else if (targetType === 'COMMENT') {
      targetExists = await Comment.exists({ _id: targetId });
    } else if (targetType === 'STORY') {
      const story = await Story.findById(targetId).lean();
      targetExists = Boolean(story && story.expiresAt > new Date());
    }

    if (!targetExists) {
      throw ApiError.notFound(`Target ${targetType.toLowerCase()} not found`);
    }

    // 4. Validate reason enum
    if (!reason || !REPORT_REASONS.includes(reason)) {
      throw ApiError.badRequest(
        `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`
      );
    }

    // 5. Validate optional details length
    if (details && typeof details === 'string' && details.length > 1000) {
      throw ApiError.badRequest('Report details cannot exceed 1000 characters');
    }

    // 6. Anti-Spam: Prevent duplicate active reports from the same user on the same entity
    const existingActive = await Report.findOne({
      reporter: reporterId,
      targetType,
      targetId,
      status: 'OPEN',
    });

    if (existingActive) {
      throw ApiError.conflict(
        'You have already submitted an active report for this content'
      );
    }

    // 7. Persist Report document
    let report;
    try {
      report = await Report.create({
        reporter: reporterId,
        targetType,
        targetId,
        reason,
        details: typeof details === 'string' ? details.trim() : '',
        status: 'OPEN',
      });
    } catch (err) {
      if (err.code === 11000) {
        throw ApiError.conflict(
          'You have already submitted an active report for this content'
        );
      }
      throw err;
    }

    await auditService.createAuditLog({
      actor: reporterId,
      action: 'REPORT_CREATED',
      targetType,
      targetId,
      metadata: {
        reason: report.reason,
        reportId: report._id.toString(),
      },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      id: report._id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
    };
  },
};

export default reportService;
