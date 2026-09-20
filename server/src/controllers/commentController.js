import commentService from '../services/commentService.js';

/**
 * POST /api/posts/:postId/comments
 * Creates a top-level comment on a post. Protected.
 */
export const createComment = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const comment = await commentService.createComment(
      req.params.postId,
      req.user.userId,
      req.body.content,
      context
    );

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: {
        comment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/comments/:commentId/replies
 * Creates a 1-level reply to a top-level comment. Protected.
 */
export const createReply = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const reply = await commentService.createReply(
      req.params.commentId,
      req.user.userId,
      req.body.content,
      context
    );

    res.status(201).json({
      success: true,
      message: 'Reply created successfully',
      data: {
        reply,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/posts/:postId/comments
 * Retrieves paginated top-level comments for a post. Public.
 */
export const getPostComments = async (req, res, next) => {
  try {
    const result = await commentService.getPostComments(
      req.params.postId,
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

/**
 * GET /api/comments/:commentId/replies
 * Retrieves paginated replies for a specific top-level comment. Public.
 */
export const getCommentReplies = async (req, res, next) => {
  try {
    const result = await commentService.getCommentReplies(
      req.params.commentId,
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

/**
 * PATCH /api/comments/:commentId
 * Updates the content of a comment. Protected (Author only).
 */
export const updateComment = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const comment = await commentService.updateComment(
      req.params.commentId,
      req.user.userId,
      req.body.content,
      context
    );

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      data: {
        comment,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/comments/:commentId
 * Deletes a comment. Protected (Comment author OR Post owner).
 */
export const deleteComment = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await commentService.deleteComment(
      req.params.commentId,
      req.user.userId,
      context
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        commentId: result.commentId,
        deletedCount: result.deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createComment,
  createReply,
  getPostComments,
  getCommentReplies,
  updateComment,
  deleteComment,
};
