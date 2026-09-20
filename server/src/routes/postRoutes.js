import { Router } from 'express';
import {
  create,
  getById,
  getAll,
  update,
  remove,
  toggleLike,
} from '../controllers/postController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { requireActiveAccount } from '../middleware/accountStatusMiddleware.js';
import { uploadPostMedia } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createPostSchema,
  updatePostSchema,
  postIdParamSchema,
  postQuerySchema,
} from '../validations/postValidation.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// POST /api/posts — Create new post with multipart image uploads (Protected)
router.post(
  '/',
  authenticate,
  requireActiveAccount,  // Suspended users cannot create posts
  uploadLimiter,
  uploadPostMedia,
  validate({ body: createPostSchema }),
  create
);

// GET /api/posts — Paginated public posts feed (Public)
router.get('/', validate({ query: postQuerySchema }), getAll);

// GET /api/posts/:id — Get post by ID (Public with optional auth)
router.get('/:id', optionalAuthenticate, validate({ params: postIdParamSchema }), getById);

// PATCH /api/posts/:id — Edit post (Protected, Owner only)
router.patch(
  '/:id',
  authenticate,
  validate({ params: postIdParamSchema, body: updatePostSchema }),
  update
);

// DELETE /api/posts/:id — Delete post (Protected, Owner only)
router.delete('/:id', authenticate, validate({ params: postIdParamSchema }), remove);

// POST /api/posts/:id/like — Toggle like on post (Protected)
router.post('/:id/like', authenticate, validate({ params: postIdParamSchema }), toggleLike);

export default router;
