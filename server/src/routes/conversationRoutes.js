import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireActiveAccount } from '../middleware/accountStatusMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  startConversationSchema,
  conversationIdParamSchema,
  conversationQuerySchema,
} from '../validations/conversationValidation.js';
import {
  sendMessageSchema,
  messagePaginationQuerySchema,
} from '../validations/messageValidation.js';
import { messageLimiter } from '../middleware/rateLimiter.js';
import {
  createConversation,
  getUserConversations,
  getConversationById,
  sendMessage,
  getConversationMessages,
  markConversationAsRead,
} from '../controllers/conversationController.js';

const router = Router();

// All direct messaging routes are protected
router.use(authenticate);

// ─── Conversation Collection Routes ───────────────────────────────────────────
router.post('/', requireActiveAccount, validate({ body: startConversationSchema }), createConversation);
router.get('/', validate({ query: conversationQuerySchema }), getUserConversations);

// ─── Specific Conversation Routes ─────────────────────────────────────────────
router.get('/:conversationId', validate({ params: conversationIdParamSchema }), getConversationById);
router.patch('/:conversationId/read', validate({ params: conversationIdParamSchema }), markConversationAsRead);

// ─── Messages Sub-Resource ────────────────────────────────────────────────────
router.post(
  '/:conversationId/messages',
  messageLimiter,
  requireActiveAccount,  // Suspended users cannot send REST messages
  validate({ params: conversationIdParamSchema, body: sendMessageSchema }),
  sendMessage
);
router.get(
  '/:conversationId/messages',
  validate({ params: conversationIdParamSchema, query: messagePaginationQuerySchema }),
  getConversationMessages
);

export default router;
