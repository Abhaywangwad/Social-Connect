import { z } from 'zod';
import { objectIdSchema } from './commonValidation.js';

export const createStorySchema = z
  .object({
    caption: z.string().max(500, 'Story caption cannot exceed 500 characters').optional(),
  })
  .strict();

export const storyIdParamSchema = z.object({
  storyId: objectIdSchema,
});
