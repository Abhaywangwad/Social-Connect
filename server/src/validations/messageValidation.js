import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const sendMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Message content cannot be empty')
      .max(2000, 'Message content cannot exceed 2000 characters'),
  })
  .strict();

export const conversationMessagesParamSchema = z.object({
  id: objectIdSchema,
});

export const messagePaginationQuerySchema = paginationQuerySchema.extend({
  cursor: objectIdSchema.optional(),
});
