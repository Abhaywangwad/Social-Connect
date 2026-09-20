import { z } from 'zod';

/**
 * Admin Validation Schemas
 *
 * All admin input is strictly validated against explicit schemas.
 * No arbitrary MongoDB filter operators are accepted through query params.
 */

// ─── Report List Query ─────────────────────────────────────────────────────────
export const adminReportListSchema = z.object({
  status: z
    .enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'], {
      errorMap: () => ({
        message: 'status must be OPEN, REVIEWING, RESOLVED, or DISMISSED',
      }),
    })
    .optional(),
  targetType: z
    .enum(['USER', 'POST', 'COMMENT', 'STORY'], {
      errorMap: () => ({
        message: 'targetType must be USER, POST, COMMENT, or STORY',
      }),
    })
    .optional(),
  reason: z
    .enum(
      ['SPAM', 'HARASSMENT', 'SCAM', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'OTHER'],
      {
        errorMap: () => ({
          message: 'Invalid reason filter',
        }),
      }
    )
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1, 'Page must be a positive integer')),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(50, 'Limit cannot exceed 50')),
});

// ─── Report Status Update ──────────────────────────────────────────────────────
export const reportStatusSchema = z.object({
  status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'], {
    required_error: 'status is required',
    invalid_type_error: 'status must be a string',
  }),
  moderationNote: z
    .string()
    .trim()
    .max(2000, 'Moderation note cannot exceed 2000 characters')
    .optional(),
});

// ─── Content Moderation (Post / Comment / Story) ───────────────────────────────
export const contentModerationSchema = z.object({
  status: z.enum(['ACTIVE', 'HIDDEN', 'REMOVED'], {
    required_error: 'status is required',
    invalid_type_error: 'status must be ACTIVE, HIDDEN, or REMOVED',
  }),
  reason: z
    .string()
    .trim()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional(),
});

// ─── User Status Update ────────────────────────────────────────────────────────
export const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    required_error: 'status is required',
    invalid_type_error: 'status must be ACTIVE or SUSPENDED',
  }),
  reason: z
    .string()
    .trim()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional(),
});

// ─── Admin User List Query ─────────────────────────────────────────────────────
export const adminUserListSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  accountStatus: z
    .enum(['ACTIVE', 'SUSPENDED'], {
      errorMap: () => ({ message: 'accountStatus must be ACTIVE or SUSPENDED' }),
    })
    .optional(),
  role: z
    .enum(['USER', 'ADMIN'], {
      errorMap: () => ({ message: 'role must be USER or ADMIN' }),
    })
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1, 'Page must be a positive integer')),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(50, 'Limit cannot exceed 50')),
});

export default {
  adminReportListSchema,
  reportStatusSchema,
  contentModerationSchema,
  userStatusSchema,
  adminUserListSchema,
};
