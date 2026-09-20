import blockService from '../services/blockService.js';

/**
 * POST /api/users/:username/block
 * Blocks the target user.
 */
export const blockUser = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await blockService.blockUser(req.user.userId, req.params.username, context);
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        blockedUser: result.blockedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:username/block
 * Unblocks the target user.
 */
export const unblockUser = async (req, res, next) => {
  try {
    const context = {
      requestId: req.id,
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    };
    const result = await blockService.unblockUser(req.user.userId, req.params.username, context);
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username/block-status
 * Retrieves bilateral block status for target user.
 */
export const getBlockStatus = async (req, res, next) => {
  try {
    const status = await blockService.getBlockStatus(req.user.userId, req.params.username);
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/me/blocked
 * Retrieves paginated list of users blocked by authenticated user.
 */
export const getBlockedUsers = async (req, res, next) => {
  try {
    const result = await blockService.getBlockedUsers(req.user.userId, req.query);
    res.status(200).json({
      success: true,
      message: 'Blocked users fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  blockUser,
  unblockUser,
  getBlockStatus,
  getBlockedUsers,
};
