import express from 'express';
import protect from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import {
  getFeed,
  createPost,
  deletePost,
  toggleLike,
  addComment,
} from '../controllers/postController.js';

const router = express.Router();

router.use(protect);

router.get('/feed', getFeed);
router.post('/', upload.single('image'), createPost);
router.delete('/:id', deletePost);
router.put('/:id/like', toggleLike);
router.post('/:id/comments', addComment);

export default router;
