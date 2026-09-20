import { Router } from 'express';
import { createReport } from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema } from '../validations/blockReportSessionValidation.js';
import { reportLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// POST /api/reports — Submit a moderation report (Protected)
router.post(
  '/',
  authenticate,
  reportLimiter,
  validate({ body: createReportSchema }),
  createReport
);

export default router;
