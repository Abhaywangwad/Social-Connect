import saveService from '../services/saveService.js';

/**
 * POST /api/posts/:postId/save
 * Saves a post for the authenticated user. Protected.
 */
export const savePost = async (req, res, next) => {
  try {
    const result = await saveService.savePost(
      req.params.postId,
      req.user.userId
    );

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        isSaved: result.isSaved,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/posts/:postId/save
 * Unsaves a post for the authenticated user. Protected.
 */
export const unsavePost = async (req, res, next) => {
  try {
    const result = await saveService.unsavePost(
      req.params.postId,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        isSaved: result.isSaved,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/posts/:postId/save-status
 * Checks if a post is saved by the authenticated user. Protected.
 */
export const getSaveStatus = async (req, res, next) => {
  try {
    const result = await saveService.isPostSaved(
      req.params.postId,
      req.user.userId
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
 * GET /api/users/me/saved-posts
 * Retrieves the authenticated user's saved posts. Protected (Private).
 */
export const getSavedPosts = async (req, res, next) => {
  try {
    const result = await saveService.getSavedPosts(
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  savePost,
  unsavePost,
  getSaveStatus,
  getSavedPosts,
};
