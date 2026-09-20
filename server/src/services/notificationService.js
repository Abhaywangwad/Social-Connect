import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Validates MongoDB ObjectId format.
 */
const validateObjectId = (id, resourceName = 'Notification') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

/**
 * Creates a notification.
 * Ignores self-actions (recipient === actor).
 *
 * @param {Object} param0
 * @returns {Promise<Object|null>}
 */
export const createNotification = async ({
  recipient,
  actor,
  type,
  post = null,
  comment = null,
  follow = null,
}) => {
  // Rule: Do not notify users of their own actions
  if (recipient.toString() === actor.toString()) {
    return null;
  }

  // Rule: Suppress notifications between blocked users
  const isBlocked = await blockService.areUsersBlocked(recipient, actor);
  if (isBlocked) {
    return null;
  }

  try {
    const notification = await Notification.create({
      recipient,
      actor,
      type,
      post,
      comment,
      follow,
      isRead: false,
    });
    return notification;
  } catch (error) {
    console.error('[NotificationService] Failed to create notification:', error.message);
    // Return null rather than failing the core business transaction if non-transactional
    return null;
  }
};

/**
 * Creates a FOLLOW notification.
 */
export const createFollowNotification = async (actorId, recipientId, followId) => {
  return createNotification({
    recipient: recipientId,
    actor: actorId,
    type: 'FOLLOW',
    follow: followId,
  });
};

/**
 * Creates a LIKE notification.
 */
export const createLikeNotification = async (actorId, post) => {
  if (!post || !post.author) return null;
  return createNotification({
    recipient: post.author,
    actor: actorId,
    type: 'LIKE',
    post: post._id,
  });
};

/**
 * Creates a COMMENT notification.
 */
export const createCommentNotification = async (actorId, post, commentId) => {
  if (!post || !post.author) return null;
  return createNotification({
    recipient: post.author,
    actor: actorId,
    type: 'COMMENT',
    post: post._id,
    comment: commentId,
  });
};

/**
 * Creates a REPLY notification.
 * Notifies the parent comment's author.
 */
export const createReplyNotification = async (actorId, parentComment, replyId) => {
  if (!parentComment || !parentComment.author) return null;
  return createNotification({
    recipient: parentComment.author,
    actor: actorId,
    type: 'REPLY',
    post: parentComment.post,
    comment: replyId,
  });
};

/**
 * Retrieves the authenticated user's notifications in reverse chronological order (paginated).
 *
 * @param {string} recipientId
 * @param {Object} paginationOptions { page, limit }
 * @returns {Promise<{ notifications: Object[], pagination: Object }>}
 */
export const getNotifications = async (recipientId, { page = 1, limit = 20 } = {}) => {
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

  const blockedUserIds = await blockService.getBlockedUserIds(recipientId);
  const notifFilter = {
    recipient: recipientId,
    ...(blockedUserIds.length > 0 ? { actor: { $nin: blockedUserIds } } : {}),
  };

  const [rawNotifications, totalNotifications] = await Promise.all([
    Notification.find(notifFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('actor', 'username fullName profilePicture isVerified')
      .populate('post', 'caption media')
      .populate('comment', 'content')
      .lean(),
    Notification.countDocuments(notifFilter),
  ]);

  // Sanitize notifications safely against deleted actors or posts
  const notifications = rawNotifications.map((notif) => {
    const actor = notif.actor || {
      _id: null,
      username: 'former_user',
      fullName: 'Former User',
      profilePicture: null,
      isVerified: false,
    };

    let post = null;
    if (notif.post) {
      post = {
        _id: notif.post._id,
        caption: notif.post.caption,
        media: (notif.post.media || []).map(({ publicId, ...rest }) => rest),
      };
    }

    let comment = null;
    if (notif.comment) {
      comment = {
        _id: notif.comment._id,
        content: notif.comment.content,
      };
    }

    return {
      _id: notif._id,
      type: notif.type,
      isRead: notif.isRead,
      actor,
      post,
      comment,
      follow: notif.follow,
      createdAt: notif.createdAt,
      updatedAt: notif.updatedAt,
    };
  });

  const totalPages = Math.ceil(totalNotifications / parsedLimit);

  return {
    notifications,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalNotifications,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

/**
 * Returns the count of unread notifications for the user.
 *
 * @param {string} recipientId
 * @returns {Promise<{ unreadCount: number }>}
 */
export const getUnreadCount = async (recipientId) => {
  const blockedUserIds = await blockService.getBlockedUserIds(recipientId);
  const filter = {
    recipient: recipientId,
    isRead: false,
    ...(blockedUserIds.length > 0 ? { actor: { $nin: blockedUserIds } } : {}),
  };

  const unreadCount = await Notification.countDocuments(filter);

  return { unreadCount };
};

/**
 * Marks a specific notification as read.
 * Enforces that only the recipient can mark it as read.
 *
 * @param {string} notificationId
 * @param {string} recipientId
 * @returns {Promise<Object>}
 */
export const markNotificationAsRead = async (notificationId, recipientId) => {
  validateObjectId(notificationId, 'Notification');

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  // Authorization: Only the recipient can modify read state
  if (notification.recipient.toString() !== recipientId.toString()) {
    throw ApiError.forbidden('You are not authorized to modify this notification');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();
  }

  return notification;
};

/**
 * Marks all unread notifications of the recipient as read via bulk update.
 *
 * @param {string} recipientId
 * @returns {Promise<{ modifiedCount: number }>}
 */
export const markAllNotificationsAsRead = async (recipientId) => {
  const result = await Notification.updateMany(
    { recipient: recipientId, isRead: false },
    { $set: { isRead: true } }
  );

  return { modifiedCount: result.modifiedCount };
};

export default {
  createNotification,
  createFollowNotification,
  createLikeNotification,
  createCommentNotification,
  createReplyNotification,
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
