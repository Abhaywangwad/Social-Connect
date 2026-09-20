import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import config from '../src/config/config.js';
import User from '../src/models/User.js';
import Post from '../src/models/Post.js';
import Follow from '../src/models/Follow.js';
import Like from '../src/models/Like.js';
import Comment from '../src/models/Comment.js';
import Save from '../src/models/Save.js';
import Notification from '../src/models/Notification.js';
import Conversation from '../src/models/Conversation.js';
import Message from '../src/models/Message.js';
import Story from '../src/models/Story.js';

/**
 * DEVELOPMENT/TEST ONLY: Performance Seed Generator
 * Generates realistic, non-uniform data to benchmark query plans, index scans,
 * and memory utilization.
 *
 * Safety Check: Strictly forbidden in production.
 */
export const seedPerformanceData = async ({ userCount = 60, postCount = 600 } = {}) => {
  if (config.isProd) {
    throw new Error('FATAL: seedPerformanceData cannot be run in production!');
  }

  console.log('🌱 [Seed] Cleaning up previous performance seed records...');
  await Promise.all([
    User.deleteMany({ email: /@perfbench\.test$/ }),
    Post.deleteMany({ caption: /^\[PERF_BENCH\]/ }),
  ]);

  console.log(`🌱 [Seed] Creating ${userCount} users with realistic distributions...`);
  const passwordHash = await bcrypt.hash('Password123!', 8); // fast hash for seeding
  const userDocs = [];

  for (let i = 1; i <= userCount; i++) {
    const padded = String(i).padStart(3, '0');
    userDocs.push({
      username: `perf_user_${padded}`,
      email: `perf_user_${padded}@perfbench.test`,
      password: passwordHash,
      fullName: `Benchmark User ${padded}`,
      normalizedFullName: `benchmark user ${padded}`,
      bio: `Bio for benchmark user ${padded}`,
      emailVerified: true,
    });
  }

  const users = await User.insertMany(userDocs);
  console.log(`✅ [Seed] ${users.length} users created.`);

  // Create power-law follow distributions (user 0 has many followers, user 10 has fewer, etc.)
  console.log('🌱 [Seed] Creating follow relationships...');
  const followDocs = [];
  const influencerUser = users[0];
  const midTierUser = users[1];

  for (let i = 1; i < users.length; i++) {
    followDocs.push({
      follower: users[i]._id,
      following: influencerUser._id,
      createdAt: new Date(Date.now() - i * 3600000),
    });
    if (i % 2 === 0) {
      followDocs.push({
        follower: users[i]._id,
        following: midTierUser._id,
        createdAt: new Date(Date.now() - i * 1800000),
      });
    }
  }

  // Cross follows among first 10 users
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      if (i !== j) {
        followDocs.push({
          follower: users[i]._id,
          following: users[j]._id,
          createdAt: new Date(Date.now() - (i + j) * 600000),
        });
      }
    }
  }

  await Follow.insertMany(followDocs, { ordered: false }).catch(() => {});
  console.log(`✅ [Seed] ${followDocs.length} follows created.`);

  // Create Posts (power-law distribution)
  console.log(`🌱 [Seed] Creating ${postCount} posts...`);
  const postDocs = [];
  for (let i = 0; i < postCount; i++) {
    // 40% of posts belong to top 3 users, remainder distributed across all users
    const author = i % 5 < 2 ? users[i % 3] : users[i % users.length];
    postDocs.push({
      author: author._id,
      caption: `[PERF_BENCH] Performance benchmark post number ${i + 1} with realistic text content`,
      likesCount: 0,
      commentsCount: 0,
      createdAt: new Date(Date.now() - (postCount - i) * 60000),
    });
  }
  const posts = await Post.insertMany(postDocs);
  console.log(`✅ [Seed] ${posts.length} posts created.`);

  // Create Likes, Comments, Saves, Notifications
  console.log('🌱 [Seed] Creating likes, saves, and comments...');
  const likeDocs = [];
  const saveDocs = [];
  const commentDocs = [];
  const notifDocs = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    // First 20 posts are "viral" (liked by all users)
    const likerCount = i < 20 ? users.length : (i % 8) + 1;

    for (let u = 0; u < likerCount && u < users.length; u++) {
      likeDocs.push({
        user: users[u]._id,
        post: post._id,
        createdAt: new Date(Date.now() - u * 30000),
      });

      if (u % 3 === 0) {
        saveDocs.push({
          user: users[u]._id,
          post: post._id,
          createdAt: new Date(Date.now() - u * 45000),
        });
      }

      if (u % 4 === 0) {
        commentDocs.push({
          author: users[u]._id,
          post: post._id,
          content: `Benchmark comment from user ${u} on post ${post._id}`,
          parentComment: null,
          createdAt: new Date(Date.now() - u * 60000),
        });
      }

      if (post.author.toString() !== users[u]._id.toString() && u % 5 === 0) {
        notifDocs.push({
          recipient: post.author,
          actor: users[u]._id,
          type: 'LIKE',
          post: post._id,
          isRead: u % 2 === 0,
          createdAt: new Date(Date.now() - u * 10000),
        });
      }
    }
  }

  await Promise.all([
    Like.insertMany(likeDocs, { ordered: false }).catch(() => {}),
    Save.insertMany(saveDocs, { ordered: false }).catch(() => {}),
    Comment.insertMany(commentDocs, { ordered: false }).catch(() => {}),
    Notification.insertMany(notifDocs, { ordered: false }).catch(() => {}),
  ]);

  console.log(
    `✅ [Seed] Inserted ${likeDocs.length} likes, ${saveDocs.length} saves, ${commentDocs.length} comments, ${notifDocs.length} notifications.`
  );

  // Update counts on Posts and Users
  console.log('🌱 [Seed] Updating denormalized counter aggregates...');
  for (const post of posts.slice(0, 50)) {
    const [likes, comments] = await Promise.all([
      Like.countDocuments({ post: post._id }),
      Comment.countDocuments({ post: post._id }),
    ]);
    await Post.updateOne({ _id: post._id }, { likesCount: likes, commentsCount: comments });
  }

  for (const user of users.slice(0, 20)) {
    const [followers, following] = await Promise.all([
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
    ]);
    await User.updateOne({ _id: user._id }, { followersCount: followers, followingCount: following });
  }

  console.log('🚀 [Seed] Performance test dataset ready!');
  return { users, posts };
};

export const cleanupPerformanceData = async () => {
  console.log('🧹 [Cleanup] Purging performance seed data...');
  const perfUsers = await User.find({ email: /@perfbench\.test$/ }).select('_id');
  const userIds = perfUsers.map((u) => u._id);

  await Promise.all([
    User.deleteMany({ _id: { $in: userIds } }),
    Post.deleteMany({ author: { $in: userIds } }),
    Follow.deleteMany({ $or: [{ follower: { $in: userIds } }, { following: { $in: userIds } }] }),
    Like.deleteMany({ user: { $in: userIds } }),
    Save.deleteMany({ user: { $in: userIds } }),
    Comment.deleteMany({ author: { $in: userIds } }),
    Notification.deleteMany({ $or: [{ recipient: { $in: userIds } }, { actor: { $in: userIds } }] }),
  ]);
  console.log('✅ [Cleanup] Performance seed data removed.');
};

if (process.argv[1] && process.argv[1].endsWith('seed_perf_data.js')) {
  (async () => {
    await mongoose.connect(config.mongoUri);
    if (process.argv.includes('--clean')) {
      await cleanupPerformanceData();
    } else {
      await seedPerformanceData();
    }
    await mongoose.connection.close();
    process.exit(0);
  })();
}

export default {
  seedPerformanceData,
  cleanupPerformanceData,
};
