import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
import Like from '../../src/models/Like.js';
import Save from '../../src/models/Save.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost, createTestComment } from '../helpers/entityHelper.js';
import { _setCustomMediaHandlers, _resetCustomMediaHandlers } from '../../src/services/mediaService.js';
import { VALID_JPEG_BUFFER } from '../fixtures/dummyImages.js';

describe('Integration: Posts & Media Cascade', () => {
  beforeEach(() => {
    _setCustomMediaHandlers(
      async (buf, opts) => ({
        type: 'image',
        url: 'https://res.cloudinary.com/mock/image/upload/v1/test_post.jpg',
        publicId: 'test_post_public_id',
        width: 800,
        height: 800,
      }),
      async (publicId) => ({ result: 'ok' })
    );
  });

  afterEach(() => {
    _resetCustomMediaHandlers();
  });

  it('creates a new post with uploaded media and caption', async () => {
    const user = await createTestUser();
    const loginData = await loginTestUser(user);

    const res = await request(app)
      .post('/api/posts')
      .set(loginData.authHeader)
      .field('caption', 'Sunset at the beach')
      .attach('media', VALID_JPEG_BUFFER, 'sunset.jpg');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.post.caption).toBe('Sunset at the beach');
    expect(res.body.data.post.media.length).toBe(1);
    expect(res.body.data.post.author._id || res.body.data.post.author).toBeDefined();
  });

  it('retrieves post details by ID', async () => {
    const user = await createTestUser();
    const post = await createTestPost(user._id, { caption: 'Public post' });

    const res = await request(app).get(`/api/posts/${post._id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.post.caption).toBe('Public post');
  });

  it('allows author to update post caption but forbids non-authors (IDOR prevention)', async () => {
    const owner = await createTestUser();
    const otherUser = await createTestUser();
    const post = await createTestPost(owner._id, { caption: 'Original' });

    const ownerLogin = await loginTestUser(owner);
    const otherLogin = await loginTestUser(otherUser);

    // Non-owner attempt -> 403 Forbidden
    const forbiddenRes = await request(app)
      .patch(`/api/posts/${post._id}`)
      .set(otherLogin.authHeader)
      .send({ caption: 'Malicious modification' });
    expect(forbiddenRes.status).toBe(403);

    // Owner attempt -> 200 OK
    const ownerRes = await request(app)
      .patch(`/api/posts/${post._id}`)
      .set(ownerLogin.authHeader)
      .send({ caption: 'Updated by owner' });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.post.caption).toBe('Updated by owner');
  });

  it('deletes post and cascades cleanup of associated likes, saves, and comments', async () => {
    const owner = await createTestUser();
    const userB = await createTestUser();
    const ownerLogin = await loginTestUser(owner);

    const post = await createTestPost(owner._id);

    // Create associated like, save, and comment
    await Like.create({ user: userB._id, post: post._id });
    await Save.create({ user: userB._id, post: post._id });
    await createTestComment(post._id, userB._id, 'Awesome shot!');

    // Verify records exist before deletion
    expect(await Like.countDocuments({ post: post._id })).toBe(1);
    expect(await Save.countDocuments({ post: post._id })).toBe(1);
    expect(await Comment.countDocuments({ post: post._id })).toBe(1);

    // Delete post
    const deleteRes = await request(app)
      .delete(`/api/posts/${post._id}`)
      .set(ownerLogin.authHeader);
    expect(deleteRes.status).toBe(200);

    // Verify cascade deletion wiped child records
    expect(await Post.findById(post._id)).toBeNull();
    expect(await Like.countDocuments({ post: post._id })).toBe(0);
    expect(await Save.countDocuments({ post: post._id })).toBe(0);
    expect(await Comment.countDocuments({ post: post._id })).toBe(0);
  });
});
