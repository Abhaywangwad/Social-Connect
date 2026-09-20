import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
import Like from '../../src/models/Like.js';
import Follow from '../../src/models/Follow.js';
import Message from '../../src/models/Message.js';
import feedService from '../../src/services/feedService.js';
import postService from '../../src/services/postService.js';
import { reconcileCounters } from '../../scripts/reconcile-counters.js';

describe('Performance, Query Optimization & Architecture Regressions', () => {
  let userA;
  let userB;

  beforeEach(async () => {
    userA = await User.create({
      username: `perf_user_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: `perf_a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      password: 'Password123!',
      fullName: 'Perf User A',
    });

    userB = await User.create({
      username: `perf_user_b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: `perf_b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      password: 'Password123!',
      fullName: 'Perf User B',
    });
  });

  describe('1. Query Plan & Index Coverage Validation (.explain)', () => {
    it('feed query utilizes compound index without in-memory sort stage', async () => {
      await Post.create({
        author: userA._id,
        caption: 'Post for feed query test',
        moderationStatus: 'ACTIVE',
      });

      const authorIds = [userA._id, userB._id];
      const query = Post.find({
        author: { $in: authorIds },
        moderationStatus: 'ACTIVE',
      }).sort({ createdAt: -1, _id: -1 }).limit(20);

      const explanation = await query.explain('executionStats');
      const winningPlan = explanation.queryPlanner?.winningPlan || {};
      const planStr = JSON.stringify(winningPlan);

      expect(planStr).toContain('IXSCAN');
      expect(winningPlan.stage).not.toBe('SORT');
    });

    it('user search query utilizes index scan on username', async () => {
      const query = User.find({
        accountStatus: 'ACTIVE',
        username: { $regex: '^perf_user' },
      }).sort({ username: 1, _id: 1 }).limit(20);

      const explanation = await query.explain('executionStats');
      const planStr = JSON.stringify(explanation.queryPlanner?.winningPlan || {});

      expect(planStr).toContain('IXSCAN');
    });

    it('conversation message history uses compound index (conversation, createdAt, _id)', async () => {
      const dummyConvId = new mongoose.Types.ObjectId();
      const query = Message.find({
        conversation: dummyConvId,
      }).sort({ createdAt: -1, _id: -1 }).limit(30);

      const explanation = await query.explain('executionStats');
      const planStr = JSON.stringify(explanation.queryPlanner?.winningPlan || {});

      expect(planStr).toContain('IXSCAN');
      expect(explanation.queryPlanner?.winningPlan?.stage).not.toBe('SORT');
    });
  });

  describe('2. Deterministic Compound Cursor Pagination', () => {
    it('maintains strict pagination boundaries with identical createdAt timestamps', async () => {
      const fixedTimestamp = new Date('2026-01-01T12:00:00.000Z');
      const insertedPosts = [];

      for (let i = 0; i < 5; i++) {
        const p = await Post.create({
          author: userA._id,
          caption: `Tie breaker test post #${i}`,
          moderationStatus: 'ACTIVE',
          createdAt: fixedTimestamp,
          updatedAt: fixedTimestamp,
        });
        insertedPosts.push(p);
      }

      // Page 1: limit 2
      const page1 = await feedService.getFeedCandidates([userA._id], {
        limit: 2,
        cursor: null,
      });
      expect(page1.length).toBeGreaterThanOrEqual(2);
      const p1Items = page1.slice(0, 2);

      const cursor1 = feedService.encodeCursor({
        createdAt: p1Items[1].createdAt,
        id: p1Items[1]._id,
      });

      // Page 2: limit 2 using cursor1
      const page2 = await feedService.getFeedCandidates([userA._id], {
        limit: 2,
        cursor: cursor1,
      });
      const p2Items = page2.slice(0, 2);

      // Assert: No overlap between Page 1 and Page 2
      const p1Ids = new Set(p1Items.map((p) => p._id.toString()));
      for (const item of p2Items) {
        expect(p1Ids.has(item._id.toString())).toBe(false);
      }

      // Assert: IDs in Page 2 are strictly smaller than cursor tie-breaker
      for (const item of p2Items) {
        expect(item._id.toString() < p1Items[1]._id.toString()).toBe(true);
      }
    });
  });

  describe('3. Concurrency & Like Race Condition Resilience', () => {
    it('handles concurrent like requests gracefully without throwing duplicate key errors', async () => {
      const testPostForLike = await Post.create({
        author: userB._id,
        caption: 'Post for concurrent like test',
        moderationStatus: 'ACTIVE',
      });

      // Trigger simultaneous like attempts from the same user on the same post
      const [res1, res2] = await Promise.allSettled([
        postService.toggleLikePost(testPostForLike._id.toString(), userA._id.toString()),
        postService.toggleLikePost(testPostForLike._id.toString(), userA._id.toString()),
      ]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('fulfilled');

      const likeCount = await Like.countDocuments({
        user: userA._id,
        post: testPostForLike._id,
      });
      expect(likeCount).toBe(1);
    });
  });

  describe('4. Counter Reconciliation Utility', () => {
    it('detects induced counter drift in dry-run mode and fixes it in repair mode', async () => {
      // 1. Artificially corrupt user followersCount & followingCount
      await User.updateOne(
        { _id: userA._id },
        { $set: { followersCount: 999, followingCount: 888 } }
      );

      // 2. Run reconciliation in dry-run mode
      const dryRunReport = await reconcileCounters({ fix: false });
      const userMismatch = dryRunReport.mismatches.find(
        (m) => m.entity === 'User' && m.id === userA._id.toString()
      );

      expect(userMismatch).toBeDefined();
      expect(dryRunReport.users.repaired).toBe(0);

      // 3. Run reconciliation in repair mode
      const repairReport = await reconcileCounters({ fix: true });
      expect(repairReport.users.repaired).toBeGreaterThan(0);

      // 4. Verify user counter is restored to actual source-of-truth count (0)
      const refreshedUser = await User.findById(userA._id).lean();
      expect(refreshedUser.followersCount).toBe(0);
      expect(refreshedUser.followingCount).toBe(0);
    });
  });
});
