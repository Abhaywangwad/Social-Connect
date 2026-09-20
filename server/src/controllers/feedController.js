import feedService from '../services/feedService.js';

/**
 * GET /api/feed
 * Retrieves the authenticated user's home feed with cursor-based pagination.
 */
export const getFeed = async (req, res, next) => {
  try {
    const result = await feedService.getHomeFeed(req.user.userId, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getFeed,
};
