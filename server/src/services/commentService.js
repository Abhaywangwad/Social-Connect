import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';
import notificationService from './notificationService.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

/**
 * Validates MongoDB ObjectId format.
 * Returns clean 400 Bad Request error if malformed.
 */
const validateObjectId = (id, resourceName = 'Resource') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

/**
 * Validates and sanitizes comment content.
 * Must be non-empty, trimmed, and between 1 and 1000 characters.
 */
const validateContent = (content) => {
  if (typeof content !== 'string') {
    throw ApiError.badRequest('Comment content must be a string');
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw ApiError.badRequest('Comment content cannot be empty or whitespace only');
  }

  if (trimmed.length > 1000) {
    throw ApiError.badRequest('Comment content cannot exceed 1000 characters');
  }

  return trimmed;
};

/**
 * Creates a top-level comment on a post.
 * Atomically increments Post.commentsCount by 1.
 *
 * @param {string} postId
 * @param {string} authorId Authenticated user ID (from JWT)
 * @param {string} content
 * @returns {Promise<Object>} Populated comment
 */
export const createComment = async (postId, authorId, content, context = {}) => {
  validateObjectId(postId, 'Post');
  const sanitizedContent = validateContent(content);

  // Verify post exists
  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Assert commenter and post author are not blocked
  await blockService.assertUsersNotBlocked(authorId, post.author);

  // Create top-level comment
  const comment = await Comment.create({
    author: authorId,
    post: postId,
    content: sanitizedContent,
    parentComment: null,
  });

  // Atomically increment Post.commentsCount
  await Post.findByIdAndUpdate(postId, {
    $inc: { commentsCount: 1 },
  });

  // Trigger COMMENT notification (suppressed if self-comment)
  await notificationService.createCommentNotification(authorId, post, comment._id);

  // Populate safe public author fields
  await comment.populate('author', 'username fullName profilePicture isVerified');

  await auditService.createAuditLog({
    actor: authorId,
    action: 'COMMENT_CREATED',
    targetType: 'COMMENT',
    targetId: comment._id,
    metadata: { postId: postId.toString(), isReply: false },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return comment;
};

/**
 * Creates a 1-level reply to a top-level comment.
 * Rejects attempts to reply to an existing reply (max depth: 1 level).
 * Atomically increments parent.repliesCount and Post.commentsCount.
 *
 * @param {string} commentId Parent comment ID
 * @param {string} authorId Authenticated user ID (from JWT)
 * @param {string} content
 * @param {Object} [context]
 * @returns {Promise<Object>} Populated reply
 */
export const createReply = async (commentId, authorId, content, context = {}) => {
  validateObjectId(commentId, 'Comment');
  const sanitizedContent = validateContent(content);

  // Find parent comment
  const parentComment = await Comment.findById(commentId);
  if (!parentComment) {
    throw ApiError.notFound('Parent comment not found');
  }

  // Hierarchy rule: Max depth is 1 level. Cannot reply to a reply.
  if (parentComment.parentComment !== null) {
    throw ApiError.badRequest(
      'Cannot reply to a reply. Only top-level comments can receive replies.'
    );
  }

  // Assert replier and parent comment author are not blocked
  await blockService.assertUsersNotBlocked(authorId, parentComment.author);

  // Verify associated post still exists
  const post = await Post.findById(parentComment.post);
  if (!post) {
    throw ApiError.notFound('Associated post not found');
  }

  // Assert replier and post author are not blocked
  await blockService.assertUsersNotBlocked(authorId, post.author);

  // Create reply
  const reply = await Comment.create({
    author: authorId,
    post: parentComment.post,
    content: sanitizedContent,
    parentComment: parentComment._id,
  });

  // Atomically increment parent.repliesCount and Post.commentsCount
  await Promise.all([
    Comment.findByIdAndUpdate(parentComment._id, {
      $inc: { repliesCount: 1 },
    }),
    Post.findByIdAndUpdate(parentComment.post, {
      $inc: { commentsCount: 1 },
    }),
  ]);

  // Trigger REPLY notification (suppressed if self-reply)
  await notificationService.createReplyNotification(authorId, parentComment, reply._id);

  // Populate safe author fields
  await reply.populate('author', 'username fullName profilePicture isVerified');

  await auditService.createAuditLog({
    actor: authorId,
    action: 'COMMENT_CREATED',
    targetType: 'COMMENT',
    targetId: reply._id,
    metadata: {
      postId: parentComment.post.toString(),
      parentCommentId: commentId.toString(),
      isReply: true,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return reply;
};

/**
 * Retrieves top-level comments for a post in reverse-chronological order (paginated).
 *
 * @param {string} postId
 * @param {Object} pagination { page, limit }
 * @returns {Promise<Object>} { comments, pagination }
 */
export const getPostComments = async (postId, { page = 1, limit = 20 }) => {
  validateObjectId(postId, 'Post');

  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  const rawPage = parseInt(page, 10);
  const rawLimit = parseInt(limit, 10);

  if (isNaN(rawPage) || rawPage < 1) {
    throw ApiError.badRequest('Page must be a positive integer');
  }

  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }

  // Safely cap limit to 50 to prevent pagination abuse
  const parsedLimit = Math.min(50, rawLimit);
  const parsedPage = rawPage;
  const skip = (parsedPage - 1) * parsedLimit;

  const filter = { post: postId, parentComment: null, moderationStatus: 'ACTIVE' };

  const [comments, totalComments] = await Promise.all([
    Comment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('author', 'username fullName profilePicture isVerified')
      .lean(),
    Comment.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalComments / parsedLimit);

  return {
    comments,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalComments,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

/**
 * Retrieves replies for a specific top-level comment in reverse-chronological order (paginated).
 *
 * @param {string} commentId
 * @param {Object} pagination { page, limit }
 * @returns {Promise<Object>} { replies, pagination }
 */
export const getCommentReplies = async (commentId, { page = 1, limit = 20 }) => {
  validateObjectId(commentId, 'Comment');

  const parentComment = await Comment.findById(commentId);
  if (!parentComment) {
    throw ApiError.notFound('Comment not found');
  }

  if (parentComment.parentComment !== null) {
    throw ApiError.badRequest('Replies can only be fetched for top-level comments');
  }

  const rawPage = parseInt(page, 10);
  const rawLimit = parseInt(limit, 10);

  if (isNaN(rawPage) || rawPage < 1) {
    throw ApiError.badRequest('Page must be a positive integer');
  }

  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }

  const parsedLimit = Math.min(50, rawLimit);
  const parsedPage = rawPage;
  const skip = (parsedPage - 1) * parsedLimit;

  const filter = { parentComment: commentId, moderationStatus: 'ACTIVE' };

  const [replies, totalReplies] = await Promise.all([
    Comment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('author', 'username fullName profilePicture isVerified')
      .lean(),
    Comment.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalReplies / parsedLimit);

  return {
    replies,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalComments: totalReplies,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

/**
 * Updates a comment's content.
 * Only the original comment author is authorized to edit it.
 *
 * @param {string} commentId
 * @param {string} currentUserId
 * @param {string} content
 * @returns {Promise<Object>} Updated comment
 */
export const updateComment = async (commentId, currentUserId, content, context = {}) => {
  validateObjectId(commentId, 'Comment');
  const sanitizedContent = validateContent(content);

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw ApiError.notFound('Comment not found');
  }

  // Authorization: Only the comment author may edit
  if (comment.author.toString() !== currentUserId.toString()) {
    throw ApiError.forbidden('You are not authorized to edit this comment');
  }

  comment.content = sanitizedContent;
  await comment.save();

  await comment.populate('author', 'username fullName profilePicture isVerified');

  await auditService.createAuditLog({
    actor: currentUserId,
    action: 'COMMENT_UPDATED',
    targetType: 'COMMENT',
    targetId: comment._id,
    metadata: { postId: comment.post.toString() },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return comment;
};

/**
 * Deletes a comment.
 * Authorized for:
 * 1. The comment author
 * 2. The owner of the post on which the comment resides
 *
 * If a top-level comment is deleted, all of its direct replies are cascade-deleted,
 * and Post.commentsCount is decremented by the total deleted count.
 *
 * @param {string} commentId
 * @param {string} currentUserId
 * @param {Object} [context]
 * @returns {Promise<Object>}
 */
export const deleteComment = async (commentId, currentUserId, context = {}) => {
  validateObjectId(commentId, 'Comment');

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw ApiError.notFound('Comment not found');
  }

  const post = await Post.findById(comment.post);

  // Authorization check: comment author OR post owner
  const isCommentAuthor = comment.author.toString() === currentUserId.toString();
  const isPostOwner = post && post.author.toString() === currentUserId.toString();

  if (!isCommentAuthor && !isPostOwner) {
    throw ApiError.forbidden('You are not authorized to delete this comment');
  }

  if (comment.parentComment !== null) {
    // ── Deleting a Reply ──
    await comment.deleteOne();

    // Decrement parent repliesCount and post commentsCount atomically
    await Promise.all([
      Comment.updateOne(
        { _id: comment.parentComment, repliesCount: { $gt: 0 } },
        { $inc: { repliesCount: -1 } }
      ),
      Post.updateOne(
        { _id: comment.post, commentsCount: { $gt: 0 } },
        { $inc: { commentsCount: -1 } }
      ),
      Notification.deleteMany({ comment: commentId }),
    ]);

    await auditService.createAuditLog({
      actor: currentUserId,
      action: 'COMMENT_DELETED',
      targetType: 'COMMENT',
      targetId: commentId,
      metadata: { postId: comment.post.toString(), deletedCount: 1, isReply: true },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      message: 'Reply deleted successfully',
      commentId,
      deletedCount: 1,
    };
  } else {
    // ── Deleting a Top-Level Comment (with cascade of replies) ──
    const replies = await Comment.find({ parentComment: commentId }).select('_id');
    const totalDeleted = 1 + replies.length;
    const replyIds = replies.map((r) => r._id);

    // Delete direct replies, parent comment, and associated notifications
    await Promise.all([
      Comment.deleteMany({ parentComment: commentId }),
      comment.deleteOne(),
      Notification.deleteMany({ comment: { $in: [commentId, ...replyIds] } }),
    ]);

    // Decrement post commentsCount safely ensuring counter >= 0
    await Post.updateOne(
      { _id: comment.post },
      [
        {
          $set: {
            commentsCount: {
              $max: [0, { $subtract: ['$commentsCount', totalDeleted] }],
            },
          },
        },
      ]
    );

    await auditService.createAuditLog({
      actor: currentUserId,
      action: 'COMMENT_DELETED',
      targetType: 'COMMENT',
      targetId: commentId,
      metadata: { postId: comment.post.toString(), deletedCount: totalDeleted, isReply: false },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      message: 'Comment and replies deleted successfully',
      commentId,
      deletedCount: totalDeleted,
    };
  }
};

export default {
  createComment,
  createReply,
  getPostComments,
  getCommentReplies,
  updateComment,
  deleteComment,
};
