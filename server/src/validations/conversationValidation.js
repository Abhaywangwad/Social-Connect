import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const startConversationSchema = z
  .object({
    recipientId: objectIdSchema.optional(),
    targetUserId: objectIdSchema.optional(),
    userId: objectIdSchema.optional(),
  })
  .strict()
  .refine((data) => data.recipientId || data.targetUserId || data.userId, {
    message: 'Either recipientId, targetUserId, or userId must be provided',
  });

export const conversationIdParamSchema = z.object({
  conversationId: objectIdSchema,
});

export const conversationQuerySchema = paginationQuerySchema;
