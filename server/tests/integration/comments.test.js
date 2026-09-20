import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Comment from '../../src/models/Comment.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Integration: Comments & Threaded Replies', () => {
  it('creates a top-level comment on a post and lists comments', async () => {
    const author = await createTestUser();
    const commenter = await createTestUser();
    const commenterLogin = await loginTestUser(commenter);

    const post = await createTestPost(author._id);

    // Create comment
    const res = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(commenterLogin.authHeader)
      .send({ content: 'This is an awesome post!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.comment.content).toBe('This is an awesome post!');

    // List comments
    const listRes = await request(app).get(`/api/posts/${post._id}/comments`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.comments.length).toBe(1);
    expect(listRes.body.data.comments[0].content).toBe('This is an awesome post!');
  });

  it('creates and lists threaded replies under a comment', async () => {
    const author = await createTestUser();
    const userA = await createTestUser();
    const userB = await createTestUser();
    const userALogin = await loginTestUser(userA);
    const userBLogin = await loginTestUser(userB);

    const post = await createTestPost(author._id);

    // Top-level comment by userA
    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(userALogin.authHeader)
      .send({ content: 'Initial thought' });
    const commentId = commentRes.body.data.comment._id;

    // Reply by userB
    const replyRes = await request(app)
      .post(`/api/comments/${commentId}/replies`)
      .set(userBLogin.authHeader)
      .send({ content: 'I totally agree with this!' });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.data.reply.content).toBe('I totally agree with this!');

    // List replies
    const listRepliesRes = await request(app).get(`/api/comments/${commentId}/replies`);
    expect(listRepliesRes.status).toBe(200);
    expect(listRepliesRes.body.data.replies.length).toBe(1);
    expect(listRepliesRes.body.data.replies[0].content).toBe('I totally agree with this!');
  });

  it('allows author to edit comment and forbids strangers', async () => {
    const author = await createTestUser();
    const stranger = await createTestUser();
    const authorLogin = await loginTestUser(author);
    const strangerLogin = await loginTestUser(stranger);

    const post = await createTestPost(author._id);

    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(authorLogin.authHeader)
      .send({ content: 'Before edit' });
    const commentId = commentRes.body.data.comment._id;

    // Stranger cannot edit -> 403
    const forbiddenRes = await request(app)
      .patch(`/api/comments/${commentId}`)
      .set(strangerLogin.authHeader)
      .send({ content: 'Hacked comment' });
    expect(forbiddenRes.status).toBe(403);

    // Author can edit -> 200
    const editRes = await request(app)
      .patch(`/api/comments/${commentId}`)
      .set(authorLogin.authHeader)
      .send({ content: 'After edit' });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.comment.content).toBe('After edit');
  });

  it('allows post owner or comment author to delete comment, but forbids strangers', async () => {
    const postOwner = await createTestUser();
    const commentAuthor = await createTestUser();
    const stranger = await createTestUser();

    const postOwnerLogin = await loginTestUser(postOwner);
    const commentAuthorLogin = await loginTestUser(commentAuthor);
    const strangerLogin = await loginTestUser(stranger);

    const post = await createTestPost(postOwner._id);

    // Create comment
    const commentRes = await request(app)
      .post(`/api/posts/${post._id}/comments`)
      .set(commentAuthorLogin.authHeader)
      .send({ content: 'To be deleted' });
    const commentId = commentRes.body.data.comment._id;

    // Stranger cannot delete -> 403
    const strangerDelete = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set(strangerLogin.authHeader);
    expect(strangerDelete.status).toBe(403);

    // Post owner can delete -> 200
    const ownerDelete = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set(postOwnerLogin.authHeader);
    expect(ownerDelete.status).toBe(200);

    expect(await Comment.findById(commentId)).toBeNull();
  });
});
