import mongoose from 'mongoose';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Story from '../models/Story.js';
import Report from '../models/Report.js';
import Session from '../models/Session.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

// ─── Safe Target Model Map ────────────────────────────────────────────────────
/**
 * Explicit mapping from targetType string to Mongoose model.
 * NEVER evaluate targetType as a dynamic model name — that would allow
 * arbitrary model access if a client supplies an unexpected value.
 */
const TARGET_MODEL_MAP = {
  USER: User,
  POST: Post,
  COMMENT: Comment,
  STORY: Story,
};

/**
 * Validates a MongoDB ObjectId string.
 */
const validateObjectId = (id, resourceName = 'Resource') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

// ─── State Machine: Allowed Report Status Transitions ────────────────────────
/**
 * Moderation report state machine:
 *
 *   OPEN      → REVIEWING, RESOLVED, DISMISSED
 *   REVIEWING → RESOLVED, DISMISSED
 *   RESOLVED  → (terminal)
 *   DISMISSED → (terminal)
 *
 * Terminal states cannot be re-opened to preserve the integrity of the
 * moderation record. Further action would require a new report.
 */
const ALLOWED_TRANSITIONS = {
  OPEN: ['REVIEWING', 'RESOLVED', 'DISMISSED'],
  REVIEWING: ['RESOLVED', 'DISMISSED'],
  RESOLVED: [],
  DISMISSED: [],
};

// ─── Report Queue ─────────────────────────────────────────────────────────────

/**
 * Retrieves a paginated, filtered list of reports for the moderation queue.
 * Default ordering: oldest unresolved reports first (createdAt ASC).
 *
 * @param {Object} params
 * @param {string} [params.status]
 * @param {string} [params.targetType]
 * @param {string} [params.reason]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<Object>} { reports, pagination }
 */
export const getReports = async ({
  status,
  targetType,
  reason,
  page = 1,
  limit = 20,
} = {}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  // Build explicit filter — no arbitrary operator pass-through
  const filter = {};
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;
  if (reason) filter.reason = reason;

  const [reports, totalReports] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: 1, _id: 1 }) // Oldest first — surfaces unresolved reports
      .skip(skip)
      .limit(parsedLimit)
      .populate('reporter', 'username fullName profilePicture')
      .lean(),
    Report.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalReports / parsedLimit) || 1;

  return {
    reports: reports.map(formatReport),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalReports,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

/**
 * Retrieves detailed information for a single report including the resolved target.
 * Resolves the target entity using the safe TARGET_MODEL_MAP.
 *
 * @param {string} reportId
 * @returns {Promise<Object>} Detailed report
 */
export const getReportById = async (reportId) => {
  validateObjectId(reportId, 'Report');

  const report = await Report.findById(reportId)
    .populate('reporter', 'username fullName profilePicture accountStatus')
    .populate('resolvedBy', 'username fullName')
    .lean();

  if (!report) {
    throw ApiError.notFound('Report not found');
  }

  // ── Safe Target Resolution ─────────────────────────────────────────────────
  // Use the explicit model map — never evaluate report.targetType as a model name
  const TargetModel = TARGET_MODEL_MAP[report.targetType];
  let target = null;

  if (TargetModel && mongoose.Types.ObjectId.isValid(report.targetId)) {
    const rawTarget = await TargetModel.findById(report.targetId)
      .select(buildTargetProjection(report.targetType))
      .lean();

    if (rawTarget) {
      target = sanitizeTarget(report.targetType, rawTarget);
    }
  }

  return {
    ...formatReport(report),
    target,
  };
};

/**
 * Updates a report's status with state-machine validation.
 * Sets resolvedBy and resolvedAt for terminal statuses.
 *
 * @param {string} reportId
 * @param {string} adminUserId
 * @param {Object} params { status, moderationNote }
 * @returns {Promise<Object>} Updated report
 */
export const updateReportStatus = async (
  reportId,
  adminUserId,
  { status, moderationNote },
  context = {}
) => {
  validateObjectId(reportId, 'Report');

  const report = await Report.findById(reportId);
  if (!report) {
    throw ApiError.notFound('Report not found');
  }

  // Validate state transition
  const allowedNext = ALLOWED_TRANSITIONS[report.status];
  if (!allowedNext || !allowedNext.includes(status)) {
    throw ApiError.badRequest(
      `Invalid status transition: ${report.status} → ${status}. Allowed: ${allowedNext?.join(', ') || 'none (terminal state)'}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const oldStatus = report.status;
  report.status = status;

  if (typeof moderationNote === 'string') {
    report.moderationNote = moderationNote.trim().slice(0, 2000);
  }

  // Track resolution for terminal states
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    report.resolvedBy = adminUserId;
    report.resolvedAt = new Date();
  }

  await report.save();

  await report.populate('reporter', 'username fullName profilePicture');
  await report.populate('resolvedBy', 'username fullName');

  await auditService.createAuditLog({
    actor: adminUserId,
    action: 'REPORT_STATUS_CHANGED',
    targetType: 'REPORT',
    targetId: report._id,
    metadata: {
      oldStatus,
      newStatus: status,
      moderationNote: report.moderationNote || null,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return formatReport(report.toObject());
};

// ─── Content Moderation ───────────────────────────────────────────────────────

/**
 * Moderates a Post by setting its moderationStatus.
 *
 * @param {string} postId
 * @param {string} adminUserId Admin performing the action
 * @param {Object} params { status, reason }
 * @returns {Promise<Object>} Updated post summary
 */
export const moderatePost = async (postId, adminUserId, { status, reason }, context = {}) => {
  validateObjectId(postId, 'Post');

  const post = await Post.findById(postId).select(
    'author caption moderationStatus moderatedAt moderatedBy'
  );
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  const oldStatus = post.moderationStatus;
  post.moderationStatus = status;
  post.moderatedAt = new Date();
  post.moderatedBy = adminUserId;
  await post.save();

  await auditService.createAuditLog({
    actor: adminUserId,
    action: 'POST_MODERATED',
    targetType: 'POST',
    targetId: post._id,
    metadata: {
      oldStatus,
      newStatus: status,
      reason: reason || null,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    postId: post._id,
    moderationStatus: post.moderationStatus,
    moderatedAt: post.moderatedAt,
    moderatedBy: adminUserId,
  };
};

/**
 * Moderates a Comment by setting its moderationStatus.
 *
 * @param {string} commentId
 * @param {string} adminUserId Admin performing the action
 * @param {Object} params { status, reason }
 * @param {Object} [context]
 * @returns {Promise<Object>} Updated comment summary
 */
export const moderateComment = async (commentId, adminUserId, { status, reason }, context = {}) => {
  validateObjectId(commentId, 'Comment');

  const comment = await Comment.findById(commentId).select(
    'author post content moderationStatus moderatedAt moderatedBy'
  );
  if (!comment) {
    throw ApiError.notFound('Comment not found');
  }

  const oldStatus = comment.moderationStatus;
  comment.moderationStatus = status;
  comment.moderatedAt = new Date();
  comment.moderatedBy = adminUserId;
  await comment.save();

  await auditService.createAuditLog({
    actor: adminUserId,
    action: 'COMMENT_MODERATED',
    targetType: 'COMMENT',
    targetId: comment._id,
    metadata: {
      oldStatus,
      newStatus: status,
      reason: reason || null,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    commentId: comment._id,
    moderationStatus: comment.moderationStatus,
    moderatedAt: comment.moderatedAt,
    moderatedBy: adminUserId,
  };
};

/**
 * Moderates a Story by setting its moderationStatus.
 * Respects the dual visibility condition: moderationStatus AND expiresAt > now.
 *
 * @param {string} storyId
 * @param {string} adminUserId Admin performing the action
 * @param {Object} params { status, reason }
 * @param {Object} [context]
 * @returns {Promise<Object>} Updated story summary
 */
export const moderateStory = async (storyId, adminUserId, { status, reason }, context = {}) => {
  validateObjectId(storyId, 'Story');

  const story = await Story.findById(storyId).select(
    'author expiresAt moderationStatus moderatedAt moderatedBy'
  );
  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  const oldStatus = story.moderationStatus;
  story.moderationStatus = status;
  story.moderatedAt = new Date();
  story.moderatedBy = adminUserId;
  await story.save();

  await auditService.createAuditLog({
    actor: adminUserId,
    action: 'STORY_MODERATED',
    targetType: 'STORY',
    targetId: story._id,
    metadata: {
      oldStatus,
      newStatus: status,
      reason: reason || null,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    storyId: story._id,
    moderationStatus: story.moderationStatus,
    moderatedAt: story.moderatedAt,
    moderatedBy: adminUserId,
    expiresAt: story.expiresAt,
  };
};

// ─── User Moderation ──────────────────────────────────────────────────────────

/**
 * Suspends or reactivates a user account.
 *
 * On suspension:
 *  1. Sets accountStatus = 'SUSPENDED' + suspendedAt + suspensionReason.
 *  2. Revokes ALL active refresh sessions via Session.updateMany().
 *  3. Returns the socket io instance (if provided) to disconnect active sockets.
 *
 * Session revocation is the primary mechanism ensuring the suspended user
 * cannot refresh their access token. The short-lived access token (~15 min TTL)
 * may remain temporarily valid — this is documented and acceptable behavior.
 * Important write endpoints use accountStatusMiddleware for immediate enforcement.
 *
 * @param {string} targetUserId
 * @param {string} adminUserId
 * @param {Object} params { status, reason }
 * @param {import('socket.io').Server} [io] Socket.IO server instance for socket disconnect
 * @returns {Promise<Object>}
 */
export const updateUserStatus = async (
  targetUserId,
  adminUserId,
  { status, reason },
  io = null,
  context = {}
) => {
  validateObjectId(targetUserId, 'User');

  if (targetUserId.toString() === adminUserId.toString()) {
    throw ApiError.badRequest('Admins cannot modify their own account status');
  }

  const user = await User.findById(targetUserId).select(
    'username email accountStatus role suspendedAt suspensionReason'
  );
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Prevent suspending another admin via API
  if (user.role === 'ADMIN') {
    throw ApiError.forbidden(
      'Admin accounts cannot be suspended through the API. Use the bootstrap script.',
      'CANNOT_SUSPEND_ADMIN'
    );
  }

  const previousStatus = user.accountStatus;
  user.accountStatus = status;

  if (status === 'SUSPENDED') {
    user.suspendedAt = new Date();
    user.suspensionReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

    // Revoke all active refresh sessions immediately
    await Session.updateMany(
      { user: targetUserId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    // Disconnect active Socket.IO connections if io instance is provided
    if (io) {
      try {
        const userRoom = `user:${targetUserId}`;
        io.in(userRoom).disconnectSockets(true);
      } catch (socketErr) {
        console.warn(
          `[moderationService] Failed to disconnect sockets for user ${targetUserId}:`,
          socketErr.message
        );
      }
    }
  } else if (status === 'ACTIVE') {
    user.suspendedAt = null;
    user.suspensionReason = '';
  }

  await user.save();

  const auditAction = status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED';
  await auditService.createAuditLog({
    actor: adminUserId,
    action: auditAction,
    targetType: 'USER',
    targetId: user._id,
    metadata: {
      previousStatus,
      currentStatus: user.accountStatus,
      reason: reason || null,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    userId: user._id,
    username: user.username,
    previousStatus,
    currentStatus: user.accountStatus,
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason || undefined,
    modifiedBy: adminUserId,
    modifiedAt: new Date(),
  };
};

/**
 * Admin-facing user list/search with filters.
 *
 * @param {Object} params { q, accountStatus, role, page, limit }
 * @returns {Promise<Object>} { users, pagination }
 */
export const listUsers = async ({
  q,
  accountStatus,
  role,
  page = 1,
  limit = 20,
} = {}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const filter = {};

  if (q && typeof q === 'string' && q.trim().length > 0) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { username: { $regex: escaped, $options: 'i' } },
      { fullName: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (accountStatus) filter.accountStatus = accountStatus;
  if (role) filter.role = role;

  // Admin user list projection — includes email (operationally useful for support)
  // Never returns password, tokens, or secret fields
  const projection = 'username fullName email role accountStatus emailVerified createdAt suspendedAt';

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select(projection)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalUsers / parsedLimit) || 1;

  return {
    users: users.map(formatAdminUser),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalUsers,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

// ─── Private Formatters ───────────────────────────────────────────────────────

/**
 * Formats a report document for admin API responses.
 * Never exposes moderationNote through normal user-facing APIs —
 * it is included here because this formatter is admin-only.
 */
const formatReport = (report) => ({
  id: report._id,
  reporter: report.reporter
    ? {
        id: report.reporter._id,
        username: report.reporter.username,
        fullName: report.reporter.fullName,
        profilePicture: report.reporter.profilePicture || null,
      }
    : { id: report.reporter },
  targetType: report.targetType,
  targetId: report.targetId,
  reason: report.reason,
  details: report.details || '',
  status: report.status,
  moderationNote: report.moderationNote || '',
  resolvedBy: report.resolvedBy
    ? {
        id: report.resolvedBy._id || report.resolvedBy,
        username: report.resolvedBy.username,
        fullName: report.resolvedBy.fullName,
      }
    : null,
  resolvedAt: report.resolvedAt || null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

/**
 * Formats a User document for admin user list responses.
 * Includes email (operationally useful) but never sensitive security fields.
 */
const formatAdminUser = (user) => ({
  id: user._id,
  username: user.username,
  fullName: user.fullName,
  email: user.email,
  role: user.role || 'USER',
  accountStatus: user.accountStatus || 'ACTIVE',
  emailVerified: Boolean(user.emailVerified),
  suspendedAt: user.suspendedAt || null,
  createdAt: user.createdAt,
});

/**
 * Builds a safe projection for each target type.
 * Strips passwords, token hashes, and internal security fields.
 */
const buildTargetProjection = (targetType) => {
  switch (targetType) {
    case 'USER':
      return 'username fullName profilePicture bio accountStatus isVerified createdAt';
    case 'POST':
      return 'author caption media location likesCount commentsCount moderationStatus createdAt';
    case 'COMMENT':
      return 'author post content parentComment moderationStatus createdAt';
    case 'STORY':
      return 'author caption media expiresAt moderationStatus createdAt';
    default:
      return '_id';
  }
};

/**
 * Sanitizes a target document before returning in admin report detail.
 * Ensures no sensitive fields leak from any target type.
 */
const sanitizeTarget = (targetType, rawTarget) => {
  const base = {
    id: rawTarget._id,
    type: targetType,
    moderationStatus: rawTarget.moderationStatus || 'ACTIVE',
  };

  switch (targetType) {
    case 'USER':
      return {
        ...base,
        username: rawTarget.username,
        fullName: rawTarget.fullName,
        profilePicture: rawTarget.profilePicture || null,
        bio: rawTarget.bio || '',
        accountStatus: rawTarget.accountStatus,
        isVerified: rawTarget.isVerified,
        createdAt: rawTarget.createdAt,
      };
    case 'POST':
      return {
        ...base,
        author: rawTarget.author,
        caption: rawTarget.caption || '',
        likesCount: rawTarget.likesCount || 0,
        commentsCount: rawTarget.commentsCount || 0,
        createdAt: rawTarget.createdAt,
      };
    case 'COMMENT':
      return {
        ...base,
        author: rawTarget.author,
        post: rawTarget.post,
        content: rawTarget.content || '',
        parentComment: rawTarget.parentComment || null,
        createdAt: rawTarget.createdAt,
      };
    case 'STORY':
      return {
        ...base,
        author: rawTarget.author,
        caption: rawTarget.caption || '',
        expiresAt: rawTarget.expiresAt,
        createdAt: rawTarget.createdAt,
      };
    default:
      return base;
  }
};

export default {
  getReports,
  getReportById,
  updateReportStatus,
  moderatePost,
  moderateComment,
  moderateStory,
  updateUserStatus,
  listUsers,
};
