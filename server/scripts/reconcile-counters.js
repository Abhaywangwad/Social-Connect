#!/usr/bin/env node
/**
 * server/scripts/reconcile-counters.js
 *
 * Database Counter Reconciliation Utility
 * Compares denormalized cached counters with authoritative source collections:
 *   - User.followersCount vs Follow(following)
 *   - User.followingCount vs Follow(follower)
 *   - Post.likesCount     vs Like(post)
 *   - Post.commentsCount  vs Comment(post)
 *   - Comment.repliesCount vs Comment(parentComment)
 *
 * Modes:
 *   - Dry Run (default): Reports all discrepancies without mutating data.
 *   - Repair Mode (--fix or --repair): Applies atomic corrections to drift counters.
 */

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve environment configuration
const envTestPath = path.resolve(__dirname, '../.env.test');
const envPath = path.resolve(__dirname, '../.env');

if (process.env.NODE_ENV === 'test' && fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import User from '../src/models/User.js';
import Follow from '../src/models/Follow.js';
import Post from '../src/models/Post.js';
import Like from '../src/models/Like.js';
import Comment from '../src/models/Comment.js';

/**
 * Executes counter audit and optional reconciliation.
 *
 * @param {Object} options
 * @param {boolean} [options.fix=false] If true, repairs drifting counters.
 * @param {boolean} [options.verbose=false] If true, logs every matched record.
 * @returns {Promise<Object>} Reconciliation summary report
 */
export async function reconcileCounters({ fix = false, verbose = false } = {}) {
  const isSelfConnected = mongoose.connection.readyState === 0;

  if (isSelfConnected) {
    const mongoUri =
      process.env.MONGODB_URI ||
      (process.env.NODE_ENV === 'test'
        ? 'mongodb://localhost:27017/social-connect-test'
        : 'mongodb://localhost:27017/social-connect');

    await mongoose.connect(mongoUri);
  }

  const results = {
    mode: fix ? 'REPAIR' : 'DRY_RUN',
    timestamp: new Date().toISOString(),
    users: { total: 0, followerMismatches: 0, followingMismatches: 0, repaired: 0 },
    posts: { total: 0, likesMismatches: 0, commentsMismatches: 0, repaired: 0 },
    comments: { total: 0, repliesMismatches: 0, repaired: 0 },
    mismatches: [],
  };

  try {
    // ── 1. Reconcile Users (followersCount, followingCount) ──────────────────
    const users = await User.find({}).select('_id username followersCount followingCount').lean();
    results.users.total = users.length;

    for (const user of users) {
      const [actualFollowers, actualFollowing] = await Promise.all([
        Follow.countDocuments({ following: user._id }),
        Follow.countDocuments({ follower: user._id }),
      ]);

      const storedFollowers = user.followersCount || 0;
      const storedFollowing = user.followingCount || 0;

      let needsUpdate = false;
      const updates = {};

      if (storedFollowers !== actualFollowers) {
        results.users.followerMismatches += 1;
        results.mismatches.push({
          entity: 'User',
          id: user._id.toString(),
          identifier: `@${user.username}`,
          field: 'followersCount',
          stored: storedFollowers,
          actual: actualFollowers,
        });
        updates.followersCount = actualFollowers;
        needsUpdate = true;
      }

      if (storedFollowing !== actualFollowing) {
        results.users.followingMismatches += 1;
        results.mismatches.push({
          entity: 'User',
          id: user._id.toString(),
          identifier: `@${user.username}`,
          field: 'followingCount',
          stored: storedFollowing,
          actual: actualFollowing,
        });
        updates.followingCount = actualFollowing;
        needsUpdate = true;
      }

      if (fix && needsUpdate) {
        await User.updateOne({ _id: user._id }, { $set: updates });
        results.users.repaired += 1;
      }
    }

    // ── 2. Reconcile Posts (likesCount, commentsCount) ───────────────────────
    const posts = await Post.find({}).select('_id likesCount commentsCount author').lean();
    results.posts.total = posts.length;

    for (const post of posts) {
      const [actualLikes, actualComments] = await Promise.all([
        Like.countDocuments({ post: post._id }),
        Comment.countDocuments({ post: post._id }),
      ]);

      const storedLikes = post.likesCount || 0;
      const storedComments = post.commentsCount || 0;

      let needsUpdate = false;
      const updates = {};

      if (storedLikes !== actualLikes) {
        results.posts.likesMismatches += 1;
        results.mismatches.push({
          entity: 'Post',
          id: post._id.toString(),
          field: 'likesCount',
          stored: storedLikes,
          actual: actualLikes,
        });
        updates.likesCount = actualLikes;
        needsUpdate = true;
      }

      if (storedComments !== actualComments) {
        results.posts.commentsMismatches += 1;
        results.mismatches.push({
          entity: 'Post',
          id: post._id.toString(),
          field: 'commentsCount',
          stored: storedComments,
          actual: actualComments,
        });
        updates.commentsCount = actualComments;
        needsUpdate = true;
      }

      if (fix && needsUpdate) {
        await Post.updateOne({ _id: post._id }, { $set: updates });
        results.posts.repaired += 1;
      }
    }

    // ── 3. Reconcile Top-Level Comments (repliesCount) ───────────────────────
    const topLevelComments = await Comment.find({ parentComment: null })
      .select('_id repliesCount post')
      .lean();
    results.comments.total = topLevelComments.length;

    for (const comment of topLevelComments) {
      const actualReplies = await Comment.countDocuments({ parentComment: comment._id });
      const storedReplies = comment.repliesCount || 0;

      if (storedReplies !== actualReplies) {
        results.comments.repliesMismatches += 1;
        results.mismatches.push({
          entity: 'Comment',
          id: comment._id.toString(),
          field: 'repliesCount',
          stored: storedReplies,
          actual: actualReplies,
        });

        if (fix) {
          await Comment.updateOne({ _id: comment._id }, { $set: { repliesCount: actualReplies } });
          results.comments.repaired += 1;
        }
      }
    }
  } finally {
    if (isSelfConnected) {
      await mongoose.disconnect();
    }
  }

  return results;
}

// CLI Execution Handler
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isFix = process.argv.includes('--fix') || process.argv.includes('--repair');
  const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  console.log('===============================================================');
  console.log(`  Social Connect: Counter Reconciliation (${isFix ? 'REPAIR' : 'DRY-RUN'})  `);
  console.log('===============================================================');

  reconcileCounters({ fix: isFix, verbose: isVerbose })
    .then((report) => {
      console.log(`\nAudit Complete at ${report.timestamp}:`);
      console.log(`- Users audited:    ${report.users.total} (Mismatches: followers=${report.users.followerMismatches}, following=${report.users.followingMismatches})`);
      console.log(`- Posts audited:    ${report.posts.total} (Mismatches: likes=${report.posts.likesMismatches}, comments=${report.posts.commentsMismatches})`);
      console.log(`- Comments audited: ${report.comments.total} (Mismatches: replies=${report.comments.repliesMismatches})`);

      if (report.mismatches.length === 0) {
        console.log('\nSUCCESS: All denormalized counters are 100% in sync with source records.');
      } else {
        console.log(`\nWARNING: Found ${report.mismatches.length} counter discrepancy/discrepancies:`);
        for (const m of report.mismatches) {
          console.log(`  - [${m.entity}] ${m.id} (${m.identifier || ''}): ${m.field} stored=${m.stored} -> actual=${m.actual}`);
        }

        if (isFix) {
          console.log(`\nREPAIR APPLIED: Successfully corrected discrepancies.`);
        } else {
          console.log(`\nNOTE: Run with --fix or --repair to apply corrections.`);
        }
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal reconciliation error:', err);
      process.exit(1);
    });
}
