import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Post from '../../src/models/Post.js';
import Like from '../../src/models/Like.js';
import Save from '../../src/models/Save.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Integration: Likes & Saves', () => {
  describe('Post Like Toggle & Counter Bounds', () => {
    it('toggles post like on and off atomically, guarding counter non-negativity', async () => {
      const author = await createTestUser();
      const liker = await createTestUser();
      const likerLogin = await loginTestUser(liker);

      const post = await createTestPost(author._id, { likesCount: 0 });

      // 1. First like -> liked: true, likesCount: 1
      const likeRes = await request(app)
        .post(`/api/posts/${post._id}/like`)
        .set(likerLogin.authHeader);

      expect(likeRes.status).toBe(200);
      expect(likeRes.body.success).toBe(true);
      expect(likeRes.body.data.liked).toBe(true);

      const dbPostLiked = await Post.findById(post._id);
      expect(dbPostLiked.likesCount).toBe(1);
      expect(await Like.countDocuments({ user: liker._id, post: post._id })).toBe(1);

      // 2. Second toggle -> liked: false, likesCount: 0
      const unlikeRes = await request(app)
        .post(`/api/posts/${post._id}/like`)
        .set(likerLogin.authHeader);

      expect(unlikeRes.status).toBe(200);
      expect(unlikeRes.body.data.liked).toBe(false);

      const dbPostUnliked = await Post.findById(post._id);
      expect(dbPostUnliked.likesCount).toBe(0);
      expect(await Like.countDocuments({ user: liker._id, post: post._id })).toBe(0);

      // 3. Ensure counter never drops below 0
      expect(dbPostUnliked.likesCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Post Bookmarking & Saves Collection', () => {
    it('saves a post, checks save status, lists saved posts, and unsaves', async () => {
      const author = await createTestUser();
      const saver = await createTestUser();
      const saverLogin = await loginTestUser(saver);

      const post = await createTestPost(author._id);

      // 1. Save post
      const saveRes = await request(app)
        .post(`/api/posts/${post._id}/save`)
        .set(saverLogin.authHeader);

      expect(saveRes.status).toBe(201);
      expect(saveRes.body.success).toBe(true);
      expect(await Save.countDocuments({ user: saver._id, post: post._id })).toBe(1);

      // 2. Check save status
      const statusRes = await request(app)
        .get(`/api/posts/${post._id}/save-status`)
        .set(saverLogin.authHeader);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.isSaved).toBe(true);

      // 3. List saved posts
      const listRes = await request(app)
        .get('/api/users/me/saved-posts')
        .set(saverLogin.authHeader);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.posts.length).toBeGreaterThanOrEqual(1);

      // 4. Unsave post
      const unsaveRes = await request(app)
        .delete(`/api/posts/${post._id}/save`)
        .set(saverLogin.authHeader);

      expect(unsaveRes.status).toBe(200);
      expect(await Save.countDocuments({ user: saver._id, post: post._id })).toBe(0);
    });
  });
});
