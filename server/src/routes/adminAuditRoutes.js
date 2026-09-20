import { Router } from 'express';
import {
  listAuditLogs,
  getAuditLog,
  getUserActivitySummary,
} from '../controllers/auditController.js';

const router = Router();

/**
 * Audit Log Routes (mounted under /api/admin/audit-logs)
 *
 * Inherits parent authorization from adminRoutes:
 * adminLimiter → authenticate → requireAdmin
 */

// GET /api/admin/audit-logs - List audit logs with pagination and filters
router.get('/', listAuditLogs);

// GET /api/admin/audit-logs/users/:userId/summary - Activity summary for a user
router.get('/users/:userId/summary', getUserActivitySummary);

// GET /api/admin/audit-logs/:auditLogId - Get specific audit log entry
router.get('/:auditLogId', getAuditLog);

export default router;
