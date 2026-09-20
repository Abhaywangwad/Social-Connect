import {
  getCurrentUserProfile,
  getUserByUsername,
  updateCurrentUserProfile,
} from '../services/userService.js';
import blockService from '../services/blockService.js';
import { verifyToken } from '../utils/jwt.js';
import ApiError from '../utils/ApiError.js';

/**
 * GET /api/users/test
 * Confirms user route is reachable.
 */
export const testUserRoute = (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'User route is connected',
  });
};

/**
 * GET /api/users/me
 * Retrieves the currently authenticated user's profile.
 * Protected endpoint.
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const user = await getCurrentUserProfile(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Profile fetched successfully',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:username
 * Retrieves another user's public profile by username.
 * Public endpoint.
 */
export const getUserProfile = async (req, res, next) => {
  try {
    const user = await getUserByUsername(req.params.username);

    // If requester is authenticated, ensure neither user has blocked the other
    if (req.user?.userId) {
      const targetUserId = user._id || user.id;
      const isBlocked = await blockService.areUsersBlocked(req.user.userId, targetUserId);
      if (isBlocked) {
        throw ApiError.notFound('User not found');
      }
    }

    res.status(200).json({
      success: true,
      message: 'User profile fetched successfully',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/users/me
 * Updates the authenticated user's profile fields.
 * Protected endpoint.
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const user = await updateCurrentUserProfile(req.user.userId, req.body);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
};
