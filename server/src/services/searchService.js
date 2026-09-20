import mongoose from 'mongoose';
import User from '../models/User.js';
import Follow from '../models/Follow.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Escapes special regular expression characters to prevent ReDoS or invalid regex syntax.
 *
 * @param {string} string
 * @returns {string} Escaped string
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Searches users by username prefix and full name.
 * Excludes the currently authenticated user at the database query level.
 * Computes follow state for all returned users using a single batched Follow query (no N+1).
 *
 * @param {string} currentUserId Authenticated user ID (from req.user.userId)
 * @param {Object} queryParams
 * @param {string} queryParams.q Search term
 * @param {number|string} [queryParams.page=1]
 * @param {number|string} [queryParams.limit=20]
 * @returns {Promise<{ users: Array<Object>, pagination: Object }>}
 */
export const searchUsers = async (currentUserId, { q, page = 1, limit = 20 } = {}) => {
  // 1. Validate search query
  if (typeof q !== 'string') {
    throw ApiError.badRequest('Search query is required');
  }

  const trimmedQ = q.trim();
  if (trimmedQ.length === 0) {
    throw ApiError.badRequest('Search query cannot be empty');
  }

  // Enforce minimum 2 characters to avoid excessively broad queries
  if (trimmedQ.length < 2) {
    throw ApiError.badRequest('Search query must be at least 2 characters');
  }

  // 2. Validate and parse pagination parameters
  const rawPage = parseInt(page, 10);
  const rawLimit = parseInt(limit, 10);

  if (isNaN(rawPage) || rawPage < 1) {
    throw ApiError.badRequest('Page must be a positive integer');
  }

  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }

  // Safe cap on limit (default 20, max 50)
  const parsedLimit = Math.min(50, rawLimit);
  const parsedPage = rawPage;
  const skip = (parsedPage - 1) * parsedLimit;

  // 3. Normalize search query to lowercase (matches normalized storage)
  const normalizedQ = trimmedQ.toLowerCase();
  const escapedQ = escapeRegex(normalizedQ);

  // 4. Construct MongoDB query filter
  // - Exclude current authenticated user and any blocked users directly in the database
  // - Username prefix matching (/^query/) enables index range scanning on { username: 1 }
  // - Full-name matching on indexed normalizedFullName
  const { allBlockedIds } = await blockService.getBlockedUserIds(currentUserId);
  const excludedUserIds = [
    new mongoose.Types.ObjectId(currentUserId),
    ...allBlockedIds.map((id) => new mongoose.Types.ObjectId(id)),
  ];

  const filter = {
    _id: { $nin: excludedUserIds },
    accountStatus: 'ACTIVE', // Suspended users are not discoverable through search
    $or: [
      { username: { $regex: `^${escapedQ}` } },
      { normalizedFullName: { $regex: escapedQ } },
    ],
  };

  // 5. Execute paginated user retrieval & total count in parallel
  const [rawUsers, totalUsers] = await Promise.all([
    User.find(filter)
      .select(
        '_id username fullName profilePicture bio isVerified isPrivate followersCount followingCount'
      )
      .sort({ username: 1, _id: 1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // 6. Efficient Single-Query Follow State Resolution (Prevent N+1)
  // Instead of querying Follow 20 times, query ONCE with $in across all retrieved IDs
  const targetUserIds = rawUsers.map((u) => u._id);
  let followingSet = new Set();

  if (targetUserIds.length > 0) {
    const followDocs = await Follow.find({
      follower: currentUserId,
      following: { $in: targetUserIds },
    })
      .select('following')
      .lean();

    followingSet = new Set(followDocs.map((f) => f.following.toString()));
  }

  // 7. Format safe public response with isFollowing flag
  const users = rawUsers.map((user) => ({
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    profilePicture: user.profilePicture || null,
    bio: user.bio || '',
    isVerified: Boolean(user.isVerified),
    isPrivate: Boolean(user.isPrivate),
    followersCount: typeof user.followersCount === 'number' ? user.followersCount : 0,
    followingCount: typeof user.followingCount === 'number' ? user.followingCount : 0,
    isFollowing: followingSet.has(user._id.toString()),
  }));

  const totalPages = Math.ceil(totalUsers / parsedLimit);

  return {
    users,
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

export default {
  searchUsers,
};
