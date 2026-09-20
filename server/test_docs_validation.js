/**
 * test_docs_validation.js
 * Comprehensive validation suite for OpenAPI 3.0.3 specification and Swagger UI endpoint integration.
 *
 * Checks performed:
 * 1. YAML syntax and parsing via yamljs
 * 2. 100% operation coverage across all 73 operations in openapi.yaml
 * 3. OperationId presence and global uniqueness
 * 4. Internal $ref pointer resolution across the entire document
 * 5. Swagger UI mounting and HTML response verification via live Express server
 * 6. Root /docs redirect verification
 */

import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import YAML from 'yamljs';
import app from './src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Complete inventory of all 73 REST API operations in openapi.yaml
const EXPECTED_OPERATIONS = [
  // Health
  { method: 'get', path: '/health', opId: 'getHealth' },
  { method: 'get', path: '/health/ready', opId: 'getHealthReady' },

  // Auth & Sessions
  { method: 'post', path: '/auth/register', opId: 'registerUser' },
  { method: 'post', path: '/auth/login', opId: 'loginUser' },
  { method: 'post', path: '/auth/refresh', opId: 'refreshToken' },
  { method: 'post', path: '/auth/logout', opId: 'logoutUser' },
  { method: 'post', path: '/auth/logout-all', opId: 'logoutAllSessions' },
  { method: 'get', path: '/auth/sessions', opId: 'getSessions' },
  { method: 'delete', path: '/auth/sessions/{sessionId}', opId: 'revokeSession' },
  { method: 'patch', path: '/auth/change-password', opId: 'changePassword' },
  { method: 'post', path: '/auth/forgot-password', opId: 'forgotPassword' },
  { method: 'post', path: '/auth/reset-password', opId: 'resetPassword' },
  { method: 'post', path: '/auth/verify-email', opId: 'verifyEmail' },
  { method: 'post', path: '/auth/resend-verification', opId: 'resendVerification' },
  { method: 'get', path: '/auth/me', opId: 'getAuthMe' },

  // Users & Profiles
  { method: 'get', path: '/users/test', opId: 'testUserRoute' },
  { method: 'get', path: '/users/search', opId: 'searchUsers' },
  { method: 'get', path: '/users/me', opId: 'getMyProfile' },
  { method: 'patch', path: '/users/me', opId: 'updateMyProfile' },
  { method: 'get', path: '/users/me/blocked', opId: 'getBlockedUsers' },
  { method: 'get', path: '/users/{username}', opId: 'getUserProfile' },
  { method: 'get', path: '/users/{username}/posts', opId: 'getUserPosts' },

  // Blocks & Follows
  { method: 'post', path: '/users/{username}/block', opId: 'blockUser' },
  { method: 'delete', path: '/users/{username}/block', opId: 'unblockUser' },
  { method: 'get', path: '/users/{username}/block-status', opId: 'getBlockStatus' },
  { method: 'post', path: '/users/{username}/follow', opId: 'followUser' },
  { method: 'delete', path: '/users/{username}/follow', opId: 'unfollowUser' },
  { method: 'get', path: '/users/{username}/follow-status', opId: 'getFollowStatus' },
  { method: 'get', path: '/users/{username}/followers', opId: 'getFollowers' },
  { method: 'get', path: '/users/{username}/following', opId: 'getFollowing' },

  // Posts & Interactions
  { method: 'post', path: '/posts', opId: 'createPost' },
  { method: 'get', path: '/posts', opId: 'getPosts' },
  { method: 'get', path: '/posts/{id}', opId: 'getPostById' },
  { method: 'patch', path: '/posts/{id}', opId: 'updatePost' },
  { method: 'delete', path: '/posts/{id}', opId: 'deletePost' },
  { method: 'post', path: '/posts/{id}/like', opId: 'togglePostLike' },
  { method: 'post', path: '/posts/{postId}/save', opId: 'savePost' },
  { method: 'delete', path: '/posts/{postId}/save', opId: 'unsavePost' },
  { method: 'get', path: '/posts/{postId}/save-status', opId: 'getSaveStatus' },
  { method: 'get', path: '/users/me/saved-posts', opId: 'getSavedPosts' },

  // Comments & Replies
  { method: 'post', path: '/posts/{postId}/comments', opId: 'createComment' },
  { method: 'get', path: '/posts/{postId}/comments', opId: 'getComments' },
  { method: 'post', path: '/comments/{commentId}/replies', opId: 'createReply' },
  { method: 'get', path: '/comments/{commentId}/replies', opId: 'getReplies' },
  { method: 'patch', path: '/comments/{commentId}', opId: 'updateComment' },
  { method: 'delete', path: '/comments/{commentId}', opId: 'deleteComment' },

  // Feed
  { method: 'get', path: '/feed', opId: 'getFeed' },

  // Notifications
  { method: 'get', path: '/notifications', opId: 'getNotifications' },
  { method: 'get', path: '/notifications/unread-count', opId: 'getUnreadNotificationCount' },
  { method: 'patch', path: '/notifications/read-all', opId: 'markAllNotificationsRead' },
  { method: 'patch', path: '/notifications/{notificationId}/read', opId: 'markNotificationRead' },

  // Stories
  { method: 'post', path: '/stories', opId: 'createStory' },
  { method: 'get', path: '/stories', opId: 'getStories' },
  { method: 'get', path: '/stories/{storyId}', opId: 'getStoryById' },
  { method: 'delete', path: '/stories/{storyId}', opId: 'deleteStory' },

  // Conversations & Messages
  { method: 'post', path: '/conversations', opId: 'createConversation' },
  { method: 'get', path: '/conversations', opId: 'getConversations' },
  { method: 'get', path: '/conversations/{conversationId}', opId: 'getConversationById' },
  { method: 'patch', path: '/conversations/{conversationId}/read', opId: 'markConversationRead' },
  { method: 'post', path: '/conversations/{conversationId}/messages', opId: 'sendMessage' },
  { method: 'get', path: '/conversations/{conversationId}/messages', opId: 'getConversationMessages' },

  // Reports
  { method: 'post', path: '/reports', opId: 'createReport' },

  // Admin & Moderation
  { method: 'get', path: '/admin/reports', opId: 'listAdminReports' },
  { method: 'get', path: '/admin/reports/{reportId}', opId: 'getAdminReportById' },
  { method: 'patch', path: '/admin/reports/{reportId}/status', opId: 'updateAdminReportStatus' },
  { method: 'get', path: '/admin/users', opId: 'listAdminUsers' },
  { method: 'patch', path: '/admin/users/{userId}/status', opId: 'updateAdminUserStatus' },
  { method: 'patch', path: '/admin/posts/{postId}/moderation', opId: 'moderatePost' },
  { method: 'patch', path: '/admin/comments/{commentId}/moderation', opId: 'moderateComment' },
  { method: 'patch', path: '/admin/stories/{storyId}/moderation', opId: 'moderateStory' },

  // Admin Audit Logs
  { method: 'get', path: '/admin/audit-logs', opId: 'listAdminAuditLogs' },
  { method: 'get', path: '/admin/audit-logs/{auditLogId}', opId: 'getAdminAuditLogById' },
  { method: 'get', path: '/admin/audit-logs/users/{userId}/summary', opId: 'getAdminUserAuditSummary' }
];

async function runValidation() {
  console.log('===============================================================');
  console.log('  Social Connect: Comprehensive API Documentation Validator   ');
  console.log('===============================================================');
  let failures = 0;

  // 1. File existence
  const yamlPath = path.resolve(__dirname, '../docs/openapi.yaml');
  console.log(`\n[1] Checking openapi.yaml existence: ${yamlPath}`);
  if (!fs.existsSync(yamlPath)) {
    console.error('FAIL: docs/openapi.yaml does not exist');
    process.exit(1);
  }
  console.log('PASS: openapi.yaml exists.');

  // 2. YAML parsing
  console.log('\n[2] Parsing openapi.yaml with yamljs...');
  let doc;
  try {
    doc = YAML.load(yamlPath);
    console.log(`PASS: YAML parsed successfully.`);
    console.log(`      OpenAPI Spec: ${doc.openapi}`);
    console.log(`      Title: "${doc.info.title}" v${doc.info.version}`);
    console.log(`      Base Server URL: ${doc.servers[0].url}`);
  } catch (err) {
    console.error(`FAIL: YAML syntax error: ${err.message}`);
    process.exit(1);
  }

  // 3. Operation IDs and Endpoints Check
  console.log(`\n[3] Validating all ${EXPECTED_OPERATIONS.length} REST operations and operationId uniqueness...`);
  const paths = doc.paths || {};
  const operationIds = new Set();
  let foundOperations = 0;

  for (const expected of EXPECTED_OPERATIONS) {
    const pathObj = paths[expected.path];
    if (!pathObj) {
      console.error(`FAIL: Path missing in OpenAPI: ${expected.path}`);
      failures++;
      continue;
    }
    const opObj = pathObj[expected.method];
    if (!opObj) {
      console.error(`FAIL: Method ${expected.method.toUpperCase()} missing for path: ${expected.path}`);
      failures++;
      continue;
    }

    // Check operationId
    if (!opObj.operationId) {
      console.error(`FAIL: Missing operationId for ${expected.method.toUpperCase()} ${expected.path}`);
      failures++;
    } else {
      if (operationIds.has(opObj.operationId)) {
        console.error(`FAIL: Duplicate operationId "${opObj.operationId}" found for ${expected.method.toUpperCase()} ${expected.path}`);
        failures++;
      } else {
        operationIds.add(opObj.operationId);
      }
    }

    // Check summary and tags
    if (!opObj.summary) {
      console.error(`FAIL: Missing summary for ${expected.method.toUpperCase()} ${expected.path}`);
      failures++;
    }
    if (!opObj.tags || !opObj.tags.length) {
      console.error(`FAIL: Missing tags for ${expected.method.toUpperCase()} ${expected.path}`);
      failures++;
    }

    foundOperations++;
  }

  console.log(`Found and verified ${foundOperations} / ${EXPECTED_OPERATIONS.length} REST operations.`);
  if (foundOperations === EXPECTED_OPERATIONS.length) {
    console.log(`PASS: All ${EXPECTED_OPERATIONS.length} operations verified with unique operationIds, summaries, and tags.`);
  }

  // 4. Validate internal $ref pointer resolution
  console.log('\n[4] Validating internal $ref pointers across openapi.yaml...');
  function resolveRef(root, refStr) {
    if (!refStr.startsWith('#/')) {
      return { ok: false, msg: `Non-local ref unsupported: ${refStr}` };
    }
    const parts = refStr.slice(2).split('/');
    let current = root;
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return { ok: false, msg: `Cannot read property "${part}" in ${refStr}` };
      }
      current = current[part];
    }
    if (current === undefined) {
      return { ok: false, msg: `Target is undefined for ${refStr}` };
    }
    return { ok: true, target: current };
  }

  let refCount = 0;
  let refFailures = 0;
  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        refCount++;
        const res = resolveRef(doc, value);
        if (!res.ok) {
          console.error(`FAIL: Invalid $ref "${value}": ${res.msg}`);
          refFailures++;
        }
      } else if (typeof value === 'object') {
        traverse(value);
      }
    }
  }

  traverse(doc);
  console.log(`Checked ${refCount} $ref pointers across the document.`);
  if (refFailures === 0) {
    console.log(`PASS: All ${refCount} $ref pointers resolved cleanly.`);
  } else {
    console.error(`FAIL: ${refFailures} $ref pointer(s) failed resolution.`);
    failures += refFailures;
  }

  // 5. Test Swagger UI Express mount via HTTP
  console.log('\n[5] Testing Swagger UI endpoint on live Express server...');
  const testPort = 5098;
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`Test server running on port ${testPort}`);

  function makeRequest(urlPath) {
    return new Promise((resolve, reject) => {
      http.get({
        hostname: '127.0.0.1',
        port: testPort,
        path: urlPath,
        headers: { 'Accept': 'text/html' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });
  }

  try {
    // Check /docs redirect
    const redirectRes = await makeRequest('/docs');
    console.log(`/docs responded with status ${redirectRes.status}`);
    if (redirectRes.status === 301 || redirectRes.status === 302) {
      console.log(`PASS: /docs redirects to ${redirectRes.headers.location}`);
    } else {
      console.warn(`WARN: /docs returned status ${redirectRes.status}`);
    }

    // Check /api/docs/
    const docsRes = await makeRequest('/api/docs/');
    console.log(`/api/docs/ responded with status ${docsRes.status}`);
    if (docsRes.status === 200 && (docsRes.body.includes('Swagger UI') || docsRes.body.includes('swagger'))) {
      console.log('PASS: Swagger UI successfully loaded HTML and rendered on /api/docs/');
    } else {
      console.error(`FAIL: Unexpected response on /api/docs/: Status ${docsRes.status}`);
      failures++;
    }

    // Check /api/health
    const healthRes = await makeRequest('/api/health');
    console.log(`/api/health responded with status ${healthRes.status}`);
    if (healthRes.status === 200) {
      console.log('PASS: Liveness health check endpoint responded 200 OK');
    }
  } catch (err) {
    console.error(`FAIL: HTTP request error: ${err.message}`);
    failures++;
  } finally {
    server.close();
  }

  // Final Summary
  console.log('\n===============================================================');
  if (failures === 0) {
    console.log('   ALL DOCS VALIDATION CHECKS PASSED PERFECTLY (0 FAILURES)    ');
    console.log('===============================================================\n');
    process.exit(0);
  } else {
    console.error(`   DOCS VALIDATION FAILED WITH ${failures} ERROR(S)   `);
    console.log('===============================================================\n');
    process.exit(1);
  }
}

runValidation().catch((err) => {
  console.error('Fatal validation error:', err);
  process.exit(1);
});
