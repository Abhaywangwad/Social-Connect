import User from '../models/User.js';
import Post from '../models/Post.js';
import { uploadImage } from '../config/cloudinary.js';

// GET /api/users/search?q=abc
export const searchUsers = async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json({ users: [] });
  }

  // Escape special regex characters so the search text is matched literally
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(safe, 'i');

  const users = await User.find({ $or: [{ username: regex }, { fullName: regex }] })
    .select('username fullName avatar')
    .limit(20);

  res.json({ users });
};

// GET /api/users/:username  -> profile info + that user's posts
export const getProfile = async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const posts = await Post.find({ author: user._id })
    .sort({ createdAt: -1 })
    .populate('author', 'username avatar')
    .populate('comments.user', 'username avatar');

  res.json({ user, posts });
};

// PUT /api/users/me  -> edit my profile (fullName, bio, optional new avatar)
export const updateProfile = async (req, res) => {
  const { fullName, bio } = req.body;

  if (fullName !== undefined && fullName.length > 50) {
    return res.status(400).json({ message: 'Name can be at most 50 characters' });
  }
  if (bio !== undefined && bio.length > 150) {
    return res.status(400).json({ message: 'Bio can be at most 150 characters' });
  }

  const user = await User.findById(req.userId);
  if (fullName !== undefined) user.fullName = fullName.trim();
  if (bio !== undefined) user.bio = bio.trim();
  if (req.file) user.avatar = await uploadImage(req.file);

  await user.save();
  res.json({ user });
};

// POST /api/users/:id/follow
export const followUser = async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.userId) {
    return res.status(400).json({ message: 'You cannot follow yourself' });
  }
  const target = await User.findById(targetId);
  if (!target) {
    return res.status(404).json({ message: 'User not found' });
  }

  // $addToSet only adds the id if it is not already in the array
  await User.findByIdAndUpdate(req.userId, { $addToSet: { following: targetId } });
  await User.findByIdAndUpdate(targetId, { $addToSet: { followers: req.userId } });

  res.json({ message: 'Followed' });
};

// DELETE /api/users/:id/follow
export const unfollowUser = async (req, res) => {
  const targetId = req.params.id;

  // $pull removes the id from the array
  await User.findByIdAndUpdate(req.userId, { $pull: { following: targetId } });
  await User.findByIdAndUpdate(targetId, { $pull: { followers: req.userId } });

  res.json({ message: 'Unfollowed' });
};
