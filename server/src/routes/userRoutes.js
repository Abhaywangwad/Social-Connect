import { Router } from 'express';
import {
  testUserRoute,
  getMyProfile,
  updateMyProfile,
  getUserProfile,
} from '../controllers/userController.js';
import { searchUsers } from '../controllers/searchController.js';
import { getByUser } from '../controllers/postController.js';
import {
  blockUser,
  unblockUser,
  getBlockStatus,
  getBlockedUsers,
} from '../controllers/blockController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, usernameParamSchema } from '../validations/userValidation.js';
import { userSearchQuerySchema } from '../validations/searchValidation.js';
import { searchLimiter } from '../middleware/rateLimiter.js';
import followRoutes from './followRoutes.js';

const router = Router();

// GET /api/users/test — Connectivity check (Public)
router.get('/test', testUserRoute);

// ─── User Search (Protected) ──────────────────────────────────────────────────
// IMPORTANT: /search must be defined BEFORE /:username so Express does not
// capture "search" as a dynamic username parameter.
router.get(
  '/search',
  authenticate,
  searchLimiter,
  validate({ query: userSearchQuerySchema }),
  searchUsers
);

// ─── Current User Profile & Blocked List (Protected) ──────────────────────────
// IMPORTANT: /me must be defined BEFORE /:username so Express does not
// interpret "me" as a dynamic username parameter.
router.get('/me/blocked', authenticate, getBlockedUsers);
router.get('/me', authenticate, getMyProfile);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), updateMyProfile);

// ─── User Blocking Routes (Protected) ─────────────────────────────────────────
router.post(
  '/:username/block',
  authenticate,
  validate({ params: usernameParamSchema }),
  blockUser
);
router.delete(
  '/:username/block',
  authenticate,
  validate({ params: usernameParamSchema }),
  unblockUser
);
router.get(
  '/:username/block-status',
  authenticate,
  validate({ params: usernameParamSchema }),
  getBlockStatus
);

// ─── Follow & Social Graph Routes ─────────────────────────────────────────────
// Mounts /:username/follow, /:username/follow-status, /:username/followers, /:username/following
router.use('/:username', followRoutes);

// ─── User Profile Posts (Public Grid) ─────────────────────────────────────────
router.get(
  '/:username/posts',
  optionalAuthenticate,
  validate({ params: usernameParamSchema }),
  getByUser
);

// ─── Public User Profile (Public) ─────────────────────────────────────────────
router.get(
  '/:username',
  optionalAuthenticate,
  validate({ params: usernameParamSchema }),
  getUserProfile
);

export default router;
