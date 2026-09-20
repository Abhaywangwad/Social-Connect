import { Router } from 'express';
import {
  follow,
  unfollow,
  getStatus,
  getFollowersList,
  getFollowingList,
} from '../controllers/followController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  followUsernameParamSchema,
  followQuerySchema,
} from '../validations/followValidation.js';

// Router with mergeParams allows access to :username defined in parent route
const router = Router({ mergeParams: true });

// POST /api/users/:username/follow — Follow user (Protected)
router.post('/follow', authenticate, validate({ params: followUsernameParamSchema }), follow);

// DELETE /api/users/:username/follow — Unfollow user (Protected)
router.delete('/follow', authenticate, validate({ params: followUsernameParamSchema }), unfollow);

// GET /api/users/:username/follow-status — Check relationship status (Protected)
router.get('/follow-status', authenticate, validate({ params: followUsernameParamSchema }), getStatus);

// GET /api/users/:username/followers — Paginated followers list (Public)
router.get(
  '/followers',
  validate({ params: followUsernameParamSchema, query: followQuerySchema }),
  getFollowersList
);

// GET /api/users/:username/following — Paginated following list (Public)
router.get(
  '/following',
  validate({ params: followUsernameParamSchema, query: followQuerySchema }),
  getFollowingList
);

export default router;
