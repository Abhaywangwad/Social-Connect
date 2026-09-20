import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireActiveAccount } from '../middleware/accountStatusMiddleware.js';
import { uploadStoryMedia } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createStorySchema, storyIdParamSchema } from '../validations/storyValidation.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import {
  createStory,
  getActiveStories,
  getStoryById,
  deleteStory,
} from '../controllers/storyController.js';

const router = Router();

// All Story routes require authentication
router.use(authenticate);

// Create a new story (multipart/form-data with single 'media' image)
router.post(
  '/',
  requireActiveAccount,  // Suspended users cannot post stories
  uploadLimiter,
  uploadStoryMedia,
  validate({ body: createStorySchema }),
  createStory
);

// Get active stories for current user and followed users
router.get('/', getActiveStories);

// Single story operations
router.get('/:storyId', validate({ params: storyIdParamSchema }), getStoryById);
router.delete('/:storyId', validate({ params: storyIdParamSchema }), deleteStory);

export default router;
