import { z } from 'zod';

/**
 * Validation schema for GET /api/feed query parameters.
 */
export const feedQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: 'Limit must be a number' })
      .int({ message: 'Limit must be an integer' })
      .min(1, { message: 'Limit must be at least 1' })
      .max(50, { message: 'Limit cannot exceed 50' })
      .default(20),
    cursor: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+$/, { message: 'Invalid cursor format; must be base64url encoded' })
      .optional(),
  })
  .strict();

export default {
  feedQuerySchema,
};
