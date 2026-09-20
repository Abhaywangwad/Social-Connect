import { z } from 'zod';
import mongoose from 'mongoose';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../models/AuditLog.js';

const isValidObjectId = (val) => mongoose.Types.ObjectId.isValid(val);

const objectIdSchema = z
  .string()
  .trim()
  .refine(isValidObjectId, { message: 'Invalid MongoDB ObjectId format' });

// Accepts ISO-8601 date strings, rejects invalid date representations
const isoDateString = z
  .string()
  .trim()
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Must be a valid ISO-8601 date string' }
  );

/**
 * Query schema for GET /api/admin/audit-logs
 */
export const auditLogQuerySchema = z
  .object({
    actorId: objectIdSchema.optional(),
    action: z.enum(AUDIT_ACTIONS, {
      errorMap: () => ({ message: `Action must be one of: ${AUDIT_ACTIONS.join(', ')}` }),
    }).optional(),
    targetType: z.enum(AUDIT_TARGET_TYPES, {
      errorMap: () => ({ message: `TargetType must be one of: ${AUDIT_TARGET_TYPES.join(', ')}` }),
    }).optional(),
    targetId: z.string().trim().min(1).optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    page: z
      .preprocess((val) => (val !== undefined && val !== '' ? parseInt(val, 10) : 1), z.number().int().min(1))
      .default(1),
    limit: z
      .preprocess((val) => (val !== undefined && val !== '' ? parseInt(val, 10) : 50), z.number().int().min(1).max(100))
      .default(50),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: "'from' timestamp must be earlier than or equal to 'to' timestamp",
      path: ['from'],
    }
  );

/**
 * Param schema for GET /api/admin/audit-logs/:auditLogId
 */
export const auditLogIdParamSchema = z.object({
  auditLogId: objectIdSchema,
});

/**
 * Query schema for user activity summary
 */
export const userActivitySummaryQuerySchema = z
  .object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  })
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: "'from' timestamp must be earlier than or equal to 'to' timestamp",
      path: ['from'],
    }
  );

export default {
  auditLogQuerySchema,
  auditLogIdParamSchema,
  userActivitySummaryQuerySchema,
};
