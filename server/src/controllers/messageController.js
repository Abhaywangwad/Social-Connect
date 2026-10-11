import Message from '../models/Message.js';
import User from '../models/User.js';

// GET /api/messages  -> list of people I have chatted with + last message
export const getConversations = async (req, res) => {
  const messages = await Message.find({
    $or: [{ sender: req.userId }, { receiver: req.userId }],
  })
    .sort({ createdAt: -1 })
    .populate('sender', 'username avatar')
    .populate('receiver', 'username avatar');

  // Keep only the newest message for each person
  const conversations = [];
  const seen = new Set();

  for (const msg of messages) {
    const otherUser = msg.sender._id.toString() === req.userId ? msg.receiver : msg.sender;
    const otherId = otherUser._id.toString();

    if (!seen.has(otherId)) {
      seen.add(otherId);
      conversations.push({ user: otherUser, lastMessage: msg });
    }
  }

  res.json({ conversations });
};

// GET /api/messages/:userId  -> all messages between me and that user
export const getMessages = async (req, res) => {
  const otherId = req.params.userId;

  const messages = await Message.find({
    $or: [
      { sender: req.userId, receiver: otherId },
      { sender: otherId, receiver: req.userId },
    ],
  }).sort({ createdAt: 1 });

  res.json({ messages });
};

// POST /api/messages/:userId  { text }
export const sendMessage = async (req, res) => {
  const receiverId = req.params.userId;
  const text = (req.body.text || '').trim();

  if (!text) {
    return res.status(400).json({ message: 'Message cannot be empty' });
  }
  if (receiverId === req.userId) {
    return res.status(400).json({ message: 'You cannot message yourself' });
  }
  const receiver = await User.findById(receiverId);
  if (!receiver) {
    return res.status(404).json({ message: 'User not found' });
  }

  const message = await Message.create({ sender: req.userId, receiver: receiverId, text });

  // Real-time: push the message to the receiver if they are online.
  // Every connected user joins a Socket.IO "room" named after their user id.
  const io = req.app.get('io');
  io.to(receiverId).emit('newMessage', message);

  res.status(201).json({ message });
};
