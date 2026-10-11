import express from 'express';
import protect from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import {
  searchUsers,
  getProfile,
  updateProfile,
  followUser,
  unfollowUser,
} from '../controllers/userController.js';

const router = express.Router();

// Every user route needs a logged-in user
router.use(protect);

router.get('/search', searchUsers); // must come before '/:username'
router.put('/me', upload.single('avatar'), updateProfile);
router.get('/:username', getProfile);
router.post('/:id/follow', followUser);
router.delete('/:id/follow', unfollowUser);

export default router;
