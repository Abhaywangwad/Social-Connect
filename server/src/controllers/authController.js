import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// Creates a JWT for the user and stores it in an HttpOnly cookie.
// HttpOnly means JavaScript in the browser cannot read it (safer against XSS).
const setTokenCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    maxAge: SEVEN_DAYS,
  });
};

// POST /api/auth/signup
export const signup = async (req, res) => {
  const { username, email, password, fullName } = req.body;

  // Simple validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email and password are required' });
  }
  if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) {
    return res.status(400).json({
      message: 'Username must be 3-20 characters (letters, numbers, _ or .)',
    });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });
  if (existing) {
    return res.status(400).json({ message: 'Username or email is already taken' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    username,
    email,
    password: hashedPassword,
    fullName: fullName || '',
  });

  setTokenCookie(res, user._id);
  res.status(201).json({ user });
};

// POST /api/auth/login
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  const passwordOk = user && (await bcrypt.compare(password, user.password));

  if (!passwordOk) {
    return res.status(400).json({ message: 'Invalid email or password' });
  }

  setTokenCookie(res, user._id);
  res.json({ user });
};

// POST /api/auth/logout
export const logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
};

// GET /api/auth/me  -> who is logged in? (used when the page reloads)
export const getMe = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({ user });
};
