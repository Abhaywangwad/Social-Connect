import { z } from 'zod';

/**
 * Validates a 24-character hexadecimal MongoDB ObjectId string.
 */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format; must be a 24-character hex ObjectId');

/**
 * Standard reusable pagination query parameters.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * List of internal or sensitive fields that client bodies must NEVER be allowed to set directly.
 */
export const FORBIDDEN_INTERNAL_FIELDS = [
  '_id',
  'author',
  'authorId',
  'userId',
  'sender',
  'recipient',
  'followersCount',
  'followingCount',
  'likesCount',
  'commentsCount',
  'repliesCount',
  'createdAt',
  'updatedAt',
  'isVerified',
  'emailVerified',
  'emailVerifiedAt',
  'revokedAt',
  'lastReadAt',
  'tokenFamily',
  'refreshTokenHash',
  'previousTokenHashes',
  // Admin/moderation fields — cannot be set by normal users through any request body
  'role',
  'accountStatus',
  'suspendedAt',
  'suspensionReason',
  'moderationStatus',
  'moderatedAt',
  'moderatedBy',
  // Audit log internal fields
  'actor',
];
