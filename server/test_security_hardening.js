import http from 'http';
import mongoose from 'mongoose';
import app from './src/app.js';
import config from './src/config/config.js';
import User from './src/models/User.js';
import Post from './src/models/Post.js';
import Session from './src/models/Session.js';
import Conversation from './src/models/Conversation.js';
import authService from './src/services/authService.js';
import { generateAccessToken } from './src/utils/jwt.js';
import { resetRateLimiters } from './src/middleware/rateLimiter.js';

let server;
let baseUrl;
let passed = 0;
let failed = 0;

const assert = (condition, title, details = '') => {
  if (condition) {
    console.log(`✅ [PASS] ${title}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${title} — ${details}`);
    failed++;
  }
};

const makeRequest = async (path, options = {}, token = null) => {
  const url = `${baseUrl}${path}`;
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, { ...options, headers });
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
};

const runSecurityTests = async () => {
  console.log('====================================================');
  console.log('🛡️ STARTING PHASE 21 SECURITY & HARDENING TEST SUITE');
  console.log('====================================================\n');

  try {
    // 1. Connect to DB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }

    // 2. Start test server on non-SIP port (5088)
    const testPort = 5088;
    baseUrl = `http://localhost:${testPort}`;
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(testPort, resolve));
    console.log(`[Test Server] Running at ${baseUrl}\n`);

    // Clean up test collections
    await User.deleteMany({ email: /@securitytest\.com$/ });
    resetRateLimiters();

    // ─── 1. HEALTH & READINESS PROBES ─────────────────────────────────────────
    console.log('--- 1. HEALTH & READINESS PROBES ---');
    const healthRes = await makeRequest('/api/health');
    assert(
      healthRes.status === 200 && healthRes.data.status === 'healthy',
      'Test 1: GET /api/health liveness probe returns 200 OK with healthy status'
    );

    const readyRes = await makeRequest('/api/health/ready');
    assert(
      readyRes.status === 200 && readyRes.data.database === 'connected',
      'Test 2: GET /api/health/ready readiness probe returns 200 OK with database connected'
    );

    // ─── 2. HTTP SECURITY HEADERS & REQUEST CORRELATION ────────────────────────
    console.log('\n--- 2. HTTP SECURITY HEADERS & REQUEST CORRELATION ---');
    assert(
      healthRes.headers.get('x-content-type-options') === 'nosniff',
      'Test 3: X-Content-Type-Options: nosniff header is set by Helmet'
    );
    assert(
      healthRes.headers.get('x-frame-options') === 'DENY',
      'Test 4: X-Frame-Options: DENY header is set by Helmet'
    );
    assert(
      healthRes.headers.get('x-request-id') !== null,
      'Test 5: X-Request-ID header is propagated in response'
    );

    const customReqId = 'sec-custom-trace-uuid-12345';
    const customIdRes = await makeRequest('/api/health', {
      headers: { 'x-request-id': customReqId },
    });
    assert(
      customIdRes.headers.get('x-request-id') === customReqId,
      'Test 6: Client-supplied X-Request-ID is preserved and echoed back'
    );

    // ─── 3. USER SETUP FOR SECURITY TESTS ─────────────────────────────────────
    console.log('\n--- 3. USER SETUP ---');
    const userA = await authService.registerUser({
      username: 'sec_alice',
      email: 'sec_alice@securitytest.com',
      password: 'Password123!',
      fullName: 'Alice Security',
    });
    await User.updateOne({ _id: userA.id }, { $set: { emailVerified: true } });

    const userB = await authService.registerUser({
      username: 'sec_bob',
      email: 'sec_bob@securitytest.com',
      password: 'Password123!',
      fullName: 'Bob Security',
    });
    await User.updateOne({ _id: userB.id }, { $set: { emailVerified: true } });

    const tokenA = generateAccessToken({ userId: userA.id.toString(), sessionId: 'sid_alice' });
    const tokenB = generateAccessToken({ userId: userB.id.toString(), sessionId: 'sid_bob' });

    // ─── 4. INPUT VALIDATION & FORBIDDEN INTERNAL FIELDS ──────────────────────
    console.log('\n--- 4. INPUT VALIDATION & FORBIDDEN INTERNAL FIELDS ---');
    // Attempt to inject internal fields (e.g. followersCount, isVerified, _id)
    const injectRes = await makeRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        body: {
          bio: 'Hacker bio',
          followersCount: 999999,
        },
      },
      tokenA
    );
    assert(
      injectRes.status === 400 && injectRes.data.error?.code === 'FORBIDDEN_INTERNAL_FIELD',
      'Test 7: Prohibited internal field (followersCount) is blocked with FORBIDDEN_INTERNAL_FIELD',
      `Status: ${injectRes.status}, error: ${injectRes.data.error?.code}`
    );

    const injectVerifiedRes = await makeRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        body: {
          isVerified: true,
        },
      },
      tokenA
    );
    assert(
      injectVerifiedRes.status === 400 && injectVerifiedRes.data.error?.code === 'FORBIDDEN_INTERNAL_FIELD',
      'Test 8: Setting isVerified directly is blocked with FORBIDDEN_INTERNAL_FIELD'
    );

    // Whitelist test: unknown extra property rejected
    const unknownFieldRes = await makeRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        body: {
          bio: 'Clean bio',
          arbitraryProperty: 'malicious',
        },
      },
      tokenA
    );
    assert(
      unknownFieldRes.status === 400 && unknownFieldRes.data.error?.code === 'VALIDATION_ERROR',
      'Test 9: Unwhitelisted field rejected with 400 VALIDATION_ERROR'
    );

    // ─── 5. NOSQL OPERATOR INJECTION PROTECTION ───────────────────────────────
    console.log('\n--- 5. NOSQL OPERATOR INJECTION PROTECTION ---');
    const nosqlBodyRes = await makeRequest(
      '/api/users/me',
      {
        method: 'PATCH',
        body: {
          $gt: '',
        },
      },
      tokenA
    );
    assert(
      nosqlBodyRes.status === 400 && nosqlBodyRes.data.error?.code === 'NOSQL_INJECTION_ATTEMPT',
      'Test 10: NoSQL operator $gt in request body rejected with NOSQL_INJECTION_ATTEMPT'
    );

    const nosqlQueryRes = await makeRequest(
      '/api/users/search?q[$gt]=',
      { method: 'GET' },
      tokenA
    );
    assert(
      nosqlQueryRes.status === 400,
      'Test 11: NoSQL operator in query parameters safely rejected with 400 Bad Request'
    );

    // ─── 6. SEARCH QUERY SAFETY & BOUNDS ──────────────────────────────────────
    console.log('\n--- 6. SEARCH QUERY SAFETY & BOUNDS ---');
    const searchShortRes = await makeRequest('/api/users/search?q=a', { method: 'GET' }, tokenA);
    assert(
      searchShortRes.status === 400 && searchShortRes.data.error?.code === 'VALIDATION_ERROR',
      'Test 12: Search query shorter than 2 characters rejected with VALIDATION_ERROR'
    );

    const longQuery = 'x'.repeat(60);
    const searchLongRes = await makeRequest(`/api/users/search?q=${longQuery}`, { method: 'GET' }, tokenA);
    assert(
      searchLongRes.status === 400 && searchLongRes.data.error?.code === 'VALIDATION_ERROR',
      'Test 13: Search query exceeding 50 characters rejected with VALIDATION_ERROR'
    );

    // Safe regex escaping verification: passing regex control characters does not crash or match unintended records
    const searchRegexRes = await makeRequest('/api/users/search?q=.*+?^$', { method: 'GET' }, tokenA);
    assert(
      searchRegexRes.status === 200 && Array.isArray(searchRegexRes.data.data.users),
      'Test 14: Search query with regex special characters safely escaped without ReDoS error'
    );

    // ─── 7. AUTHORIZATION & IDOR PREVENTION ───────────────────────────────────
    console.log('\n--- 7. AUTHORIZATION & IDOR PREVENTION ---');
    // User A creates a post directly
    const postA = await Post.create({
      author: userA.id,
      caption: 'Alice private thoughts',
    });

    // User B attempts to edit User A's post (IDOR attack)
    const idorPatchRes = await makeRequest(
      `/api/posts/${postA._id}`,
      {
        method: 'PATCH',
        body: { caption: 'Hacked by Bob' },
      },
      tokenB
    );
    assert(
      idorPatchRes.status === 403 && idorPatchRes.data.error?.code === 'FORBIDDEN',
      'Test 15: IDOR attack blocked: User B cannot edit User A post (403 Forbidden)'
    );

    // User B attempts to delete User A's post
    const idorDeleteRes = await makeRequest(
      `/api/posts/${postA._id}`,
      { method: 'DELETE' },
      tokenB
    );
    assert(
      idorDeleteRes.status === 403 && idorDeleteRes.data.error?.code === 'FORBIDDEN',
      'Test 16: IDOR attack blocked: User B cannot delete User A post (403 Forbidden)'
    );

    // ─── 8. ATOMIC COUNTER INTEGRITY (NEGATIVE COUNTER PROTECTION) ────────────
    console.log('\n--- 8. ATOMIC COUNTER INTEGRITY ---');
    // Post has likesCount = 0. Attempting multiple unlikes should never decrement below 0
    await makeRequest(`/api/posts/${postA._id}/like`, { method: 'POST' }, tokenA); // liked = true, likesCount = 1
    await makeRequest(`/api/posts/${postA._id}/like`, { method: 'POST' }, tokenA); // liked = false, likesCount = 0

    const postAfterUnlike = await Post.findById(postA._id);
    assert(
      postAfterUnlike.likesCount >= 0,
      'Test 17: Post likesCount cannot drop below 0 upon unliking',
      `likesCount: ${postAfterUnlike.likesCount}`
    );

    // Direct database decrement safety check with guard condition
    await Post.updateOne({ _id: postA._id, likesCount: { $gt: 0 } }, { $inc: { likesCount: -1 } });
    const postAfterGuard = await Post.findById(postA._id);
    assert(
      postAfterGuard.likesCount === 0,
      'Test 18: Guarded decrement condition ensures counter remains non-negative (0)'
    );

    // ─── 9. FILE UPLOAD SECURITY (FILE SIGNATURE VALIDATION) ───────────────────
    console.log('\n--- 9. FILE UPLOAD SECURITY ---');
    // Test multipart upload with fake file signature (text disguised as image)
    const fakeFileBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const fakeMultipartBody = [
      `--${fakeFileBoundary}`,
      'Content-Disposition: form-data; name="media"; filename="malicious.png"',
      'Content-Type: image/png',
      '',
      'THIS_IS_NOT_A_PNG_FILE_JUST_PLAIN_TEXT',
      `--${fakeFileBoundary}--`,
    ].join('\r\n');

    const fakeUploadRes = await makeRequest(
      '/api/posts',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${fakeFileBoundary}`,
        },
        body: fakeMultipartBody,
      },
      tokenA
    );
    assert(
      fakeUploadRes.status === 400 && fakeUploadRes.data.error?.code === 'INVALID_FILE_SIGNATURE',
      'Test 19: Disguised file with invalid magic bytes rejected with INVALID_FILE_SIGNATURE',
      `Status: ${fakeUploadRes.status}, error: ${fakeUploadRes.data.error?.code}`
    );

    // ─── 10. RATE LIMITING ON SENSITIVE ENDPOINTS ─────────────────────────────
    console.log('\n--- 10. RATE LIMITING ON SENSITIVE ENDPOINTS ---');
    resetRateLimiters();

    // Trigger report limiter (max 10)
    let triggeredRateLimit = false;
    for (let i = 0; i < 12; i++) {
      const repRes = await makeRequest(
        '/api/reports',
        {
          method: 'POST',
          body: {
            targetType: 'USER',
            targetId: userB.id.toString(),
            reason: 'SPAM',
          },
        },
        tokenA
      );
      if (repRes.status === 429) {
        triggeredRateLimit = true;
        break;
      }
    }
    assert(
      triggeredRateLimit,
      'Test 20: Report rate limiter successfully triggers 429 RATE_LIMIT_EXCEEDED on spam'
    );

  } catch (err) {
    console.error('Fatal error during security test run:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();

    console.log('\n====================================================');
    console.log(`🏁 SECURITY SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
};

runSecurityTests();
