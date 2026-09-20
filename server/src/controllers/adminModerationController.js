import moderationService from '../services/moderationService.js';
import { contentModerationSchema } from '../validations/adminValidation.js';
import AppError from '../utils/AppError.js';

/**
 * PATCH /api/admin/posts/:postId/moderation
 * Sets moderation status on a post (ACTIVE / HIDDEN / REMOVED).
 */
export const moderatePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const parseResult = contentModerationSchema.safeParse(req.body);
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

    const result = await moderationService.moderatePost(
      postId,
      req.user.userId,
      { status: parsed.status, reason: parsed.reason },
      context
    );

    return res.status(200).json({
      success: true,
      message: `Post moderation status updated to ${parsed.status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/comments/:commentId/moderation
 * Sets moderation status on a comment (ACTIVE / HIDDEN / REMOVED).
 */
export const moderateComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const parseResult = contentModerationSchema.safeParse(req.body);
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

    const result = await moderationService.moderateComment(
      commentId,
      req.user.userId,
      { status: parsed.status, reason: parsed.reason },
      context
    );

    return res.status(200).json({
      success: true,
      message: `Comment moderation status updated to ${parsed.status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/stories/:storyId/moderation
 * Sets moderation status on a story (ACTIVE / HIDDEN / REMOVED).
 * Respects the dual visibility condition: moderationStatus AND expiresAt > now.
 */
export const moderateStory = async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const parseResult = contentModerationSchema.safeParse(req.body);
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

    const result = await moderationService.moderateStory(
      storyId,
      req.user.userId,
      { status: parsed.status, reason: parsed.reason },
      context
    );

    return res.status(200).json({
      success: true,
      message: `Story moderation status updated to ${parsed.status}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  moderatePost,
  moderateComment,
  moderateStory,
};
