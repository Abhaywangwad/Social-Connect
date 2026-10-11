import Post from '../models/Post.js';
import User from '../models/User.js';
import { uploadImage } from '../config/cloudinary.js';

// Fills in author / commenter details (instead of just their ids)
const populatePost = (query) =>
  query.populate('author', 'username avatar').populate('comments.user', 'username avatar');

// GET /api/posts/feed?page=1&limit=10
// Posts from people I follow + my own posts, newest first.
export const getFeed = async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  const me = await User.findById(req.userId);
  const authors = [...me.following, me._id];

  const posts = await populatePost(
    Post.find({ author: { $in: authors } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
  );

  res.json({ posts, page, hasMore: posts.length === limit });
};

// POST /api/posts  (multipart form: text + optional image)
export const createPost = async (req, res) => {
  const text = (req.body.text || '').trim();

  if (!text && !req.file) {
    return res.status(400).json({ message: 'A post needs text or an image' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ message: 'Post text can be at most 2000 characters' });
  }

  let image = '';
  if (req.file) {
    image = await uploadImage(req.file);
  }

  const post = await Post.create({ author: req.userId, text, image });
  const populated = await populatePost(Post.findById(post._id));
  res.status(201).json({ post: populated });
};

// DELETE /api/posts/:id  (only the author can delete)
export const deletePost = async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }
  if (post.author.toString() !== req.userId) {
    return res.status(403).json({ message: 'You can only delete your own posts' });
  }

  await post.deleteOne();
  res.json({ message: 'Post deleted' });
};

// PUT /api/posts/:id/like  -> like if not liked yet, otherwise unlike
export const toggleLike = async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }

  const alreadyLiked = post.likes.some((id) => id.toString() === req.userId);
  if (alreadyLiked) {
    post.likes = post.likes.filter((id) => id.toString() !== req.userId);
  } else {
    post.likes.push(req.userId);
  }

  await post.save();
  res.json({ likes: post.likes });
};

// POST /api/posts/:id/comments  { text }
export const addComment = async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return res.status(400).json({ message: 'Comment cannot be empty' });
  }
  if (text.length > 500) {
    return res.status(400).json({ message: 'Comment can be at most 500 characters' });
  }

  const post = await Post.findById(req.params.id);
  if (!post) {
    return res.status(404).json({ message: 'Post not found' });
  }

  post.comments.push({ user: req.userId, text });
  await post.save();

  const updated = await populatePost(Post.findById(post._id));
  res.status(201).json({ comments: updated.comments });
};
