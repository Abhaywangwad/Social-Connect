import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const createCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Comment content cannot be empty')
      .max(1000, 'Comment cannot exceed 1000 characters'),
  })
  .strict();

export const commentIdParamSchema = z.object({
  commentId: objectIdSchema,
});

export const postCommentParamsSchema = z.object({
  postId: objectIdSchema,
});

export const commentQuerySchema = paginationQuerySchema;
