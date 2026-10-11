import express from 'express';
import protect from '../middleware/auth.js';
import { getConversations, getMessages, sendMessage } from '../controllers/messageController.js';

const router = express.Router();

router.use(protect);

router.get('/', getConversations);
router.get('/:userId', getMessages);
router.post('/:userId', sendMessage);

export default router;
