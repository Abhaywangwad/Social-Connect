import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const createPostSchema = z
  .object({
    caption: z.string().max(2200, 'Caption cannot exceed 2200 characters').optional(),
    location: z.string().max(100, 'Location cannot exceed 100 characters').optional(),
  })
  .strict();

export const updatePostSchema = z
  .object({
    caption: z.string().max(2200, 'Caption cannot exceed 2200 characters').optional(),
    location: z.string().max(100, 'Location cannot exceed 100 characters').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update (caption, location)',
  });

export const postIdParamSchema = z.object({
  id: objectIdSchema,
});

export const postQuerySchema = paginationQuerySchema;
