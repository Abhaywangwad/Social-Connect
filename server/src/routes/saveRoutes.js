import { Router } from 'express';
import {
  savePost,
  unsavePost,
  getSaveStatus,
  getSavedPosts,
} from '../controllers/saveController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { savePostParamsSchema, saveQuerySchema } from '../validations/saveValidation.js';

const router = Router();

// POST /api/posts/:postId/save — Save a post (Protected)
router.post('/posts/:postId/save', authenticate, validate({ params: savePostParamsSchema }), savePost);

// DELETE /api/posts/:postId/save — Unsave a post (Protected)
router.delete('/posts/:postId/save', authenticate, validate({ params: savePostParamsSchema }), unsavePost);

// GET /api/posts/:postId/save-status — Check save status (Protected)
router.get('/posts/:postId/save-status', authenticate, validate({ params: savePostParamsSchema }), getSaveStatus);

// GET /api/users/me/saved-posts — Get current user's saved posts (Protected)
router.get('/users/me/saved-posts', authenticate, validate({ query: saveQuerySchema }), getSavedPosts);

export default router;
