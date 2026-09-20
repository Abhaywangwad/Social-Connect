import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validations/authValidation.js';
import { sessionIdParamSchema } from '../validations/blockReportSessionValidation.js';
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  refreshLimiter,
} from '../middleware/rateLimiter.js';

const router = Router();

// ─── Registration & Login ─────────────────────────────────────────────────────
router.post('/register', registerLimiter, validate({ body: registerSchema }), register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), login);
router.post('/refresh', refreshLimiter, refresh);

// ─── Logout & Session Management ──────────────────────────────────────────────
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, getSessions);
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: sessionIdParamSchema }),
  revokeSession
);

// ─── Password Management ──────────────────────────────────────────────────────
router.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  changePassword
);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword
);
router.post(
  '/reset-password',
  resetPasswordLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword
);

// ─── Email Verification ───────────────────────────────────────────────────────
router.post('/verify-email', validate({ body: verifyEmailSchema }), verifyEmail);
router.post('/resend-verification', authenticate, resendVerificationLimiter, resendVerification);

// ─── Current User Identity ────────────────────────────────────────────────────
router.get('/me', authenticate, getMe);

export default router;
