import { Router } from 'express';
import { getFeed } from '../controllers/feedController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { feedQuerySchema } from '../validations/feedValidation.js';

const router = Router();

// GET /api/feed — Home feed with cursor-based pagination (Protected)
router.get('/', authenticate, validate({ query: feedQuerySchema }), getFeed);

export default router;
