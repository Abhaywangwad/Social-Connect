import {
  createPost,
  getPostById,
  getUserPosts,
  updatePost,
  deletePost,
  getAllPosts,
  toggleLikePost,
} from '../services/postService.js';

/**
 * POST /api/posts
 * Creates a new post. Protected endpoint.
 */
export const create = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const post = await createPost(req.user.userId, req.body, req.files, context);

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: {
        post,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/posts/:id
 * Retrieves a single post by ID. Public endpoint.
 */
export const getById = async (req, res, next) => {
  try {
    const post = await getPostById(req.params.id, req.user?.userId || null);

    res.status(200).json({
      success: true,
      data: {
        post,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/posts
 * Retrieves paginated public feed. Public endpoint.
 */
export const getAll = async (req, res, next) => {
  try {
    const result = await getAllPosts(req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username/posts
 * Retrieves all posts by a specific user (profile grid). Public endpoint.
 */
export const getByUser = async (req, res, next) => {
  try {
    const result = await getUserPosts(
      req.params.username,
      req.query,
      req.user?.userId || null
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/posts/:id
 * Updates caption/location of a post. Protected endpoint (Owner only).
 */
export const update = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const post = await updatePost(req.params.id, req.user.userId, req.body, context);

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      data: {
        post,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/posts/:id
 * Deletes a post. Protected endpoint (Owner only).
 */
export const remove = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await deletePost(req.params.id, req.user.userId, context);

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        postId: result.postId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/posts/:id/like
 * Toggles like on a post. Protected.
 */
export const toggleLike = async (req, res, next) => {
  try {
    const result = await toggleLikePost(req.params.id, req.user.userId);

    res.status(200).json({
      success: true,
      message: result.liked ? 'Post liked successfully' : 'Post unliked successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
