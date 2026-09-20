import mongoose from 'mongoose';
import Story from '../models/Story.js';
import Follow from '../models/Follow.js';
import mediaService from './mediaService.js';
import { encodeCursor, decodeCursor } from './feedService.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Validates MongoDB ObjectId format.
 */
const validateObjectId = (id, resourceName = 'Story') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

/**
 * Formats a story document into a safe JSON representation.
 * Omits private or internal fields.
 */
const formatStory = (story) => {
  const author = story.author || {};
  return {
    id: story._id,
    media: {
      type: story.media?.type || 'image',
      url: story.media?.url,
      width: story.media?.width,
      height: story.media?.height,
    },
    caption: story.caption || '',
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    author: {
      id: author._id || author.id,
      username: author.username,
      fullName: author.fullName,
      profilePicture: author.profilePicture || null,
      isVerified: Boolean(author.isVerified),
    },
  };
};

/**
 * Creates a new ephemeral Story for the authenticated user.
 *
 * @param {string} authorId Authenticated user ID (from JWT)
 * @param {Object} storyData { caption }
 * @param {Express.Multer.File} file Uploaded image file
 * @returns {Promise<Object>} Created story
 */
export const createStory = async (authorId, storyData = {}, file) => {
  // 1. Media validation
  if (!file || !file.buffer) {
    throw ApiError.badRequest('Story media image is required');
  }

  // 2. Caption length validation
  const { caption = '' } = storyData || {};
  const trimmedCaption = typeof caption === 'string' ? caption.trim() : '';
  if (trimmedCaption.length > 500) {
    throw ApiError.badRequest('Caption cannot exceed 500 characters');
  }

  // 3. Upload image via mediaService to Cloudinary
  const uploadedMedia = await mediaService.uploadImage(file.buffer, {
    folder: 'social-connect/stories',
  });

  // 4. Server-enforced expiration: 24 hours from creation
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // 5. Persist Story to MongoDB with rollback protection
  try {
    const story = await Story.create({
      author: authorId,
      media: uploadedMedia,
      caption: trimmedCaption,
      expiresAt,
    });

    await story.populate('author', 'username fullName profilePicture isVerified');

    return formatStory(story);
  } catch (dbError) {
    // If database insertion fails, roll back uploaded Cloudinary asset
    if (uploadedMedia?.publicId) {
      try {
        await mediaService.deleteImage(uploadedMedia.publicId);
      } catch (rollbackError) {
        console.error(
          '[storyService] Failed to clean up Cloudinary asset on DB error:',
          rollbackError.message
        );
      }
    }
    throw dbError;
  }
};

/**
 * Retrieves visible active stories for the authenticated user.
 * Returns stories created by the user and users they follow.
 *
 * @param {string} currentUserId Authenticated user ID
 * @param {Object} options { limit, cursor }
 * @returns {Promise<{ stories: Array<Object>, pagination: Object }>}
 */
export const getActiveStories = async (
  currentUserId,
  { limit = 20, cursor } = {}
) => {
  // 1. Determine visible authors: current user + followed users (excluding blocked)
  const [followDocs, blockedUserIds] = await Promise.all([
    Follow.find({ follower: currentUserId }).select('following').lean(),
    blockService.getBlockedUserIds(currentUserId),
  ]);

  const blockedSet = new Set(blockedUserIds.map((id) => id.toString()));
  const followingIds = followDocs
    .map((f) => f.following)
    .filter((id) => !blockedSet.has(id.toString()));
  const visibleAuthorIds = [currentUserId, ...followingIds];

  // 2. Parse and cap limit (default 20, max 50)
  const rawLimit = parseInt(limit, 10);
  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }
  const parsedLimit = Math.min(50, rawLimit);

  // 3. Build query filter
  // Dual condition: moderationStatus ACTIVE AND expiresAt > now
  // A REMOVED story must not become visible before the TTL background thread
  // physically deletes the document.
  const now = new Date();
  const filter = {
    author: { $in: visibleAuthorIds },
    expiresAt: { $gt: now },
    moderationStatus: 'ACTIVE',
  };

  if (cursor) {
    const decoded = decodeCursor(cursor);
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      {
        createdAt: decoded.createdAt,
        _id: { $lt: decoded.id },
      },
    ];
  }

  // 4. Fetch stories sorted newest first
  const stories = await Story.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(parsedLimit + 1)
    .populate('author', 'username fullName profilePicture isVerified')
    .lean();

  const hasMore = stories.length > parsedLimit;
  const resultStories = hasMore ? stories.slice(0, parsedLimit) : stories;

  const nextCursor =
    hasMore && resultStories.length > 0
      ? encodeCursor({
          createdAt: resultStories[resultStories.length - 1].createdAt,
          id: resultStories[resultStories.length - 1]._id,
        })
      : null;

  return {
    stories: resultStories.map(formatStory),
    pagination: {
      limit: parsedLimit,
      nextCursor,
    },
  };
};

/**
 * Retrieves a single active story by ID.
 * Respects follow-based visibility rules for private accounts.
 *
 * @param {string} storyId Story ObjectId
 * @param {string} currentUserId Authenticated user ID
 * @returns {Promise<Object>} Formatted story
 */
export const getStoryById = async (storyId, currentUserId) => {
  validateObjectId(storyId, 'Story');

  const story = await Story.findById(storyId).populate(
    'author',
    'username fullName profilePicture isVerified isPrivate'
  );

  // Expired or non-existent stories return 404
  if (!story || story.expiresAt <= new Date()) {
    throw ApiError.notFound('Story not found');
  }

  // Moderation: hidden/removed stories are inaccessible to normal users
  if (story.moderationStatus && story.moderationStatus !== 'ACTIVE') {
    throw ApiError.notFound('Story not found');
  }

  // Check bilateral blocking (return 404 to avoid leaking existence)
  const isBlocked = await blockService.areUsersBlocked(currentUserId, story.author._id);
  if (isBlocked) {
    throw ApiError.notFound('Story not found');
  }

  // Check visibility authorization
  const isAuthor = story.author._id.toString() === currentUserId.toString();
  if (!isAuthor) {
    const isFollowing = await Follow.exists({
      follower: currentUserId,
      following: story.author._id,
    });

    if (story.author.isPrivate && !isFollowing) {
      throw ApiError.notFound('Story not found');
    }
  }

  return formatStory(story);
};

/**
 * Deletes a story. Only the author is authorized.
 * Removes the document from MongoDB and cleans up the Cloudinary asset.
 *
 * @param {string} storyId Story ObjectId
 * @param {string} currentUserId Authenticated user ID
 * @returns {Promise<{ message: string, storyId: string }>}
 */
export const deleteStory = async (storyId, currentUserId) => {
  validateObjectId(storyId, 'Story');

  const story = await Story.findById(storyId);
  if (!story) {
    throw ApiError.notFound('Story not found');
  }

  // Authorization: Only the author may delete
  if (story.author.toString() !== currentUserId.toString()) {
    throw ApiError.forbidden('You are not authorized to delete this story');
  }

  const publicId = story.media?.publicId;

  // Delete from MongoDB first (guarantees immediate removal from social graph)
  await story.deleteOne();

  // Clean up external Cloudinary asset
  if (publicId) {
    try {
      await mediaService.deleteImage(publicId);
    } catch (cleanupError) {
      console.warn(
        `[storyService] Failed to delete Cloudinary asset for story ${storyId}:`,
        cleanupError.message
      );
    }
  }

  return {
    message: 'Story deleted successfully',
    storyId,
  };
};

export default {
  createStory,
  getActiveStories,
  getStoryById,
  deleteStory,
};
