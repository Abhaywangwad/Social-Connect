import { Router } from 'express';
import {
  createComment,
  createReply,
  getPostComments,
  getCommentReplies,
  updateComment,
  deleteComment,
} from '../controllers/commentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireActiveAccount } from '../middleware/accountStatusMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createCommentSchema,
  commentIdParamSchema,
  postCommentParamsSchema,
  commentQuerySchema,
} from '../validations/commentValidation.js';

const router = Router();

// ─── Post Comment Endpoints ───────────────────────────────────────────────────

// POST /api/posts/:postId/comments — Create top-level comment (Protected)
router.post(
  '/posts/:postId/comments',
  authenticate,
  requireActiveAccount,  // Suspended users cannot comment
  validate({ params: postCommentParamsSchema, body: createCommentSchema }),
  createComment
);

// GET /api/posts/:postId/comments — Get paginated top-level comments (Public)
router.get(
  '/posts/:postId/comments',
  validate({ params: postCommentParamsSchema, query: commentQuerySchema }),
  getPostComments
);

// ─── Comment Replies & Management Endpoints ────────────────────────────────────

// POST /api/comments/:commentId/replies — Create reply to top-level comment (Protected)
router.post(
  '/comments/:commentId/replies',
  authenticate,
  requireActiveAccount,  // Suspended users cannot reply
  validate({ params: commentIdParamSchema, body: createCommentSchema }),
  createReply
);

// GET /api/comments/:commentId/replies — Get paginated replies to a comment (Public)
router.get(
  '/comments/:commentId/replies',
  validate({ params: commentIdParamSchema, query: commentQuerySchema }),
  getCommentReplies
);

// PATCH /api/comments/:commentId — Edit own comment (Protected, Author only)
router.patch(
  '/comments/:commentId',
  authenticate,
  validate({ params: commentIdParamSchema, body: createCommentSchema }),
  updateComment
);

// DELETE /api/comments/:commentId — Delete comment (Protected, Author OR Post owner)
router.delete(
  '/comments/:commentId',
  authenticate,
  validate({ params: commentIdParamSchema }),
  deleteComment
);

export default router;
