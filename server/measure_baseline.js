import mongoose from 'mongoose';
import config from './src/config/config.js';
import User from './src/models/User.js';
import Post from './src/models/Post.js';
import Comment from './src/models/Comment.js';
import Like from './src/models/Like.js';
import Save from './src/models/Save.js';
import Follow from './src/models/Follow.js';
import Conversation from './src/models/Conversation.js';
import Message from './src/models/Message.js';
import Notification from './src/models/Notification.js';

async function measure() {
  await mongoose.connect(config.mongoUri);

  // Clear baseline benchmark collection data
  await Promise.all([
    User.deleteMany({ username: /^bench_/ }),
    Post.deleteMany({ caption: /^Benchmark/ }),
    Comment.deleteMany({ content: /^Benchmark/ }),
    Like.deleteMany({}),
    Save.deleteMany({}),
    Follow.deleteMany({}),
    Conversation.deleteMany({ conversationKey: /^bench_/ }),
    Message.deleteMany({ content: /^Benchmark/ }),
    Notification.deleteMany({}),
  ]);

  console.log('Seeding controlled benchmark dataset...');

  // 1. Seed 50 users
  const userDocs = [];
  for (let i = 0; i < 50; i++) {
    userDocs.push({
      username: `bench_user_${i}`,
      email: `bench_${i}@example.com`,
      password: 'HashedPassword123!',
      fullName: `Benchmark User ${i}`,
      normalizedFullName: `benchmark user ${i}`,
      accountStatus: 'ACTIVE',
    });
  }
  const users = await User.insertMany(userDocs);
  const primaryUser = users[0];
  const followedUsers = users.slice(1, 15);
  const followedIds = followedUsers.map((u) => u._id);

  // 2. Seed 50 follow relationships
  const followDocs = [];
  for (const f of followedUsers) {
    followDocs.push({ follower: primaryUser._id, following: f._id });
  }
  await Follow.insertMany(followDocs);

  // 3. Seed 150 posts
  const postDocs = [];
  for (let i = 0; i < 150; i++) {
    const author = users[i % 25];
    postDocs.push({
      author: author._id,
      caption: `Benchmark post caption ${i}`,
      moderationStatus: 'ACTIVE',
      createdAt: new Date(Date.now() - i * 60000),
    });
  }
  const posts = await Post.insertMany(postDocs);
  const samplePost = posts[0];

  // 4. Seed 100 comments
  const commentDocs = [];
  for (let i = 0; i < 100; i++) {
    commentDocs.push({
      author: users[i % users.length]._id,
      post: samplePost._id,
      content: `Benchmark comment ${i}`,
      parentComment: null,
      moderationStatus: 'ACTIVE',
      createdAt: new Date(Date.now() - i * 30000),
    });
  }
  await Comment.insertMany(commentDocs);

  // 5. Seed 100 likes & 50 saves
  const likeDocs = [];
  const saveDocs = [];
  for (let i = 0; i < 50; i++) {
    likeDocs.push({ user: users[i]._id, post: samplePost._id });
    saveDocs.push({ user: primaryUser._id, post: posts[i]._id });
  }
  await Like.insertMany(likeDocs);
  await Save.insertMany(saveDocs);

  // 6. Seed conversation and 100 messages
  const conv = await Conversation.create({
    participants: [primaryUser._id, users[1]._id],
    conversationKey: `bench_${primaryUser._id}:${users[1]._id}`,
    lastMessageAt: new Date(),
  });

  const messageDocs = [];
  for (let i = 0; i < 100; i++) {
    messageDocs.push({
      conversation: conv._id,
      sender: i % 2 === 0 ? primaryUser._id : users[1]._id,
      content: `Benchmark message ${i}`,
      createdAt: new Date(Date.now() - i * 15000),
    });
  }
  await Message.insertMany(messageDocs);

  // 7. Seed 50 notifications
  const notifDocs = [];
  for (let i = 0; i < 50; i++) {
    notifDocs.push({
      recipient: primaryUser._id,
      actor: users[(i % 10) + 1]._id,
      type: 'LIKE',
      post: samplePost._id,
      isRead: i > 25,
      createdAt: new Date(Date.now() - i * 20000),
    });
  }
  await Notification.insertMany(notifDocs);

  console.log('Seeding complete. Measuring queries via explain("executionStats")...\n');

  const benchmarks = {};

  // Query 1: Feed
  {
    const start = process.hrtime.bigint();
    const exp = await Post.find({
      author: { $in: [primaryUser._id, ...followedIds] },
      moderationStatus: 'ACTIVE',
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(21)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.feed = {
      query: "Post.find({ author: { $in: [...] }, moderationStatus: 'ACTIVE' }).sort({ createdAt: -1, _id: -1 }).limit(21)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 2: Search
  {
    const start = process.hrtime.bigint();
    const exp = await User.find({
      accountStatus: 'ACTIVE',
      username: { $regex: '^bench_user' },
    })
      .select('_id username fullName profilePicture bio isVerified isPrivate followersCount followingCount')
      .sort({ username: 1, _id: 1 })
      .limit(20)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.search = {
      query: "User.find({ accountStatus: 'ACTIVE', username: /^bench_user/ }).sort({ username: 1, _id: 1 }).limit(20)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 3: Post listing
  {
    const start = process.hrtime.bigint();
    const exp = await Post.find({
      author: primaryUser._id,
      moderationStatus: 'ACTIVE',
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.postListing = {
      query: "Post.find({ author: userId, moderationStatus: 'ACTIVE' }).sort({ createdAt: -1 }).limit(12)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 4: Comments
  {
    const start = process.hrtime.bigint();
    const exp = await Comment.find({
      post: samplePost._id,
      parentComment: null,
      moderationStatus: 'ACTIVE',
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.comments = {
      query: "Comment.find({ post: postId, parentComment: null, moderationStatus: 'ACTIVE' }).sort({ createdAt: -1 }).limit(20)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 5: Notifications
  {
    const start = process.hrtime.bigint();
    const exp = await Notification.find({
      recipient: primaryUser._id,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.notifications = {
      query: "Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(20)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 6: Messages
  {
    const start = process.hrtime.bigint();
    const exp = await Message.find({
      conversation: conv._id,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(31)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.messages = {
      query: "Message.find({ conversation: convId }).sort({ createdAt: -1, _id: -1 }).limit(31)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  // Query 7: Saved Posts
  {
    const start = process.hrtime.bigint();
    const exp = await Save.find({
      user: primaryUser._id,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .explain('executionStats');
    const wallMs = Number(process.hrtime.bigint() - start) / 1e6;

    benchmarks.savedPosts = {
      query: "Save.find({ user: userId }).sort({ createdAt: -1 }).limit(20)",
      executionTimeMillis: exp.executionStats.executionTimeMillis,
      totalDocsExamined: exp.executionStats.totalDocsExamined,
      totalKeysExamined: exp.executionStats.totalKeysExamined,
      nReturned: exp.executionStats.nReturned,
      winningPlan: exp.queryPlanner.winningPlan.stage,
      wallClockMs: wallMs.toFixed(2),
    };
  }

  console.log('RESULTS_JSON_START');
  console.log(JSON.stringify(benchmarks, null, 2));
  console.log('RESULTS_JSON_END');

  // Clean up benchmark data
  await Promise.all([
    User.deleteMany({ username: /^bench_/ }),
    Post.deleteMany({ caption: /^Benchmark/ }),
    Comment.deleteMany({ content: /^Benchmark/ }),
    Like.deleteMany({ post: samplePost._id }),
    Save.deleteMany({ user: primaryUser._id }),
    Follow.deleteMany({ follower: primaryUser._id }),
    Conversation.deleteMany({ _id: conv._id }),
    Message.deleteMany({ conversation: conv._id }),
    Notification.deleteMany({ recipient: primaryUser._id }),
  ]);

  await mongoose.disconnect();
}

measure().catch(console.error);
