import express from 'express';
import protect from '../middleware/auth.js';
import { signup, login, logout, getMe } from '../controllers/authController.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

export default router;
