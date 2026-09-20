import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const savePostParamsSchema = z.object({
  postId: objectIdSchema,
});

export const saveQuerySchema = paginationQuerySchema;
