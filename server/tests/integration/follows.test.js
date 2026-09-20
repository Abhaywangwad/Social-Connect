import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Follow from '../../src/models/Follow.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';

describe('Integration: Follow System & Counters', () => {
  it('follows a user, updates counters, and checks follow status', async () => {
    const userA = await createTestUser({ username: 'follower_a' });
    const userB = await createTestUser({ username: 'following_b' });
    const loginA = await loginTestUser(userA);

    // 1. Follow User B
    const followRes = await request(app)
      .post(`/api/users/${userB.username}/follow`)
      .set(loginA.authHeader);

    expect(followRes.status).toBe(200);
    expect(followRes.body.success).toBe(true);

    // 2. Check follow status
    const statusRes = await request(app)
      .get(`/api/users/${userB.username}/follow-status`)
      .set(loginA.authHeader);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.isFollowing).toBe(true);

    // 3. Verify counters in DB
    const dbUserA = await User.findById(userA._id);
    const dbUserB = await User.findById(userB._id);
    expect(dbUserA.followingCount).toBe(1);
    expect(dbUserB.followersCount).toBe(1);

    // 4. Followers & following lists
    const followersRes = await request(app)
      .get(`/api/users/${userB.username}/followers`);
    expect(followersRes.status).toBe(200);
    expect(followersRes.body.data.users.some((u) => u.username === userA.username)).toBe(true);

    const followingRes = await request(app)
      .get(`/api/users/${userA.username}/following`);
    expect(followingRes.status).toBe(200);
    expect(followingRes.body.data.users.some((u) => u.username === userB.username)).toBe(true);

    // 5. Unfollow
    const unfollowRes = await request(app)
      .delete(`/api/users/${userB.username}/follow`)
      .set(loginA.authHeader);
    expect(unfollowRes.status).toBe(200);

    const dbUserAAfter = await User.findById(userA._id);
    const dbUserBAfter = await User.findById(userB._id);
    expect(dbUserAAfter.followingCount).toBe(0);
    expect(dbUserBAfter.followersCount).toBe(0);
  });

  it('rejects self-follow attempt', async () => {
    const user = await createTestUser({ username: 'selffollower' });
    const login = await loginTestUser(user);

    const res = await request(app)
      .post(`/api/users/${user.username}/follow`)
      .set(login.authHeader);

    expect(res.status).toBe(400);
  });

  it('rejects duplicate follow attempts gracefully', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const loginA = await loginTestUser(userA);

    // First follow
    await request(app)
      .post(`/api/users/${userB.username}/follow`)
      .set(loginA.authHeader);

    // Duplicate follow attempt
    const dupRes = await request(app)
      .post(`/api/users/${userB.username}/follow`)
      .set(loginA.authHeader);

    expect(dupRes.status).toBe(409);
  });
});
