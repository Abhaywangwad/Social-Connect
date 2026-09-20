import mongoose from 'mongoose';
import AuditLog, { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

// Sensitive keys pattern to strip from audit metadata
const SENSITIVE_KEY_REGEX = /password|secret|authorization|cookie|jwt|credential/i;

/**
 * Sanitizes metadata objects by recursively removing sensitive credential fields.
 *
 * @param {any} data
 * @returns {any} Sanitized clone of data
 */
export const sanitizeAuditMetadata = (data) => {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuditMetadata);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'tokenFamily' && (/token/i.test(key) || SENSITIVE_KEY_REGEX.test(key))) {
      continue; // Exclude sensitive key
    }
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
      clean[key] = sanitizeAuditMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
};

export const auditService = {
  /**
   * Centralized creation of an immutable AuditLog record.
   *
   * @param {Object} params
   * @param {string|mongoose.Types.ObjectId|null} [params.actor] User._id or null for SYSTEM
   * @param {string} params.action Controlled action enum
   * @param {string} [params.targetType] Target resource enum ('USER', 'POST', etc.)
   * @param {string|mongoose.Types.ObjectId} [params.targetId] ID of affected resource
   * @param {Object} [params.metadata] Server-generated structured contextual metadata
   * @param {string} [params.requestId] Correlation request ID
   * @param {string} [params.ipAddress] Client IP address
   * @param {string} [params.userAgent] Client User-Agent string
   * @param {mongoose.ClientSession} [params.session] Optional MongoDB transaction session
   * @returns {Promise<Object|null>} Created AuditLog or null if logging failed
   */
  async createAuditLog({
    actor = null,
    action,
    targetType = null,
    targetId = null,
    metadata = {},
    requestId = null,
    ipAddress = null,
    userAgent = null,
    session = null,
  }) {
    if (!action || !AUDIT_ACTIONS.includes(action)) {
      logger.warn(`[AuditService] Rejected invalid audit action: ${action}`);
      return null;
    }

    if (targetType && !AUDIT_TARGET_TYPES.includes(targetType)) {
      logger.warn(`[AuditService] Rejected invalid audit targetType: ${targetType}`);
      return null;
    }

    // Strictly sanitize metadata before persisting
    const safeMetadata = sanitizeAuditMetadata(metadata || {});

    try {
      const logEntry = new AuditLog({
        actor: actor ? new mongoose.Types.ObjectId(actor) : null,
        action,
        targetType: targetType || null,
        targetId: targetId ? targetId.toString() : null,
        metadata: safeMetadata,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
        requestId: requestId ? String(requestId).slice(0, 64) : null,
        createdAt: new Date(),
      });

      const options = session ? { session } : {};
      await logEntry.save(options);
      return logEntry;
    } catch (err) {
      // Non-blocking resilience: Log failure, but never crash the core business transaction
      logger.error(`[AuditService] Failed to persist audit log for action ${action}: ${err.message}`, {
        action,
        actor,
        requestId,
        error: err.stack,
      });
      return null;
    }
  },

  /**
   * Retrieves a paginated and filtered list of audit logs for administrators.
   *
   * @param {Object} query
   * @param {string} [query.actorId]
   * @param {string} [query.action]
   * @param {string} [query.targetType]
   * @param {string} [query.targetId]
   * @param {string} [query.from] ISO-8601 timestamp
   * @param {string} [query.to] ISO-8601 timestamp
   * @param {number} [query.page=1]
   * @param {number} [query.limit=50]
   * @returns {Promise<Object>} { logs, pagination }
   */
  async getAuditLogs({
    actorId,
    action,
    targetType,
    targetId,
    from,
    to,
    page = 1,
    limit = 50,
  } = {}) {
    const filter = {};

    if (actorId) {
      if (!mongoose.Types.ObjectId.isValid(actorId)) {
        throw AppError.badRequest('Invalid actorId format');
      }
      filter.actor = new mongoose.Types.ObjectId(actorId);
    }

    if (action) {
      if (!AUDIT_ACTIONS.includes(action)) {
        throw AppError.badRequest(`Invalid action filter: ${action}`);
      }
      filter.action = action;
    }

    if (targetType) {
      if (!AUDIT_TARGET_TYPES.includes(targetType)) {
        throw AppError.badRequest(`Invalid targetType filter: ${targetType}`);
      }
      filter.targetType = targetType;
    }

    if (targetId) {
      filter.targetId = String(targetId);
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          throw AppError.badRequest('Invalid from timestamp format');
        }
        filter.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          throw AppError.badRequest('Invalid to timestamp format');
        }
        filter.createdAt.$lte = toDate;
      }
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const [logs, totalLogs] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('actor', 'username fullName email role profilePicture')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalLogs / parsedLimit);

    return {
      logs: logs.map((log) => ({
        id: log._id.toString(),
        actor: log.actor || null,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: log.metadata || {},
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        requestId: log.requestId,
        createdAt: log.createdAt,
      })),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalLogs,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1,
      },
    };
  },

  /**
   * Retrieves a single AuditLog by its identifier.
   *
   * @param {string} auditLogId
   * @returns {Promise<Object>} Populated AuditLog
   */
  async getAuditLogById(auditLogId) {
    if (!auditLogId || !mongoose.Types.ObjectId.isValid(auditLogId)) {
      throw AppError.badRequest('Invalid audit log ID format');
    }

    const log = await AuditLog.findById(auditLogId)
      .populate('actor', 'username fullName email role profilePicture')
      .lean();

    if (!log) {
      throw AppError.notFound('Audit log entry not found');
    }

    return {
      id: log._id.toString(),
      actor: log.actor || null,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      metadata: log.metadata || {},
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      requestId: log.requestId,
      createdAt: log.createdAt,
    };
  },

  /**
   * Aggregates administrative activity summary for a given user.
   *
   * @param {string} userId
   * @param {Object} options
   * @param {string} [options.from]
   * @param {string} [options.to]
   * @returns {Promise<Object>} Activity breakdown counts
   */
  async getUserActivitySummary(userId, { from, to } = {}) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw AppError.badRequest('Invalid user ID format');
    }

    const matchFilter = {
      actor: new mongoose.Types.ObjectId(userId),
    };

    if (from || to) {
      matchFilter.createdAt = {};
      if (from) matchFilter.createdAt.$gte = new Date(from);
      if (to) matchFilter.createdAt.$lte = new Date(to);
    }

    const counts = await AuditLog.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
    ]);

    const breakdown = counts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      userId,
      timeframe: { from: from || null, to: to || null },
      summary: {
        postsCreated: breakdown['POST_CREATED'] || 0,
        commentsCreated: breakdown['COMMENT_CREATED'] || 0,
        followsCreated: breakdown['FOLLOW_CREATED'] || 0,
        blocksCreated: breakdown['USER_BLOCKED'] || 0,
        reportsFiled: breakdown['REPORT_CREATED'] || 0,
        logins: breakdown['USER_LOGIN'] || 0,
        loginFailures: breakdown['USER_LOGIN_FAILED'] || 0,
        totalAuditedEvents: Object.values(breakdown).reduce((sum, c) => sum + c, 0),
      },
      detailedActions: breakdown,
    };
  },
};

export default auditService;
