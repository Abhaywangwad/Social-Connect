import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from './commonValidation.js';

export const notificationIdParamSchema = z.object({
  notificationId: objectIdSchema,
});

export const notificationQuerySchema = paginationQuerySchema;
