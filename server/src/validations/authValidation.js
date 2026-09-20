import { z } from 'zod';

const passwordComplexityRegex = /^(?=.*[a-zA-Z])(?=.*[0-9])/;

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be between 3 and 30 characters')
    .max(30, 'Username must be between 3 and 30 characters')
    .regex(/^[a-z0-9_.]+$/, 'Username can only contain letters, numbers, underscores, and periods'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(passwordComplexityRegex, 'Password must contain at least one letter and one number'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be between 2 and 50 characters')
    .max(50, 'Full name must be between 2 and 50 characters'),
}).strict();

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(passwordComplexityRegex, 'Password must contain at least one letter and one number'),
}).strict();

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(passwordComplexityRegex, 'Password must contain at least one letter and one number'),
}).strict();

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required'),
}).strict();
