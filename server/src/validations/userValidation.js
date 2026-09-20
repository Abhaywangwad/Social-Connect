import { z } from 'zod';
import { objectIdSchema } from './commonValidation.js';

export const updateProfileSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be between 3 and 30 characters')
      .max(30, 'Username must be between 3 and 30 characters')
      .regex(/^[a-z0-9_.]+$/, 'Username can only contain lowercase letters, numbers, underscores, and periods')
      .optional(),
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be between 2 and 50 characters')
      .max(50, 'Full name must be between 2 and 50 characters')
      .optional(),
    bio: z
      .string()
      .max(150, 'Bio cannot exceed 150 characters')
      .optional(),
    profilePicture: z
      .string()
      .url('Profile picture must be a valid URL')
      .refine(
        (url) => url === '' || url.startsWith('https://'),
        'Profile picture must use HTTPS'
      )
      .or(z.literal(''))
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update (username, fullName, bio, profilePicture)',
  });

export const usernameParamSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters'),
});

export const userIdParamSchema = z.object({
  userId: objectIdSchema,
});
