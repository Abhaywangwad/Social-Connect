import { z } from 'zod';
import { paginationQuerySchema } from './commonValidation.js';

export const followUsernameParamSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters'),
});

export const followQuerySchema = paginationQuerySchema;
