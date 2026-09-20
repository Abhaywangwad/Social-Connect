import searchService from '../services/searchService.js';

/**
 * GET /api/users/search
 * Searches for users by username prefix and full name.
 * Protected endpoint — requires authentication.
 */
export const searchUsers = async (req, res, next) => {
  try {
    const result = await searchService.searchUsers(
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  searchUsers,
};
