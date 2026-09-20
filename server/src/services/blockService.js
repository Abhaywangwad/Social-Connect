import mongoose from 'mongoose';
import Block from '../models/Block.js';
import User from '../models/User.js';
import Follow from '../models/Follow.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

/**
 * Formats a clean public user representation.
 */
const formatSafeUser = (user) => {
  if (!user) return null;
  return {
    id: user._id || user.id,
    username: user.username,
    fullName: user.fullName,
    profilePicture: user.profilePicture || null,
    isVerified: Boolean(user.isVerified),
  };
};

/**
 * Checks whether the active MongoDB connection topology supports multi-document transactions.
 */
const canUseTransactions = () => {
  try {
    const topologyType = mongoose.connection.getClient()?.topology?.description?.type;
    return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
  } catch (_) {
    return false;
  }
};

/**
 * ─── Block Service ───────────────────────────────────────────────────────────
 *
 * Manages user blocking, unblocking, block queries, and access-control checks.
 */
export const blockService = {
  /**
   * Blocks a target user by username.
   * Performs bidirectional follow cleanup and counter adjustments.
   * Uses a MongoDB transaction where replica sets are active.
   *
   * @param {string} currentUserId Authenticated blocker user ID
   * @param {string} targetUsername Username of the user to block
   * @param {Object} [context] Request context
   * @returns {Promise<Object>}
   */
  async blockUser(currentUserId, targetUsername, context = {}) {
    if (!targetUsername || typeof targetUsername !== 'string') {
      throw ApiError.badRequest('Target username is required');
    }

    const normalizedUsername = targetUsername.trim().toLowerCase();
    const targetUser = await User.findOne({ username: normalizedUsername });
    if (!targetUser) {
      throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
    }

    // 1. Prevent self-blocking
    if (targetUser._id.toString() === currentUserId.toString()) {
      throw ApiError.badRequest('You cannot block yourself');
    }

    // 2. Prevent duplicate blocks
    const existingBlock = await Block.findOne({
      blocker: currentUserId,
      blocked: targetUser._id,
    });

    if (existingBlock) {
      throw ApiError.conflict('You have already blocked this user');
    }

    // 3. Execute Block creation and Follow cleanup with transaction support
    const useTransaction = canUseTransactions();
    let session = null;

    if (useTransaction) {
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch (_err) {
        session = null;
      }
    }

    try {
      const sessionOpt = session ? { session } : {};

      // Create block document
      if (session) {
        await Block.create(
          [
            {
              blocker: currentUserId,
              blocked: targetUser._id,
            },
          ],
          sessionOpt
        );
      } else {
        await Block.create({
          blocker: currentUserId,
          blocked: targetUser._id,
        });
      }

      // 4. Clean up existing Follow: CurrentUser -> TargetUser
      const followAtoB = await Follow.findOneAndDelete(
        {
          follower: currentUserId,
          following: targetUser._id,
        },
        sessionOpt
      );

      if (followAtoB) {
        await Promise.all([
          User.updateOne(
            { _id: currentUserId, followingCount: { $gt: 0 } },
            { $inc: { followingCount: -1 } },
            sessionOpt
          ),
          User.updateOne(
            { _id: targetUser._id, followersCount: { $gt: 0 } },
            { $inc: { followersCount: -1 } },
            sessionOpt
          ),
        ]);
      }

      // 5. Clean up existing Follow: TargetUser -> CurrentUser
      const followBtoA = await Follow.findOneAndDelete(
        {
          follower: targetUser._id,
          following: currentUserId,
        },
        sessionOpt
      );

      if (followBtoA) {
        await Promise.all([
          User.updateOne(
            { _id: targetUser._id, followingCount: { $gt: 0 } },
            { $inc: { followingCount: -1 } },
            sessionOpt
          ),
          User.updateOne(
            { _id: currentUserId, followersCount: { $gt: 0 } },
            { $inc: { followersCount: -1 } },
            sessionOpt
          ),
        ]);
      }

      if (session) {
        await session.commitTransaction();
      }
    } catch (error) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (_) {}
      }
      if (error.code === 11000) {
        throw ApiError.conflict('You have already blocked this user');
      }
      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }

    await auditService.createAuditLog({
      actor: currentUserId,
      action: 'USER_BLOCKED',
      targetType: 'USER',
      targetId: targetUser._id,
      metadata: { blockedUsername: targetUser.username },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      message: `Successfully blocked @${targetUser.username}`,
      blockedUser: formatSafeUser(targetUser),
    };
  },

  /**
   * Unblocks a previously blocked user.
   * NOTE: Does NOT automatically restore prior follow relationships.
   *
   * @param {string} currentUserId
   * @param {string} targetUsername
   * @param {Object} [context]
   * @returns {Promise<Object>}
   */
  async unblockUser(currentUserId, targetUsername, context = {}) {
    if (!targetUsername || typeof targetUsername !== 'string') {
      throw ApiError.badRequest('Target username is required');
    }

    const normalizedUsername = targetUsername.trim().toLowerCase();
    const targetUser = await User.findOne({ username: normalizedUsername });
    if (!targetUser) {
      throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
    }

    const deletedBlock = await Block.findOneAndDelete({
      blocker: currentUserId,
      blocked: targetUser._id,
    });

    if (!deletedBlock) {
      throw ApiError.badRequest(`You have not blocked @${targetUser.username}`);
    }

    await auditService.createAuditLog({
      actor: currentUserId,
      action: 'USER_UNBLOCKED',
      targetType: 'USER',
      targetId: targetUser._id,
      metadata: { unblockedUsername: targetUser.username },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return {
      message: `Successfully unblocked @${targetUser.username}`,
    };
  },

  /**
   * Retrieves the block status between the current user and target user.
   * Returns bilateral perspective.
   *
   * @param {string} currentUserId
   * @param {string} targetUsername
   * @returns {Promise<{ isBlocked: boolean, isBlockedByTarget: boolean }>}
   */
  async getBlockStatus(currentUserId, targetUsername) {
    if (!targetUsername || typeof targetUsername !== 'string') {
      throw ApiError.badRequest('Target username is required');
    }

    const normalizedUsername = targetUsername.trim().toLowerCase();
    const targetUser = await User.findOne({ username: normalizedUsername });
    if (!targetUser) {
      throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
    }

    const [isBlocked, isBlockedByTarget] = await Promise.all([
      Block.exists({ blocker: currentUserId, blocked: targetUser._id }),
      Block.exists({ blocker: targetUser._id, blocked: currentUserId }),
    ]);

    return {
      isBlocked: Boolean(isBlocked),
      isBlockedByTarget: Boolean(isBlockedByTarget),
    };
  },

  /**
   * Retrieves a paginated list of users blocked by the current user.
   *
   * @param {string} currentUserId
   * @param {Object} options { page, limit }
   * @returns {Promise<Object>}
   */
  async getBlockedUsers(currentUserId, { page = 1, limit = 20 } = {}) {
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

    const filter = { blocker: currentUserId };

    const [blocks, totalBlocked] = await Promise.all([
      Block.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('blocked', 'username fullName profilePicture isVerified')
        .lean(),
      Block.countDocuments(filter),
    ]);

    const users = blocks
      .map((b) => formatSafeUser(b.blocked))
      .filter(Boolean);

    const totalPages = Math.ceil(totalBlocked / parsedLimit);

    return {
      users,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalBlocked,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1,
      },
    };
  },

  /**
   * Checks whether a bilateral block relationship exists between two users.
   *
   * @param {string|mongoose.Types.ObjectId} userA
   * @param {string|mongoose.Types.ObjectId} userB
   * @returns {Promise<boolean>}
   */
  async areUsersBlocked(userA, userB) {
    if (!userA || !userB) return false;
    if (userA.toString() === userB.toString()) return false;

    const exists = await Block.exists({
      $or: [
        { blocker: userA, blocked: userB },
        { blocker: userB, blocked: userA },
      ],
    });

    return Boolean(exists);
  },

  /**
   * Asserts that two users are NOT blocked. Throws 403 Forbidden if blocked.
   *
   * @param {string|mongoose.Types.ObjectId} userA
   * @param {string|mongoose.Types.ObjectId} userB
   * @param {string} [message]
   */
  async assertUsersNotBlocked(userA, userB, message = 'Action unavailable due to user blocking') {
    const isBlocked = await this.areUsersBlocked(userA, userB);
    if (isBlocked) {
      throw ApiError.forbidden(message);
    }
  },

  /**
   * Retrieves all user IDs involved in any block relationship with the given user.
   * Used for efficient set-based filtering in Feeds, Search, and Stories without N+1 queries.
   *
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<{ allBlockedIds: string[] }>}
   */
  async getBlockedUserIds(userId) {
    if (!userId) {
      const empty = [];
      empty.allBlockedIds = empty;
      return empty;
    }

    const blocks = await Block.find({
      $or: [{ blocker: userId }, { blocked: userId }],
    })
      .select('blocker blocked')
      .lean();

    const blockedIdSet = new Set();
    const currentIdStr = userId.toString();

    for (const b of blocks) {
      const blockerStr = b.blocker.toString();
      const blockedStr = b.blocked.toString();
      if (blockerStr !== currentIdStr) blockedIdSet.add(blockerStr);
      if (blockedStr !== currentIdStr) blockedIdSet.add(blockedStr);
    }

    const list = Array.from(blockedIdSet);
    list.allBlockedIds = list;
    return list;
  },
};

export default blockService;
