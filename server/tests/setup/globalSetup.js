import mongoose from 'mongoose';
import { beforeAll, afterAll } from 'vitest';
import config from '../../src/config/config.js';

// Preload models so Mongoose registers schemas and builds unique compound indexes
import User from '../../src/models/User.js';
import Post from '../../src/models/Post.js';
import Follow from '../../src/models/Follow.js';
import Block from '../../src/models/Block.js';
import Like from '../../src/models/Like.js';
import Save from '../../src/models/Save.js';
import Comment from '../../src/models/Comment.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import Notification from '../../src/models/Notification.js';
import Story from '../../src/models/Story.js';
import Session from '../../src/models/Session.js';
import Report from '../../src/models/Report.js';
import AuditLog from '../../src/models/AuditLog.js';
import EmailVerificationToken from '../../src/models/EmailVerificationToken.js';
import PasswordResetToken from '../../src/models/PasswordResetToken.js';

beforeAll(async () => {
  // Ensure connection to isolated test DB
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.mongoUri, {
      maxPoolSize: config.db.maxPoolSize,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
    });
  }

  // Ensure unique indexes are built on all models
  await Promise.all([
    User.init(),
    Post.init(),
    Follow.init(),
    Block.init(),
    Like.init(),
    Save.init(),
    Comment.init(),
    Conversation.init(),
    Message.init(),
    Notification.init(),
    Story.init(),
    Session.init(),
    Report.init(),
    AuditLog.init(),
    EmailVerificationToken.init(),
    PasswordResetToken.init(),
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
