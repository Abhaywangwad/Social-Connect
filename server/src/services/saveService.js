import mongoose from 'mongoose';
import Save from '../models/Save.js';
import Post from '../models/Post.js';
import ApiError from '../utils/ApiError.js';

/**
 * Validates MongoDB ObjectId format.
 */
const validateObjectId = (id, resourceName = 'Post') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

/**
 * Saves a post for the authenticated user.
 * Enforces uniqueness at the database level.
 *
 * @param {string} postId
 * @param {string} currentUserId
 * @returns {Promise<{ message: string, isSaved: boolean }>}
 */
export const savePost = async (postId, currentUserId) => {
  validateObjectId(postId, 'Post');

  // Verify post exists
  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Check if already saved
  const existingSave = await Save.findOne({
    user: currentUserId,
    post: postId,
  });

  if (existingSave) {
    throw ApiError.conflict('Post is already saved');
  }

  try {
    await Save.create({
      user: currentUserId,
      post: postId,
    });

    return {
      message: 'Post saved successfully',
      isSaved: true,
    };
  } catch (error) {
    // Handle concurrent save duplicate key race condition
    if (error.code === 11000) {
      throw ApiError.conflict('Post is already saved');
    }
    throw error;
  }
};

/**
 * Unsaves a post for the authenticated user.
 *
 * @param {string} postId
 * @param {string} currentUserId
 * @returns {Promise<{ message: string, isSaved: boolean }>}
 */
export const unsavePost = async (postId, currentUserId) => {
  validateObjectId(postId, 'Post');

  const deleted = await Save.findOneAndDelete({
    user: currentUserId,
    post: postId,
  });

  if (!deleted) {
    return {
      message: 'Post was not saved',
      isSaved: false,
    };
  }

  return {
    message: 'Post unsaved successfully',
    isSaved: false,
  };
};

/**
 * Retrieves the save status of a post for the authenticated user.
 * Performs an indexed, targeted query.
 *
 * @param {string} postId
 * @param {string} currentUserId
 * @returns {Promise<{ isSaved: boolean }>}
 */
export const isPostSaved = async (postId, currentUserId) => {
  validateObjectId(postId, 'Post');

  const exists = await Save.exists({
    user: currentUserId,
    post: postId,
  });

  return {
    isSaved: Boolean(exists),
  };
};

/**
 * Retrieves the authenticated user's saved posts (paginated).
 * Ordered by when the post was SAVED (Save.createdAt DESC).
 *
 * @param {string} currentUserId
 * @param {Object} paginationOptions { page, limit }
 * @returns {Promise<{ posts: Object[], pagination: Object }>}
 */
export const getSavedPosts = async (currentUserId, { page = 1, limit = 20 } = {}) => {
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

  const [saves, totalSaves] = await Promise.all([
    Save.find({ user: currentUserId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate({
        path: 'post',
        populate: {
          path: 'author',
          select: 'username fullName profilePicture isVerified',
        },
      })
      .lean(),
    Save.countDocuments({ user: currentUserId }),
  ]);

  // Transform populated records, omitting sensitive fields
  const posts = saves
    .filter((s) => s.post !== null)
    .map((s) => {
      const p = s.post;
      const author = p.author || {
        _id: null,
        username: 'deleted_user',
        fullName: 'Former User',
        profilePicture: null,
        isVerified: false,
      };

      return {
        _id: p._id,
        caption: p.caption,
        media: (p.media || []).map(({ publicId, ...safeMedia }) => safeMedia),
        location: p.location,
        likesCount: p.likesCount || 0,
        commentsCount: p.commentsCount || 0,
        author,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        savedAt: s.createdAt,
      };
    });

  const totalPages = Math.ceil(totalSaves / parsedLimit);

  return {
    posts,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalPosts: totalSaves,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

export default {
  savePost,
  unsavePost,
  isPostSaved,
  getSavedPosts,
};
