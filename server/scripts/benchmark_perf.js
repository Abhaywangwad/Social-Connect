import mongoose from 'mongoose';
import config from '../src/config/config.js';
import User from '../src/models/User.js';
import Post from '../src/models/Post.js';
import Follow from '../src/models/Follow.js';
import Like from '../src/models/Like.js';
import Comment from '../src/models/Comment.js';
import Save from '../src/models/Save.js';
import Notification from '../src/models/Notification.js';
import { seedPerformanceData, cleanupPerformanceData } from './seed_perf_data.js';

/**
 * Extracts execution stats and winning plan stages from a Mongoose/MongoDB explain output.
 */
const extractPlanSummary = (explainResult) => {
  // countDocuments().explain() wraps executionStats under executionStats.executionStages
  // Regular find().explain() exposes executionStats directly
  const stats = explainResult.executionStats || {};
  const execStages = stats.executionStages || {};

  const nReturned = stats.nReturned ?? execStages.nReturned;
  const totalDocsExamined = stats.totalDocsExamined ?? execStages.docsExamined;
  const totalKeysExamined = stats.totalKeysExamined ?? execStages.keysExamined;
  const executionTimeMillis = stats.executionTimeMillis;

  const queryPlanner = explainResult.queryPlanner || {};
  const winningPlan = queryPlanner.winningPlan || {};

  // Collect all plan stage names (handles SORT_MERGE with multiple inputStages)
  const stages = [];
  const indexNames = [];
  const inspectStage = (stage) => {
    if (!stage) return;
    if (stage.stage) stages.push(stage.stage);
    if (stage.indexName) indexNames.push(stage.indexName);
    if (stage.inputStage) inspectStage(stage.inputStage);
    if (stage.inputStages) stage.inputStages.forEach(inspectStage);
  };
  inspectStage(winningPlan);

  // For SORT_MERGE plans, report count of indexes used instead of 'NONE'
  const indexDisplay =
    indexNames.length === 1
      ? indexNames[0]
      : indexNames.length > 1
        ? `SORT_MERGE(${indexNames.length} indexes)`
        : winningPlan.inputStage?.indexName || winningPlan.indexName || 'NONE';

  return {
    executionTimeMillis,
    nReturned,
    totalDocsExamined,
    totalKeysExamined,
    stages: stages.join(' -> '),
    indexName: indexDisplay,
    hasCollscan: stages.includes('COLLSCAN'),
    hasSortStage: stages.includes('SORT'),
  };
};

export const runBenchmarks = async () => {
  console.log('====================================================');
  console.log('📊 EXECUTING MONGODB QUERY PERFORMANCE AUDIT');
  console.log('====================================================\n');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.mongoUri);
  }

  // Ensure test seed data exists
  let users = await User.find({ email: /@perfbench\.test$/ }).limit(10);
  if (users.length < 5) {
    console.log('⚡ Generating benchmark dataset...');
    const seed = await seedPerformanceData({ userCount: 40, postCount: 300 });
    users = seed.users;
  }

  const userA = users[0];
  const userB = users[1];

  const results = [];

  // ─── QUERY 1: Home Feed Retrieval ──────────────────────────────────────────
  console.log('🔍 [1/7] Analyzing Home Feed Query Plan...');
  // Find users followed by userA
  const follows = await Follow.find({ follower: userA._id }).select('following');
  const followedIds = follows.map((f) => f.following);
  const authorIds = [...followedIds, userA._id];

  const feedExplain = await Post.find({
    author: { $in: authorIds },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(20)
    .explain('executionStats');

  const feedSummary = extractPlanSummary(feedExplain);
  results.push({
    endpoint: 'GET /api/feed',
    query: 'Post.find({ author: { $in: authorIds } }).sort({ createdAt: -1, _id: -1 })',
    index: feedSummary.indexName,
    stages: feedSummary.stages,
    nReturned: feedSummary.nReturned,
    docsExamined: feedSummary.totalDocsExamined,
    keysExamined: feedSummary.totalKeysExamined,
    executionTimeMs: feedSummary.executionTimeMillis,
    hasSortStage: feedSummary.hasSortStage,
  });

  // ─── QUERY 2: User Following List with Sort ────────────────────────────────
  console.log('🔍 [2/7] Analyzing Following List Query Plan...');
  const followingExplain = await Follow.find({
    follower: userA._id,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain('executionStats');

  const followingSummary = extractPlanSummary(followingExplain);
  results.push({
    endpoint: 'GET /api/users/:username/following',
    query: 'Follow.find({ follower }).sort({ createdAt: -1 })',
    index: followingSummary.indexName,
    stages: followingSummary.stages,
    nReturned: followingSummary.nReturned,
    docsExamined: followingSummary.totalDocsExamined,
    keysExamined: followingSummary.totalKeysExamined,
    executionTimeMs: followingSummary.executionTimeMillis,
    hasSortStage: followingSummary.hasSortStage,
  });

  // ─── QUERY 3: User Search by Prefix ─────────────────────────────────────────
  console.log('🔍 [3/7] Analyzing User Search Prefix Plan...');
  const searchExplain = await User.find({
    username: /^perf_user_0/,
  })
    .select('username fullName profilePicture isVerified')
    .limit(20)
    .explain('executionStats');

  const searchSummary = extractPlanSummary(searchExplain);
  results.push({
    endpoint: 'GET /api/users/search (prefix)',
    query: 'User.find({ username: /^perf_/ })',
    index: searchSummary.indexName,
    stages: searchSummary.stages,
    nReturned: searchSummary.nReturned,
    docsExamined: searchSummary.totalDocsExamined,
    keysExamined: searchSummary.totalKeysExamined,
    executionTimeMs: searchSummary.executionTimeMillis,
    hasSortStage: searchSummary.hasSortStage,
  });

  // ─── QUERY 4: Notification Listing & Unread Count ───────────────────────────
  console.log('🔍 [4/7] Analyzing Notifications List & Count Plan...');
  const notifExplain = await Notification.find({
    recipient: userA._id,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain('executionStats');

  const notifSummary = extractPlanSummary(notifExplain);
  results.push({
    endpoint: 'GET /api/notifications',
    query: 'Notification.find({ recipient }).sort({ createdAt: -1 })',
    index: notifSummary.indexName,
    stages: notifSummary.stages,
    nReturned: notifSummary.nReturned,
    docsExamined: notifSummary.totalDocsExamined,
    keysExamined: notifSummary.totalKeysExamined,
    executionTimeMs: notifSummary.executionTimeMillis,
    hasSortStage: notifSummary.hasSortStage,
  });

  // Note: countDocuments().explain() doesn't surface executionStats in the same
  // structure as find().explain() in the Node.js driver. Use find().select('_id')
  // to analyze the equivalent query plan (same index path, consistent stats format).
  const unreadExplain = await Notification.find({
    recipient: userA._id,
    isRead: false,
  })
    .select('_id')
    .lean()
    .explain('executionStats');

  const unreadSummary = extractPlanSummary(unreadExplain);
  results.push({
    endpoint: 'GET /api/notifications/unread-count',
    query: 'Notification.countDocuments({ recipient, isRead: false })',
    index: unreadSummary.indexName,
    stages: unreadSummary.stages,
    nReturned: unreadSummary.nReturned,
    docsExamined: unreadSummary.totalDocsExamined,
    keysExamined: unreadSummary.totalKeysExamined,
    executionTimeMs: unreadSummary.executionTimeMillis,
    hasSortStage: unreadSummary.hasSortStage,
  });

  // ─── QUERY 5: Top-Level Comments Listing ────────────────────────────────────
  console.log('🔍 [5/7] Analyzing Post Comments Plan...');
  const post = await Post.findOne();
  const commentExplain = await Comment.find({
    post: post._id,
    parentComment: null,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain('executionStats');

  const commentSummary = extractPlanSummary(commentExplain);
  results.push({
    endpoint: 'GET /api/posts/:id/comments',
    query: 'Comment.find({ post, parentComment: null }).sort({ createdAt: -1 })',
    index: commentSummary.indexName,
    stages: commentSummary.stages,
    nReturned: commentSummary.nReturned,
    docsExamined: commentSummary.totalDocsExamined,
    keysExamined: commentSummary.totalKeysExamined,
    executionTimeMs: commentSummary.executionTimeMillis,
    hasSortStage: commentSummary.hasSortStage,
  });

  // ─── QUERY 6: Batch Like State Check for Feed ───────────────────────────────
  console.log('🔍 [6/7] Analyzing Like Feed Bulk Check Plan...');
  const samplePosts = await Post.find().limit(20).select('_id');
  const samplePostIds = samplePosts.map((p) => p._id);

  const likeExplain = await Like.find({
    user: userA._id,
    post: { $in: samplePostIds },
  })
    .select('post')
    .explain('executionStats');

  const likeSummary = extractPlanSummary(likeExplain);
  results.push({
    endpoint: 'GET /api/feed (Like state batch check)',
    query: 'Like.find({ user, post: { $in: postIds } })',
    index: likeSummary.indexName,
    stages: likeSummary.stages,
    nReturned: likeSummary.nReturned,
    docsExamined: likeSummary.totalDocsExamined,
    keysExamined: likeSummary.totalKeysExamined,
    executionTimeMs: likeSummary.executionTimeMillis,
    hasSortStage: likeSummary.hasSortStage,
  });

  // ─── QUERY 7: Cascade Notification Cleanup on Comment Deletion ──────────────
  console.log('🔍 [7/7] Analyzing Cascade Notification Cleanup Plan...');
  const cascadeExplain = await Notification.find({
    comment: new mongoose.Types.ObjectId(),
  }).explain('executionStats');

  const cascadeSummary = extractPlanSummary(cascadeExplain);
  results.push({
    endpoint: 'DELETE /api/comments/:id (Cascade Notification Cleanup)',
    query: 'Notification.deleteMany({ comment: id })',
    index: cascadeSummary.indexName,
    stages: cascadeSummary.stages,
    nReturned: cascadeSummary.nReturned,
    docsExamined: cascadeSummary.totalDocsExamined,
    keysExamined: cascadeSummary.totalKeysExamined,
    executionTimeMs: cascadeSummary.executionTimeMillis,
    hasSortStage: cascadeSummary.hasSortStage,
  });

  // ─── PRINT SUMMARY TABLE ───────────────────────────────────────────────────
  console.log('\n========================================================================================');
  console.log('🏁 MEASURED QUERY PERFORMANCE SUMMARY TABLE');
  console.log('========================================================================================');
  console.table(
    results.map((r) => ({
      Endpoint: r.endpoint,
      Index: r.index,
      'nReturned / Examined': `${r.nReturned} / ${r.docsExamined}`,
      'Keys Examined': r.keysExamined,
      TimeMs: r.executionTimeMs,
      Stages: r.stages,
      'In-Memory Sort?': r.hasSortStage ? 'YES (SLOW)' : 'NO (OPTIMIZED)',
    }))
  );

  return results;
};

if (process.argv[1] && process.argv[1].endsWith('benchmark_perf.js')) {
  (async () => {
    try {
      await runBenchmarks();
    } catch (err) {
      console.error('Benchmark error:', err);
    } finally {
      await mongoose.connection.close();
      process.exit(0);
    }
  })();
}

export default runBenchmarks;
