import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { adminLimiter } from '../middleware/rateLimiter.js';
import {
  listReports,
  getReport,
  updateReportStatus,
} from '../controllers/adminReportController.js';
import {
  listUsers,
  updateUserStatus,
} from '../controllers/adminUserController.js';
import {
  moderatePost,
  moderateComment,
  moderateStory,
} from '../controllers/adminModerationController.js';
import adminAuditRoutes from './adminAuditRoutes.js';

const router = Router();

/**
 * Admin Routes — /api/admin/*
 *
 * Authorization chain: adminLimiter → authenticate → requireAdmin
 *
 * - adminLimiter   : 100 req / 15 min per IP (prevents scripted enumeration)
 * - authenticate   : Verifies JWT access token, attaches req.user.userId
 * - requireAdmin   : Performs DB lookup to confirm role=ADMIN and ACTIVE accountStatus
 *
 * All routes in this module implicitly require admin authorization.
 * Never trust X-Admin headers or client-supplied role claims.
 */
router.use(adminLimiter, authenticate, requireAdmin);

// ─── Report Queue ──────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports
 * List reports with optional filters: status, targetType, reason, page, limit
 */
router.get('/reports', listReports);

/**
 * GET /api/admin/reports/:reportId
 * Get detailed report including resolved target entity
 */
router.get('/reports/:reportId', getReport);

/**
 * PATCH /api/admin/reports/:reportId/status
 * Update report status (OPEN → REVIEWING → RESOLVED/DISMISSED)
 * Body: { status, moderationNote? }
 */
router.patch('/reports/:reportId/status', updateReportStatus);

// ─── User Moderation ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Admin user search with filters: q, accountStatus, role, page, limit
 */
router.get('/users', listUsers);

/**
 * PATCH /api/admin/users/:userId/status
 * Suspend or reactivate a user account
 * Body: { status: 'ACTIVE' | 'SUSPENDED', reason? }
 */
router.patch('/users/:userId/status', updateUserStatus);

// ─── Content Moderation ────────────────────────────────────────────────────────

/**
 * PATCH /api/admin/posts/:postId/moderation
 * Set post moderation status: ACTIVE, HIDDEN, or REMOVED
 * Body: { status, reason? }
 */
router.patch('/posts/:postId/moderation', moderatePost);

/**
 * PATCH /api/admin/comments/:commentId/moderation
 * Set comment moderation status: ACTIVE, HIDDEN, or REMOVED
 * Body: { status, reason? }
 */
router.patch('/comments/:commentId/moderation', moderateComment);

/**
 * PATCH /api/admin/stories/:storyId/moderation
 * Set story moderation status: ACTIVE, HIDDEN, or REMOVED
 * Body: { status, reason? }
 */
router.patch('/stories/:storyId/moderation', moderateStory);

// ─── Audit Log Management ──────────────────────────────────────────────────────
router.use('/audit-logs', adminAuditRoutes);

export default router;
