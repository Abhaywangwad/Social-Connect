import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Notification from '../../src/models/Notification.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Integration: Notifications & Read State', () => {
  it('creates notification upon receiving a follow and suppresses self-notifications', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const loginA = await loginTestUser(userA);
    const loginB = await loginTestUser(userB);

    // 1. User A follows User B -> notification for User B
    await request(app)
      .post(`/api/users/${userB.username}/follow`)
      .set(loginA.authHeader);

    const bNotifications = await Notification.find({ recipient: userB._id });
    expect(bNotifications.length).toBe(1);
    expect(bNotifications[0].actor.toString()).toBe(userA._id.toString());
    expect(bNotifications[0].type).toBe('FOLLOW');

    // 2. Self-like suppression: User A creates a post and likes it
    const postA = await createTestPost(userA._id);
    await request(app)
      .post(`/api/posts/${postA._id}/like`)
      .set(loginA.authHeader);

    // Assert User A has NOT received a notification for liking own post
    const aNotifications = await Notification.find({ recipient: userA._id });
    expect(aNotifications.length).toBe(0);
  });

  it('retrieves notifications, checks unread count, and marks as read', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const loginB = await loginTestUser(userB);

    // Create 2 notifications directly for userB
    const n1 = await Notification.create({
      recipient: userB._id,
      actor: userA._id,
      type: 'FOLLOW',
      isRead: false,
    });
    const n2 = await Notification.create({
      recipient: userB._id,
      actor: userA._id,
      type: 'COMMENT',
      isRead: false,
    });

    // 1. Check unread count -> 2
    const countRes = await request(app)
      .get('/api/notifications/unread-count')
      .set(loginB.authHeader);

    expect(countRes.status).toBe(200);
    expect(countRes.body.data.unreadCount).toBe(2);

    // 2. Mark single notification as read
    const singleReadRes = await request(app)
      .patch(`/api/notifications/${n1._id}/read`)
      .set(loginB.authHeader);

    expect(singleReadRes.status).toBe(200);
    expect(singleReadRes.body.data.notification.isRead).toBe(true);

    const updatedCountRes = await request(app)
      .get('/api/notifications/unread-count')
      .set(loginB.authHeader);
    expect(updatedCountRes.body.data.unreadCount).toBe(1);

    // 3. Mark all as read
    const allReadRes = await request(app)
      .patch('/api/notifications/read-all')
      .set(loginB.authHeader);

    expect(allReadRes.status).toBe(200);

    const finalCountRes = await request(app)
      .get('/api/notifications/unread-count')
      .set(loginB.authHeader);
    expect(finalCountRes.body.data.unreadCount).toBe(0);
  });
});
