import Post from '../models/Post.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Save from '../models/Save.js';
import Notification from '../models/Notification.js';
import mediaService from './mediaService.js';
import notificationService from './notificationService.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';
import auditService from './auditService.js';

/**
 * Creates a new post with real image upload pipeline.
 * Author identity is derived strictly from verified JWT (currentUserId).
 *
 * Flow:
 * 1. Validate fields & content rules (caption OR media).
 * 2. Enforce max 10 images limit.
 * 3. Upload images via mediaService.
 * 4. Handle partial upload failure (rollback previously uploaded items).
 * 5. Persist Post to MongoDB.
 * 6. Handle MongoDB failure (rollback all uploaded Cloudinary assets).
 *
 * @param {string} authorId Authenticated user's ObjectId
 * @param {Object} postData { caption, location }
 * @param {Array<Express.Multer.File>} [files] Uploaded files from Multer
 * @returns {Promise<Object>} Created post populated with author
 */
export const createPost = async (authorId, postData = {}, files = [], context = {}) => {
  const { caption = '', location = '' } = postData || {};
  const fileList = Array.isArray(files) ? files : [];

  const trimmedCaption = typeof caption === 'string' ? caption.trim() : '';
  const trimmedLocation = typeof location === 'string' ? location.trim() : '';

  // 1. Content validation: Post must have either caption or media
  if (!trimmedCaption && fileList.length === 0) {
    throw ApiError.badRequest(
      'A post must contain either a text caption or at least one image'
    );
  }

  // 2. Image count validation
  if (fileList.length > 10) {
    throw ApiError.badRequest('A post cannot contain more than 10 images');
  }

  // 3. Caption length validation
  if (trimmedCaption.length > 2200) {
    throw ApiError.badRequest('Caption cannot exceed 2200 characters');
  }

  // 4. Location length validation
  if (trimmedLocation.length > 100) {
    throw ApiError.badRequest('Location cannot exceed 100 characters');
  }

  // 5. Upload images to Cloudinary via mediaService
  const uploadedMedia = [];

  try {
    for (const file of fileList) {
      const uploadedItem = await mediaService.uploadImage(file.buffer);
      uploadedMedia.push(uploadedItem);
    }
  } catch (uploadError) {
    // Failure Scenario 12: Partial Cloudinary failure.
    // Clean up any images that were successfully uploaded before the failure.
    if (uploadedMedia.length > 0) {
      const publicIds = uploadedMedia.map((m) => m.publicId);
      await mediaService.deleteMultipleImages(publicIds);
    }
    throw uploadError;
  }

  // 6. Persist Post to MongoDB
  try {
    const post = await Post.create({
      author: authorId,
      caption: trimmedCaption,
      media: uploadedMedia,
      location: trimmedLocation,
    });

    await post.populate('author', 'username fullName profilePicture isVerified');

    await auditService.createAuditLog({
      actor: authorId,
      action: 'POST_CREATED',
      targetType: 'POST',
      targetId: post._id,
      metadata: {
        hasCaption: Boolean(post.caption),
        captionLength: (post.caption || '').length,
        mediaCount: (post.media || []).length,
      },
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    });

    return post;
  } catch (mongoError) {
    // Failure Scenario 11: MongoDB creation failed after Cloudinary upload.
    // Clean up all newly uploaded Cloudinary assets to prevent orphaned media.
    if (uploadedMedia.length > 0) {
      const publicIds = uploadedMedia.map((m) => m.publicId);
      await mediaService.deleteMultipleImages(publicIds);
    }
    throw mongoError;
  }
};

/**
 * Retrieves a single post by ID.
 *
 * @param {string} postId
 * @returns {Promise<Object>}
 */
export const getPostById = async (postId, currentUserId = null) => {
  const post = await Post.findById(postId).populate(
    'author',
    'username fullName profilePicture isVerified'
  );

  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Moderation: hidden/removed posts are inaccessible to normal users
  if (post.moderationStatus && post.moderationStatus !== 'ACTIVE') {
    throw ApiError.notFound('Post not found');
  }

  if (currentUserId && post.author) {
    const authorId = post.author._id || post.author;
    const isBlocked = await blockService.areUsersBlocked(currentUserId, authorId);
    if (isBlocked) {
      throw ApiError.notFound('Post not found');
    }
  }

  return post;
};

/**
 * Retrieves all posts created by a specific user (paginated).
 *
 * @param {string} username Target user handle
 * @param {Object} paginationOptions
 * @returns {Promise<Object>}
 */
export const getUserPosts = async (username, { page = 1, limit = 12 } = {}, currentUserId = null) => {
  const normalizedUsername = username.trim().toLowerCase();
  const user = await User.findOne({ username: normalizedUsername });

  if (!user) {
    throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
  }

  if (currentUserId) {
    const isBlocked = await blockService.areUsersBlocked(currentUserId, user._id);
    if (isBlocked) {
      throw ApiError.notFound(`User '@${normalizedUsername}' not found`);
    }
  }

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (parsedPage - 1) * parsedLimit;

  const [posts, total] = await Promise.all([
    Post.find({ author: user._id, moderationStatus: 'ACTIVE' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('author', 'username fullName profilePicture isVerified')
      .lean(),
    Post.countDocuments({ author: user._id, moderationStatus: 'ACTIVE' }),
  ]);

  return {
    posts,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

/**
 * Updates a post's caption and/or location.
 * Only the post's author is authorized to update it.
 *
 * @param {string} postId
 * @param {string} currentUserId Authenticated user ID
 * @param {Object} updateData { caption, location }
 * @returns {Promise<Object>}
 */
export const updatePost = async (postId, currentUserId, updateData, context = {}) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Authorization check: Only the post author can update the post
  if (post.author.toString() !== currentUserId.toString()) {
    throw ApiError.forbidden('You are not authorized to edit this post');
  }

  const allowedFields = ['caption', 'location'];
  const fieldsReceived = Object.keys(updateData || {}).filter((k) =>
    allowedFields.includes(k)
  );

  if (fieldsReceived.length === 0) {
    throw ApiError.badRequest(
      'No valid fields provided for update. Allowed fields: caption, location'
    );
  }

  if (updateData.caption !== undefined) {
    if (typeof updateData.caption !== 'string') {
      throw ApiError.badRequest('Caption must be a string');
    }
    const trimmedCaption = updateData.caption.trim();
    if (trimmedCaption.length > 2200) {
      throw ApiError.badRequest('Caption cannot exceed 2200 characters');
    }

    // Ensure update doesn't leave post completely empty
    if (!trimmedCaption && (!post.media || post.media.length === 0)) {
      throw ApiError.badRequest(
        'Cannot remove caption from a post that has no media'
      );
    }
    post.caption = trimmedCaption;
  }

  if (updateData.location !== undefined) {
    if (typeof updateData.location !== 'string') {
      throw ApiError.badRequest('Location must be a string');
    }
    const trimmedLocation = updateData.location.trim();
    if (trimmedLocation.length > 100) {
      throw ApiError.badRequest('Location cannot exceed 100 characters');
    }
    post.location = trimmedLocation;
  }

  await post.save();
  await post.populate('author', 'username fullName profilePicture isVerified');

  await auditService.createAuditLog({
    actor: currentUserId,
    action: 'POST_UPDATED',
    targetType: 'POST',
    targetId: post._id,
    metadata: {
      updatedFields: fieldsReceived,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return post;
};

/**
 * Deletes a post from MongoDB and cleans up associated Cloudinary assets.
 * Only the post's author is authorized to delete it.
 *
 * Consistency trade-off:
 * Post is deleted from MongoDB first so it is immediately removed from the social network.
 * Then Cloudinary assets are deleted. If external deletion fails, we log the orphaned
 * assets for asynchronous garbage collection, rather than restoring the post.
 *
 * @param {string} postId
 * @param {string} currentUserId Authenticated user ID
 * @param {Object} [context]
 * @returns {Promise<{ message: string, postId: string }>}
 */
export const deletePost = async (postId, currentUserId, context = {}) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Authorization check: Only the author can delete
  if (post.author.toString() !== currentUserId.toString()) {
    throw ApiError.forbidden('You are not authorized to delete this post');
  }

  // Collect publicIds of media before deleting from DB
  const publicIds = (post.media || [])
    .map((item) => item.publicId)
    .filter(Boolean);

  // Delete Post document from MongoDB
  await post.deleteOne();

  // Cascade delete all comments and replies associated with the post
  await Comment.deleteMany({ post: postId });

  // Cascade delete all likes associated with the post
  await Like.deleteMany({ post: postId });

  // Cascade delete all saves associated with the post
  await Save.deleteMany({ post: postId });

  // Cascade delete all notifications referencing the deleted post
  await Notification.deleteMany({ post: postId });

  // Clean up media assets from Cloudinary
  if (publicIds.length > 0) {
    try {
      const cleanupResult = await mediaService.deleteMultipleImages(publicIds);
      if (cleanupResult.failed && cleanupResult.failed.length > 0) {
        console.warn(
          `[postService] Note: Failed to delete some Cloudinary assets for post ${postId}:`,
          cleanupResult.failed
        );
      }
    } catch (cleanupError) {
      console.error(
        `[postService] Error during Cloudinary media cleanup for post ${postId}:`,
        cleanupError.message
      );
    }
  }

  await auditService.createAuditLog({
    actor: currentUserId,
    action: 'POST_DELETED',
    targetType: 'POST',
    targetId: postId,
    metadata: {
      mediaCount: publicIds.length,
    },
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
    requestId: context.requestId,
  });

  return {
    message: 'Post deleted successfully',
    postId,
  };
};

/**
 * Toggles like status for a post.
 *
 * @param {string} postId
 * @param {string} currentUserId
 * @returns {Promise<{ liked: boolean }>}
 */
export const toggleLikePost = async (postId, currentUserId) => {
  const post = await Post.findById(postId);
  if (!post) {
    throw ApiError.notFound('Post not found');
  }

  // Prevent liking posts if either user has blocked the other
  await blockService.assertUsersNotBlocked(currentUserId, post.author);

  const existing = await Like.findOne({ user: currentUserId, post: postId });
  if (existing) {
    await existing.deleteOne();
    await Post.updateOne({ _id: postId, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });
    return { liked: false };
  } else {
    try {
      await Like.create({ user: currentUserId, post: postId });
      await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });
      await notificationService.createLikeNotification(currentUserId, post);
      return { liked: true };
    } catch (err) {
      if (err.code === 11000) {
        // Concurrent duplicate like safely resolved as already liked
        return { liked: true };
      }
      throw err;
    }
  }
};

/**
 * Retrieves all posts in reverse chronological order (paginated).
 *
 * @param {Object} query Pagination query params (page, limit)
 * @returns {Promise<Object>}
 */
export const getAllPosts = async ({ page = 1, limit = 10 }) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (parsedPage - 1) * parsedLimit;

  // Only surface posts that have passed moderation — hidden/removed posts must
  // not be returned to the public feed (F-03).
  const filter = { moderationStatus: 'ACTIVE' };

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('author', 'username fullName profilePicture isVerified')
      .lean(),
    Post.countDocuments(filter),
  ]);

  return {
    posts,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

export default {
  createPost,
  getPostById,
  getUserPosts,
  updatePost,
  deletePost,
  toggleLikePost,
  getAllPosts,
};
