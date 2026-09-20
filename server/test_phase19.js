import http from 'http';
import mongoose from 'mongoose';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { generateToken } from './src/utils/jwt.js';
import User from './src/models/User.js';
import Post from './src/models/Post.js';
import Comment from './src/models/Comment.js';
import Story from './src/models/Story.js';
import Follow from './src/models/Follow.js';
import Block from './src/models/Block.js';
import Report from './src/models/Report.js';
import Conversation from './src/models/Conversation.js';
import Message from './src/models/Message.js';

const TEST_PORT = 5059;
const API_URL = `http://localhost:${TEST_PORT}/api`;

let httpServer;
let userA, userB, userC;
let tokenA, tokenB, tokenC;
let postB, commentB, storyB;

const req = async (path, options = {}, token = null) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  return { status: response.status, data };
};

const runTests = async () => {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 19 VERIFICATION TEST SUITE');
  console.log('   User Blocking, User Reporting & Access Control');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  };

  try {
    await connectDB();
    httpServer = http.createServer(app);
    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));

    // Clean up collections for test users
    const testUsernames = ['phase19_alice', 'phase19_bob', 'phase19_charlie'];
    const existingUsers = await User.find({ username: { $in: testUsernames } });
    const userIds = existingUsers.map((u) => u._id);

    await Promise.all([
      User.deleteMany({ _id: { $in: userIds } }),
      Follow.deleteMany({ $or: [{ follower: { $in: userIds } }, { following: { $in: userIds } }] }),
      Block.deleteMany({ $or: [{ blocker: { $in: userIds } }, { blocked: { $in: userIds } }] }),
      Report.deleteMany({ reporter: { $in: userIds } }),
      Post.deleteMany({ author: { $in: userIds } }),
      Story.deleteMany({ author: { $in: userIds } }),
      Comment.deleteMany({ author: { $in: userIds } }),
      Conversation.deleteMany({ participants: { $in: userIds } }),
      Message.deleteMany({ sender: { $in: userIds } }),
    ]);

    // Create fresh test users
    userA = await User.create({
      username: 'phase19_alice',
      email: 'alice_p19@example.com',
      password: 'Password123!',
      fullName: 'Alice P19',
      followersCount: 0,
      followingCount: 0,
    });
    tokenA = generateToken({ userId: userA._id });

    userB = await User.create({
      username: 'phase19_bob',
      email: 'bob_p19@example.com',
      password: 'Password123!',
      fullName: 'Bob P19',
      followersCount: 0,
      followingCount: 0,
    });
    tokenB = generateToken({ userId: userB._id });

    userC = await User.create({
      username: 'phase19_charlie',
      email: 'charlie_p19@example.com',
      password: 'Password123!',
      fullName: 'Charlie P19',
      followersCount: 0,
      followingCount: 0,
    });
    tokenC = generateToken({ userId: userC._id });

    // Establish mutual follow relationships between Alice and Bob
    await Follow.create({ follower: userA._id, following: userB._id });
    await Follow.create({ follower: userB._id, following: userA._id });
    await User.findByIdAndUpdate(userA._id, { followersCount: 1, followingCount: 1 });
    await User.findByIdAndUpdate(userB._id, { followersCount: 1, followingCount: 1 });

    // Create some content for Bob
    postB = await Post.create({
      author: userB._id,
      caption: 'Bob post for phase 19 test',
      media: [],
    });

    commentB = await Comment.create({
      author: userB._id,
      post: postB._id,
      content: 'Bob comment on his post',
      parentComment: null,
    });

    storyB = await Story.create({
      author: userB._id,
      media: { url: 'https://example.com/story.jpg', publicId: 'test_p19_story' },
      caption: 'Bob active story',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    console.log('--- BLOCKING CORE FUNCTIONALITY TESTS ---');

    // Test 1: Alice blocks Bob
    const res1 = await req(`/users/${userB.username}/block`, { method: 'POST' }, tokenA);
    assert(
      res1.status === 200 && res1.data.success === true,
      'Test 1: Block user (Alice blocks Bob) returns 200 success',
      `Status: ${res1.status}, msg: ${res1.data?.message}`
    );

    // Test 2: Alice attempts self-block
    const res2 = await req(`/users/${userA.username}/block`, { method: 'POST' }, tokenA);
    assert(
      res2.status === 400 && res2.data.success === false,
      'Test 2: Self-block attempt returns 400 Bad Request',
      `Status: ${res2.status}`
    );

    // Test 3: Duplicate block attempt (Alice blocks Bob again)
    const res3 = await req(`/users/${userB.username}/block`, { method: 'POST' }, tokenA);
    assert(
      res3.status === 409 && res3.data.success === false,
      'Test 3: Duplicate block attempt returns 409 Conflict',
      `Status: ${res3.status}`
    );

    // Test 4: Block non-existent user
    const res4 = await req('/users/nonexistent_xyz_99/block', { method: 'POST' }, tokenA);
    assert(
      res4.status === 404 && res4.data.success === false,
      'Test 4: Block non-existent user returns 404 Not Found',
      `Status: ${res4.status}`
    );

    // Test 5: Follow cleanup: Alice -> Bob deleted & counters decremented
    const followAtoB = await Follow.findOne({ follower: userA._id, following: userB._id });
    const refreshedAlice = await User.findById(userA._id);
    assert(
      followAtoB === null && refreshedAlice.followingCount === 0,
      'Test 5: Follow cleanup (Alice -> Bob deleted and Alice followingCount decremented to 0)',
      `follow exists: ${!!followAtoB}, followingCount: ${refreshedAlice.followingCount}`
    );

    // Test 6: Follow cleanup: Bob -> Alice deleted & counters decremented
    const followBtoA = await Follow.findOne({ follower: userB._id, following: userA._id });
    const refreshedBob = await User.findById(userB._id);
    assert(
      followBtoA === null && refreshedBob.followingCount === 0 && refreshedBob.followersCount === 0,
      'Test 6: Follow cleanup (Bob -> Alice deleted and Bob follower/following counts decremented to 0)',
      `follow exists: ${!!followBtoA}, followersCount: ${refreshedBob.followersCount}`
    );

    // Test 7: Block status API for Alice (blocker) and Bob (blocked)
    const res7A = await req(`/users/${userB.username}/block-status`, { method: 'GET' }, tokenA);
    const res7B = await req(`/users/${userA.username}/block-status`, { method: 'GET' }, tokenB);
    assert(
      res7A.status === 200 &&
      res7A.data.data.isBlocked === true &&
      res7A.data.data.isBlockedByTarget === false &&
      res7B.status === 200 &&
      res7B.data.data.isBlocked === false &&
      res7B.data.data.isBlockedByTarget === true,
      'Test 7: Block status API returns accurate bilateral block flags for both users',
      `Alice: ${JSON.stringify(res7A.data?.data)}, Bob: ${JSON.stringify(res7B.data?.data)}`
    );

    // Test 8: Blocked users list API for Alice
    const res8 = await req('/users/me/blocked', { method: 'GET' }, tokenA);
    const blockedList = res8.data?.data?.users || [];
    const hasBob = blockedList.some((u) => u.username === userB.username);
    const hasSensitiveFields = blockedList.some((u) => u.password || u.email);
    assert(
      res8.status === 200 && hasBob && !hasSensitiveFields,
      'Test 8: GET /api/users/me/blocked returns paginated list with safe projections',
      `Status: ${res8.status}, count: ${blockedList.length}, hasSensitive: ${hasSensitiveFields}`
    );

    // Test 9: Unblock user (Alice unblocks Bob)
    const res9 = await req(`/users/${userB.username}/block`, { method: 'DELETE' }, tokenA);
    assert(
      res9.status === 200 && res9.data.success === true,
      'Test 9: Unblock user (Alice unblocks Bob) returns 200 success',
      `Status: ${res9.status}`
    );

    // Test 10: Unblock user who is not blocked
    const res10 = await req(`/users/${userB.username}/block`, { method: 'DELETE' }, tokenA);
    assert(
      res10.status === 400 && res10.data.success === false,
      'Test 10: Unblocking an unblocked user returns 400 Bad Request',
      `Status: ${res10.status}`
    );

    // Test 11: Follow relationships NOT restored after unblock
    const followCheck = await Follow.findOne({
      $or: [
        { follower: userA._id, following: userB._id },
        { follower: userB._id, following: userA._id },
      ],
    });
    const userAfterUnblock = await User.findById(userA._id);
    assert(
      followCheck === null && userAfterUnblock.followingCount === 0,
      'Test 11: Follow relationships NOT restored after unblocking',
      `Follow exists: ${!!followCheck}, followingCount: ${userAfterUnblock.followingCount}`
    );

    console.log('\n--- ACCESS CONTROL & INTEGRATION TESTS (RE-BLOCKING ALICE -> BOB) ---');

    // Re-block Bob for access-control testing
    await req(`/users/${userB.username}/block`, { method: 'POST' }, tokenA);

    // Test 12: Follow prevention while blocked
    const res12A = await req(`/users/${userB.username}/follow`, { method: 'POST' }, tokenA);
    const res12B = await req(`/users/${userA.username}/follow`, { method: 'POST' }, tokenB);
    assert(
      res12A.status === 403 && res12B.status === 403,
      'Test 12: Bilateral follow prevention returns 403 Forbidden',
      `A->B: ${res12A.status}, B->A: ${res12B.status}`
    );

    // Test 13: Home feed exclusion
    const res13A = await req('/feed', { method: 'GET' }, tokenA);
    const feedPostsA = res13A.data?.data?.posts || [];
    const bobInAliceFeed = feedPostsA.some((p) => p.author?.username === userB.username);
    assert(
      res13A.status === 200 && !bobInAliceFeed,
      'Test 13: Home feed excludes blocked author posts at database query level',
      `Bob post found: ${bobInAliceFeed}`
    );

    // Test 14: User search exclusion
    const res14A = await req(`/users/search?q=${userB.username}`, { method: 'GET' }, tokenA);
    const res14B = await req(`/users/search?q=${userA.username}`, { method: 'GET' }, tokenB);
    const searchUsersA = res14A.data?.data?.users || [];
    const searchUsersB = res14B.data?.data?.users || [];
    assert(
      res14A.status === 200 &&
      searchUsersA.length === 0 &&
      res14B.status === 200 &&
      searchUsersB.length === 0,
      'Test 14: Search excludes blocked users symmetrically',
      `A saw B: ${searchUsersA.length > 0}, B saw A: ${searchUsersB.length > 0}`
    );

    // Test 15: Profile access restriction (404 Not Found)
    const res15A = await req(`/users/${userB.username}`, { method: 'GET' }, tokenA);
    const res15B = await req(`/users/${userA.username}`, { method: 'GET' }, tokenB);
    assert(
      res15A.status === 404 && res15B.status === 404,
      'Test 15: Profile lookup returns 404 Not Found symmetrically when blocked',
      `A viewing B: ${res15A.status}, B viewing A: ${res15B.status}`
    );

    // Test 16: Direct messaging restriction
    const res16ConvA = await req('/conversations', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userB._id.toString() }),
    }, tokenA);

    const res16ConvB = await req('/conversations', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userA._id.toString() }),
    }, tokenB);

    assert(
      res16ConvA.status === 403 && res16ConvB.status === 403,
      'Test 16: Direct conversation initiation blocked symmetrically with 403 Forbidden',
      `A->B: ${res16ConvA.status}, B->A: ${res16ConvB.status}`
    );

    console.log('\n--- REPORTING CORE FUNCTIONALITY TESTS ---');

    // Test 17: Report a User
    const res17 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: userC._id.toString(),
        reason: 'HARASSMENT',
        details: 'Harassing messages sent in profile comments',
      }),
    }, tokenA);
    assert(
      res17.status === 201 && res17.data.success === true && res17.data.data.report.status === 'OPEN',
      'Test 17: Report a User returns 201 Created with status OPEN',
      `Status: ${res17.status}, details: ${JSON.stringify(res17.data)}`
    );

    // Test 18: Report a Post
    const res18 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'POST',
        targetId: postB._id.toString(),
        reason: 'INAPPROPRIATE_CONTENT',
        details: 'Contains inappropriate graphics',
      }),
    }, tokenA);
    assert(
      res18.status === 201 && res18.data.success === true,
      'Test 18: Report a Post returns 201 Created',
      `Status: ${res18.status}`
    );

    // Test 19: Report a Comment
    const res19 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'COMMENT',
        targetId: commentB._id.toString(),
        reason: 'SPAM',
        details: 'Repeated promotional text',
      }),
    }, tokenA);
    assert(
      res19.status === 201 && res19.data.success === true,
      'Test 19: Report a Comment returns 201 Created',
      `Status: ${res19.status}`
    );

    // Test 20: Report a Story
    const res20 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'STORY',
        targetId: storyB._id.toString(),
        reason: 'SCAM',
      }),
    }, tokenA);
    assert(
      res20.status === 201 && res20.data.success === true,
      'Test 20: Report a Story returns 201 Created',
      `Status: ${res20.status}`
    );

    // Test 21: Duplicate active report prevention
    const res21 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'POST',
        targetId: postB._id.toString(),
        reason: 'SPAM',
      }),
    }, tokenA);
    assert(
      res21.status === 409 && res21.data.success === false,
      'Test 21: Duplicate active report returns 409 Conflict',
      `Status: ${res21.status}, msg: ${res21.data?.message}`
    );

    // Test 22: Invalid targetType enum
    const res22 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'INVALID_TYPE',
        targetId: postB._id.toString(),
        reason: 'SPAM',
      }),
    }, tokenA);
    assert(
      res22.status === 400 && res22.data.success === false,
      'Test 22: Invalid targetType enum returns 400 Bad Request',
      `Status: ${res22.status}`
    );

    // Test 23: Non-existent targetId
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res23 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'POST',
        targetId: fakeId,
        reason: 'SPAM',
      }),
    }, tokenA);
    assert(
      res23.status === 404 && res23.data.success === false,
      'Test 23: Non-existent targetId returns 404 Not Found',
      `Status: ${res23.status}`
    );

    // Test 24: Invalid reason enum
    const res24 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: userC._id.toString(),
        reason: 'RANDOM_REASON',
      }),
    }, tokenA);
    assert(
      res24.status === 400 && res24.data.success === false,
      'Test 24: Invalid reason enum returns 400 Bad Request',
      `Status: ${res24.status}`
    );

    // Test 25: Report details length limit (> 1000 chars)
    const longDetails = 'a'.repeat(1001);
    const res25 = await req('/reports', {
      method: 'POST',
      body: JSON.stringify({
        targetType: 'USER',
        targetId: userC._id.toString(),
        reason: 'OTHER',
        details: longDetails,
      }),
    }, tokenA);
    assert(
      res25.status === 400 && res25.data.success === false,
      'Test 25: Report details > 1000 characters returns 400 Bad Request',
      `Status: ${res25.status}`
    );

    // Test 26: Reporting does NOT automatically block the target user
    const blockCheckC = await Block.findOne({ blocker: userA._id, blocked: userC._id });
    assert(
      blockCheckC === null,
      'Test 26: Reporting a user does NOT automatically block them',
      `Block exists: ${!!blockCheckC}`
    );

    // Test 27: Privacy test: Normal users cannot view or list reports
    const res27Get = await req('/reports', { method: 'GET' }, tokenA);
    assert(
      res27Get.status === 404 || res27Get.status === 405,
      'Test 27: Privacy test: No public report viewing endpoint exists (404/405)',
      `Status: ${res27Get.status}`
    );

    // Test 28: Story exclusion for blocked users
    const res28A = await req('/stories', { method: 'GET' }, tokenA);
    const storiesA = res28A.data?.data?.stories || [];
    const bobStoryInAlice = storiesA.some((s) => s.author?.username === userB.username);
    assert(
      res28A.status === 200 && !bobStoryInAlice,
      'Test 28: Active stories from blocked user are excluded from story feed',
      `Bob story found in Alice stories: ${bobStoryInAlice}`
    );

  } catch (error) {
    console.error('Fatal error during test run:', error);
    failed++;
  } finally {
    if (httpServer) {
      httpServer.close();
    }
    await mongoose.connection.close();

    console.log('\n====================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests();
