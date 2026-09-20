import mongoose from 'mongoose';
import Post from '../models/Post.js';
import Follow from '../models/Follow.js';
import Like from '../models/Like.js';
import Save from '../models/Save.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/**
 * Encodes a compound feed cursor (createdAt + _id) into a base64url string.
 *
 * @param {Object} param0
 * @param {Date|string} param0.createdAt
 * @param {string|mongoose.Types.ObjectId} param0.id
 * @returns {string} Base64url cursor
 */
export const encodeCursor = ({ createdAt, id }) => {
  const dateStr = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const payload = JSON.stringify({
    c: dateStr,
    i: id.toString(),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
};

/**
 * Decodes and validates a base64url compound cursor.
 * Returns { createdAt: Date, id: ObjectId }.
 * Throws 400 Bad Request on malformed or malicious cursors.
 *
 * @param {string} cursor
 * @returns {{ createdAt: Date, id: mongoose.Types.ObjectId }}
 */
export const decodeCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'string') {
    throw ApiError.badRequest('Invalid cursor provided');
  }

  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.c || !parsed.i) {
      throw new Error('Missing cursor components');
    }

    const createdAt = new Date(parsed.c);
    if (isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor timestamp');
    }

    if (!mongoose.Types.ObjectId.isValid(parsed.i)) {
      throw new Error('Invalid cursor ObjectId');
    }

    return {
      createdAt,
      id: new mongoose.Types.ObjectId(parsed.i),
    };
  } catch (_err) {
    throw ApiError.badRequest('Invalid cursor format');
  }
};

/**
 * Retrieves the list of user ObjectIds that the current user actively follows.
 * Follow collection is the single source of truth for social graph relationships.
 *
 * @param {string|mongoose.Types.ObjectId} currentUserId
 * @returns {Promise<mongoose.Types.ObjectId[]>}
 */
export const getFollowedUserIds = async (currentUserId) => {
  const follows = await Follow.find({ follower: currentUserId }).select('following').lean();
  return follows.map((f) => f.following);
};

/**
 * Retrieves bilateral blocked user ObjectIds for the current user.
 *
 * @param {string|mongoose.Types.ObjectId} currentUserId
 * @returns {Promise<mongoose.Types.ObjectId[]>}
 */
export const getBlockedUserIds = async (currentUserId) => {
  const { allBlockedIds } = await blockService.getBlockedUserIds(currentUserId);
  return allBlockedIds;
};

/**
 * Resolves the author candidate set for feed retrieval.
 * Early filtering: (followed users minus blocked users) plus current user.
 *
 * @param {string|mongoose.Types.ObjectId} currentUserId
 * @param {mongoose.Types.ObjectId[]} followedIds
 * @param {mongoose.Types.ObjectId[]} allBlockedIds
 * @returns {mongoose.Types.ObjectId[]}
 */
export const resolveFeedAuthorIds = (currentUserId, followedIds = [], allBlockedIds = []) => {
  const blockedSet = new Set(allBlockedIds.map((id) => id.toString()));
  const visibleFollowedIds = followedIds.filter((id) => !blockedSet.has(id.toString()));
  return [...visibleFollowedIds, new mongoose.Types.ObjectId(currentUserId)];
};

/**
 * Retrieves candidate posts from the database using compound cursor pagination.
 *
 * Index utilized: { moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }
 * Guarantees 100% index-covered sorting with zero in-memory sort stage.
 *
 * @param {mongoose.Types.ObjectId[]} authorIds
 * @param {Object} options
 * @param {number} options.limit Clamped limit (1-50)
 * @param {string|null} options.cursor Base64url cursor
 * @returns {Promise<Object[]>} Limit + 1 posts
 */
export const getFeedCandidates = async (authorIds, { limit = 20, cursor = null } = {}) => {
  const query = {
    author: { $in: authorIds },
    moderationStatus: 'ACTIVE', // Strictly active content only
  };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    query.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      {
        createdAt: decoded.createdAt,
        _id: { $lt: decoded.id },
      },
    ];
  }

  return Post.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('author', 'username fullName profilePicture isVerified')
    .lean();
};

/**
 * Bulk resolves interaction state (likes and saves) for a page of posts.
 * Solves the N+1 query problem by executing two bulk $in lookups.
 *
 * Failure resilience: If Like or Save lookups fail, the error is logged and
 * empty fallback sets are returned, ensuring partial feed rendering succeeds.
 *
 * @param {string|mongoose.Types.ObjectId} currentUserId
 * @param {mongoose.Types.ObjectId[]} postIds
 * @returns {Promise<{ likedPostIdsSet: Set<string>, savedPostIdsSet: Set<string> }>}
 */
export const getInteractionState = async (currentUserId, postIds) => {
  if (!postIds || postIds.length === 0) {
    return { likedPostIdsSet: new Set(), savedPostIdsSet: new Set() };
  }

  try {
    const [userLikes, userSaves] = await Promise.all([
      Like.find({
        user: currentUserId,
        post: { $in: postIds },
      })
        .select('post')
        .lean(),
      Save.find({
        user: currentUserId,
        post: { $in: postIds },
      })
        .select('post')
        .lean(),
    ]);

    return {
      likedPostIdsSet: new Set(userLikes.map((l) => l.post.toString())),
      savedPostIdsSet: new Set(userSaves.map((s) => s.post.toString())),
    };
  } catch (err) {
    // Resilient fallback: Do not crash entire feed if interaction decorations fail
    logger.warn(`[FeedService] Failed to retrieve interaction state: ${err.message}`, {
      userId: currentUserId,
      error: err.stack,
    });
    return {
      likedPostIdsSet: new Set(),
      savedPostIdsSet: new Set(),
    };
  }
};

/**
 * Assembles the standardized feed API response payload.
 *
 * @param {Object[]} feedSlice
 * @param {Set<string>} likedPostIdsSet
 * @param {Set<string>} savedPostIdsSet
 * @param {number} parsedLimit
 * @param {boolean} hasNextPage
 * @returns {{ posts: Object[], pagination: { limit: number, nextCursor: string|null } }}
 */
export const buildFeedResponse = (feedSlice, likedPostIdsSet, savedPostIdsSet, parsedLimit, hasNextPage) => {
  const posts = feedSlice.map((post) => {
    const author = post.author || {
      _id: null,
      username: 'deleted_user',
      fullName: 'Former User',
      profilePicture: null,
      isVerified: false,
    };

    return {
      _id: post._id,
      caption: post.caption,
      media: (post.media || []).map(({ publicId, ...safeMedia }) => safeMedia),
      location: post.location,
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      isLiked: likedPostIdsSet.has(post._id.toString()),
      isSaved: savedPostIdsSet.has(post._id.toString()),
      author,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  });

  let nextCursor = null;
  if (hasNextPage && feedSlice.length > 0) {
    const lastItem = feedSlice[feedSlice.length - 1];
    nextCursor = encodeCursor({
      createdAt: lastItem.createdAt,
      id: lastItem._id,
    });
  }

  return {
    posts,
    pagination: {
      limit: parsedLimit,
      nextCursor,
    },
  };
};

/**
 * Generates the authenticated user's home feed with cursor-based pagination.
 *
 * @param {string} currentUserId Authenticated user ID
 * @param {Object} options { limit, cursor }
 * @param {Object} [metaOptions] Internal diagnostic/metrics options
 * @returns {Promise<{ posts: Object[], pagination: { limit: number, nextCursor: string|null }, metrics?: Object }>}
 */
export const getHomeFeed = async (currentUserId, { limit = 20, cursor = null } = {}, { returnMetrics = false } = {}) => {
  const startTime = Date.now();

  // 1. Validate and clamp limit (default: 20, max: 50)
  const rawLimit = parseInt(limit, 10);
  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }
  const parsedLimit = Math.min(50, rawLimit);

  // 2. Resolve relationships in parallel
  const [followedIds, allBlockedIds] = await Promise.all([
    getFollowedUserIds(currentUserId),
    getBlockedUserIds(currentUserId),
  ]);

  // 3. Early filtering: Determine author candidates
  const authorIds = resolveFeedAuthorIds(currentUserId, followedIds, allBlockedIds);

  // 4. Retrieve candidate posts with +1 lookahead for pagination
  const rawPosts = await getFeedCandidates(authorIds, { limit: parsedLimit, cursor });
  const hasNextPage = rawPosts.length > parsedLimit;
  const feedSlice = hasNextPage ? rawPosts.slice(0, parsedLimit) : rawPosts;

  // 5. Bulk resolve interaction states (likes, saves)
  const postIds = feedSlice.map((p) => p._id);
  const { likedPostIdsSet, savedPostIdsSet } = await getInteractionState(currentUserId, postIds);

  // 6. Build API response format
  const result = buildFeedResponse(feedSlice, likedPostIdsSet, savedPostIdsSet, parsedLimit, hasNextPage);

  // 7. Internal observability metrics (development & diagnostic)
  const durationMs = Date.now() - startTime;
  const metrics = {
    queryDurationMs: durationMs,
    followedUsersCount: followedIds.length,
    blockedUsersCount: allBlockedIds.length,
    candidateAuthorsCount: authorIds.length,
    postsCandidateCount: rawPosts.length,
    postsReturnedCount: feedSlice.length,
    likesLookupCount: postIds.length,
    savesLookupCount: postIds.length,
  };

  if (process.env.NODE_ENV === 'development' || returnMetrics) {
    logger.debug(`[FeedService] getHomeFeed completed in ${durationMs}ms`, metrics);
  }

  if (returnMetrics) {
    result.metrics = metrics;
  }

  return result;
};

export default {
  encodeCursor,
  decodeCursor,
  getFollowedUserIds,
  getBlockedUserIds,
  resolveFeedAuthorIds,
  getFeedCandidates,
  getInteractionState,
  buildFeedResponse,
  getHomeFeed,
};
