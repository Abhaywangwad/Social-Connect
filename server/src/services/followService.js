import Follow from '../models/Follow.js';
import User from '../models/User.js';
import notificationService from './notificationService.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

/**
 * Follows another user.
 *
 * @param {string} currentUserId Authenticated user ID (follower)
 * @param {string} targetUsername Username of the user to be followed
 * @returns {Promise<Object>}
 */
export const followUser = async (currentUserId, targetUsername, context = {}) => {
  if (!targetUsername || typeof targetUsername !== 'string') {
    throw ApiError.badRequest('Target username is required');
  }

  const normalizedUsername = targetUsername.trim().toLowerCase();

  // 1. Find target user
  const targetUser = await User.findOne({ username: normalizedUsername });
  if (!targetUser) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  // 2. Prevent self-follow
  if (targetUser._id.toString() === currentUserId.toString()) {
    throw ApiError.badRequest('You cannot follow yourself');
  }

  // 3. Prevent following blocked or blocking users
  await blockService.assertUsersNotBlocked(currentUserId, targetUser._id, 'Cannot follow this user');

  // 4. Handle private account policy
  if (targetUser.isPrivate) {
    throw ApiError.badRequest(
      'This account is private. Follow requests will be supported in a future update.'
    );
  }

  // 4. Check for existing follow relationship
  const existingFollow = await Follow.findOne({
    follower: currentUserId,
    following: targetUser._id,
  });

  if (existingFollow) {
    throw ApiError.conflict('You are already following this user');
  }

  // 5. Create relationship and update denormalized counters
  try {
    const follow = await Follow.create({
      follower: currentUserId,
      following: targetUser._id,
    });

    // Increment counters atomically
    await Promise.all([
      User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: 1 } }),
      User.findByIdAndUpdate(targetUser._id, { $inc: { followersCount: 1 } }),
    ]);

    // Create FOLLOW notification
    await notificationService.createFollowNotification(
      currentUserId,
      targetUser._id,
      follow._id
    );

    await auditService.createAuditLog({
      actor: currentUserId,
      action: 'FOLLOW_CREATED',
      targetType: 'USER',
      targetId: targetUser._id,
      metadata: { targetUsername: targetUser.username },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      isFollowing: true,
      targetUser: {
        id: targetUser._id,
        username: targetUser.username,
      },
    };
  } catch (error) {
    // Catch database-level race condition if compound index rejects concurrent duplicates
    if (error.code === 11000) {
      throw ApiError.conflict('You are already following this user');
    }
    throw error;
  }
};

/**
 * Unfollows a user.
 *
 * @param {string} currentUserId Authenticated user ID
 * @param {string} targetUsername Target username to unfollow
 * @param {Object} [context]
 * @returns {Promise<Object>}
 */
export const unfollowUser = async (currentUserId, targetUsername, context = {}) => {
  if (!targetUsername || typeof targetUsername !== 'string') {
    throw ApiError.badRequest('Target username is required');
  }

  const normalizedUsername = targetUsername.trim().toLowerCase();

  // 1. Find target user
  const targetUser = await User.findOne({ username: normalizedUsername });
  if (!targetUser) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  // 2. Prevent self-unfollow
  if (targetUser._id.toString() === currentUserId.toString()) {
    throw ApiError.badRequest('You cannot unfollow yourself');
  }

  // 3. Find and delete the follow relationship
  const deletedRelationship = await Follow.findOneAndDelete({
    follower: currentUserId,
    following: targetUser._id,
  });

  // 4. If no relationship was deleted, do NOT decrement counters
  if (!deletedRelationship) {
    throw ApiError.badRequest('You are not following this user');
  }

  // 5. Decrement counters safely (only when relationship was successfully deleted)
  await Promise.all([
    User.updateOne(
      { _id: currentUserId, followingCount: { $gt: 0 } },
      { $inc: { followingCount: -1 } }
    ),
    User.updateOne(
      { _id: targetUser._id, followersCount: { $gt: 0 } },
      { $inc: { followersCount: -1 } }
    ),
  ]);

  await auditService.createAuditLog({
    actor: currentUserId,
    action: 'FOLLOW_REMOVED',
    targetType: 'USER',
    targetId: targetUser._id,
    metadata: { targetUsername: targetUser.username },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    isFollowing: false,
    targetUser: {
      id: targetUser._id,
      username: targetUser.username,
    },
  };
};

/**
 * Checks whether the authenticated user is currently following the target user.
 *
 * @param {string} currentUserId Authenticated user ID
 * @param {string} targetUsername Target username
 * @returns {Promise<{ isFollowing: boolean, isSelf: boolean }>}
 */
export const getFollowStatus = async (currentUserId, targetUsername) => {
  if (!targetUsername || typeof targetUsername !== 'string') {
    throw ApiError.badRequest('Target username is required');
  }

  const normalizedUsername = targetUsername.trim().toLowerCase();

  const targetUser = await User.findOne({ username: normalizedUsername });
  if (!targetUser) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  if (targetUser._id.toString() === currentUserId.toString()) {
    return {
      isFollowing: false,
      isSelf: true,
    };
  }

  const follow = await Follow.findOne({
    follower: currentUserId,
    following: targetUser._id,
  });

  return {
    isFollowing: !!follow,
    isSelf: false,
  };
};

/**
 * Returns a paginated list of users who follow the target user.
 * Query executed entirely in MongoDB using skip/limit.
 *
 * @param {string} targetUsername Target username whose followers to fetch
 * @param {Object} query Pagination query params (page, limit)
 * @returns {Promise<Object>}
 */
export const getFollowers = async (targetUsername, { page = 1, limit = 20 }) => {
  const normalizedUsername = targetUsername.trim().toLowerCase();

  const targetUser = await User.findOne({ username: normalizedUsername });
  if (!targetUser) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  // Validate and clamp pagination boundaries (min 1, max 50 per page)
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  // Execute paginated lookup on Follow collection
  const [followRecords, total] = await Promise.all([
    Follow.find({ following: targetUser._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('follower', 'username fullName profilePicture isVerified')
      .lean(),
    Follow.countDocuments({ following: targetUser._id }),
  ]);

  const users = followRecords
    .filter((record) => record.follower != null)
    .map((record) => ({
      id: record.follower._id,
      username: record.follower.username,
      fullName: record.follower.fullName,
      profilePicture: record.follower.profilePicture || null,
      isVerified: record.follower.isVerified,
      followedAt: record.createdAt,
    }));

  return {
    users,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

/**
 * Returns a paginated list of users that the target user follows.
 * Query executed entirely in MongoDB using skip/limit.
 *
 * @param {string} targetUsername Target username
 * @param {Object} query Pagination query params (page, limit)
 * @returns {Promise<Object>}
 */
export const getFollowing = async (targetUsername, { page = 1, limit = 20 }) => {
  const normalizedUsername = targetUsername.trim().toLowerCase();

  const targetUser = await User.findOne({ username: normalizedUsername });
  if (!targetUser) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const [followRecords, total] = await Promise.all([
    Follow.find({ follower: targetUser._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('following', 'username fullName profilePicture isVerified')
      .lean(),
    Follow.countDocuments({ follower: targetUser._id }),
  ]);

  const users = followRecords
    .filter((record) => record.following != null)
    .map((record) => ({
      id: record.following._id,
      username: record.following.username,
      fullName: record.following.fullName,
      profilePicture: record.following.profilePicture || null,
      isVerified: record.following.isVerified,
      followedAt: record.createdAt,
    }));

  return {
    users,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};
