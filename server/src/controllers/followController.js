import {
  followUser,
  unfollowUser,
  getFollowStatus,
  getFollowers,
  getFollowing,
} from '../services/followService.js';

/**
 * POST /api/users/:username/follow
 * Follows a user. Protected endpoint.
 */
export const follow = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await followUser(req.user.userId, req.params.username, context);

    res.status(200).json({
      success: true,
      message: `You are now following @${result.targetUser.username}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:username/follow
 * Unfollows a user. Protected endpoint.
 */
export const unfollow = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await unfollowUser(req.user.userId, req.params.username, context);

    res.status(200).json({
      success: true,
      message: `You unfollowed @${result.targetUser.username}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username/follow-status
 * Checks relationship status. Protected endpoint.
 */
export const getStatus = async (req, res, next) => {
  try {
    const status = await getFollowStatus(req.user.userId, req.params.username);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username/followers
 * Retrieves paginated followers list. Public endpoint.
 */
export const getFollowersList = async (req, res, next) => {
  try {
    const result = await getFollowers(req.params.username, req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username/following
 * Retrieves paginated following list. Public endpoint.
 */
export const getFollowingList = async (req, res, next) => {
  try {
    const result = await getFollowing(req.params.username, req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
