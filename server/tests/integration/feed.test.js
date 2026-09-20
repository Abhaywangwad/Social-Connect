import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Follow from '../../src/models/Follow.js';
import Block from '../../src/models/Block.js';
import Like from '../../src/models/Like.js';
import Save from '../../src/models/Save.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Integration: Home Feed & Cursor Pagination', () => {
  it('aggregates feed with own posts and followed posts, excluding unfollowed and blocked users', async () => {
    const userMe = await createTestUser({ username: 'feed_me' });
    const userFollowed = await createTestUser({ username: 'feed_followed' });
    const userUnfollowed = await createTestUser({ username: 'feed_unfollowed' });
    const userBlocked = await createTestUser({ username: 'feed_blocked' });

    const meLogin = await loginTestUser(userMe);

    // Follow userFollowed and userBlocked
    await Follow.create({ follower: userMe._id, following: userFollowed._id });
    await Follow.create({ follower: userMe._id, following: userBlocked._id });

    // Block userBlocked
    await Block.create({ blocker: userMe._id, blocked: userBlocked._id });

    // Create posts
    const myPost = await createTestPost(userMe._id, { caption: 'My own post' });
    const followedPost = await createTestPost(userFollowed._id, { caption: 'Followed post' });
    const unfollowedPost = await createTestPost(userUnfollowed._id, { caption: 'Unfollowed post' });
    const blockedPost = await createTestPost(userBlocked._id, { caption: 'Blocked post' });

    const res = await request(app)
      .get('/api/feed')
      .set(meLogin.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const postIds = res.body.data.posts.map((p) => p._id.toString());
    expect(postIds).toContain(myPost._id.toString());
    expect(postIds).toContain(followedPost._id.toString());
    expect(postIds).not.toContain(unfollowedPost._id.toString());
    expect(postIds).not.toContain(blockedPost._id.toString());
  });

  it('filters out HIDDEN and REMOVED posts from feed', async () => {
    const user = await createTestUser();
    const login = await loginTestUser(user);

    await createTestPost(user._id, { caption: 'Active Post', moderationStatus: 'ACTIVE' });
    await createTestPost(user._id, { caption: 'Hidden Post', moderationStatus: 'HIDDEN' });
    await createTestPost(user._id, { caption: 'Removed Post', moderationStatus: 'REMOVED' });

    const res = await request(app)
      .get('/api/feed')
      .set(login.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.posts.length).toBe(1);
    expect(res.body.data.posts[0].caption).toBe('Active Post');
  });

  it('paginates deterministically using compound cursor without duplicate items', async () => {
    const user = await createTestUser();
    const login = await loginTestUser(user);

    // Create 5 posts in sequence
    for (let i = 1; i <= 5; i++) {
      await createTestPost(user._id, { caption: `Numbered Post ${i}` });
      // Small delay to ensure timestamp progression
      await new Promise((r) => setTimeout(r, 10));
    }

    // Request page 1 with limit=2
    const page1Res = await request(app)
      .get('/api/feed?limit=2')
      .set(login.authHeader);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data.posts.length).toBe(2);
    expect(page1Res.body.data.pagination.nextCursor).toBeDefined();

    const cursor = page1Res.body.data.pagination.nextCursor;

    // Request page 2 with cursor
    const page2Res = await request(app)
      .get(`/api/feed?limit=2&cursor=${cursor}`)
      .set(login.authHeader);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data.posts.length).toBe(2);

    // Assert no duplicate IDs between page 1 and page 2
    const page1Ids = new Set(page1Res.body.data.posts.map((p) => p._id.toString()));
    const page2Ids = page2Res.body.data.posts.map((p) => p._id.toString());
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it('populates personalized isLiked and isSaved fields for authenticated user', async () => {
    const user = await createTestUser();
    const login = await loginTestUser(user);

    const postLiked = await createTestPost(user._id, { caption: 'Liked Post' });
    const postSaved = await createTestPost(user._id, { caption: 'Saved Post' });
    const postNeither = await createTestPost(user._id, { caption: 'Plain Post' });

    await Like.create({ user: user._id, post: postLiked._id });
    await Save.create({ user: user._id, post: postSaved._id });

    const res = await request(app)
      .get('/api/feed')
      .set(login.authHeader);

    expect(res.status).toBe(200);

    const posts = res.body.data.posts;
    const foundLiked = posts.find((p) => p._id.toString() === postLiked._id.toString());
    const foundSaved = posts.find((p) => p._id.toString() === postSaved._id.toString());
    const foundNeither = posts.find((p) => p._id.toString() === postNeither._id.toString());

    expect(foundLiked.isLiked).toBe(true);
    expect(foundLiked.isSaved).toBe(false);

    expect(foundSaved.isLiked).toBe(false);
    expect(foundSaved.isSaved).toBe(true);

    expect(foundNeither.isLiked).toBe(false);
    expect(foundNeither.isSaved).toBe(false);
  });
});
