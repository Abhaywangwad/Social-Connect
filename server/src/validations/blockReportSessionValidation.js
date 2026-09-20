import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const blockUserParamsSchema = z.object({
  targetUserId: objectIdSchema,
});

export const blockQuerySchema = paginationQuerySchema;

export const createReportSchema = z
  .object({
    targetType: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
      z.enum(['USER', 'POST', 'COMMENT', 'STORY'], {
        errorMap: () => ({ message: "targetType must be one of 'USER', 'POST', 'COMMENT', 'STORY'" }),
      })
    ),
    targetId: objectIdSchema,
    reason: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
      z.enum(
        ['SPAM', 'HARASSMENT', 'SCAM', 'HATE_SPEECH', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'OTHER'],
        {
          errorMap: () => ({
            message:
              "reason must be one of 'SPAM', 'HARASSMENT', 'SCAM', 'INAPPROPRIATE_CONTENT', 'IMPERSONATION', 'OTHER'",
          }),
        }
      )
    ),
    details: z.string().max(1000, 'Details cannot exceed 1000 characters').optional().default(''),
  })
  .strict();

export const sessionIdParamSchema = z.object({
  sessionId: objectIdSchema,
});
