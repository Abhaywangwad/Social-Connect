import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import Post from '../../src/models/Post.js';
import Session from '../../src/models/Session.js';
import AuditLog from '../../src/models/AuditLog.js';
import { createTestUser, createAdminUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Integration: Reports, Admin Moderation & Audit Logs', () => {
  it('allows user to submit a confidential report and prevents normal users from admin queue', async () => {
    const user = await createTestUser();
    const badUser = await createTestUser();
    const userLogin = await loginTestUser(user);

    // 1. Submit report
    const reportRes = await request(app)
      .post('/api/reports')
      .set(userLogin.authHeader)
      .send({
        targetType: 'USER',
        targetId: badUser._id.toString(),
        reason: 'HARASSMENT',
        details: 'User sending harassing comments',
      });

    expect(reportRes.status).toBe(201);
    expect(reportRes.body.success).toBe(true);

    // 2. Normal user tries to access admin moderation queue -> 403 Forbidden
    const forbiddenRes = await request(app)
      .get('/api/admin/reports')
      .set(userLogin.authHeader);
    expect(forbiddenRes.status).toBe(403);
  });

  it('allows admin to review reports, moderate content, and update report status', async () => {
    const admin = await createAdminUser();
    const reporter = await createTestUser();
    const violator = await createTestUser();

    const adminLogin = await loginTestUser(admin);
    const reporterLogin = await loginTestUser(reporter);

    const post = await createTestPost(violator._id, { caption: 'Spammy post' });

    // Submit report on post
    const reportRes = await request(app)
      .post('/api/reports')
      .set(reporterLogin.authHeader)
      .send({
        targetType: 'POST',
        targetId: post._id.toString(),
        reason: 'SPAM',
        details: 'Massive advertisement link spam',
      });
      const report = reportRes.body.data.report;
      const reportId = report.id || report._id;

    // 1. Admin lists reports
    const listRes = await request(app)
      .get('/api/admin/reports')
      .set(adminLogin.authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.reports.length).toBeGreaterThanOrEqual(1);

    // 2. Admin inspects report
    const detailRes = await request(app)
      .get(`/api/admin/reports/${reportId}`)
      .set(adminLogin.authHeader);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.report._id || detailRes.body.data.report.id).toBe(reportId);

    // 3. Admin hides post
    const hideRes = await request(app)
      .patch(`/api/admin/posts/${post._id}/moderation`)
      .set(adminLogin.authHeader)
      .send({ status: 'HIDDEN', reason: 'Spam content hidden by admin' });
    expect(hideRes.status).toBe(200);

    const dbPost = await Post.findById(post._id);
    expect(dbPost.moderationStatus).toBe('HIDDEN');

    // 4. Admin updates report status to RESOLVED
    const statusRes = await request(app)
      .patch(`/api/admin/reports/${reportId}/status`)
      .set(adminLogin.authHeader)
      .send({ status: 'RESOLVED', moderationNote: 'Post hidden and resolved' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.report.status).toBe('RESOLVED');
  });

  it('suspends user, revokes existing sessions, blocks subsequent logins, and creates audit log', async () => {
    const admin = await createAdminUser();
    const targetUser = await createTestUser({ email: 'target_suspend@example.com', password: 'Password123!' });

    const adminLogin = await loginTestUser(admin);
    const targetLogin = await loginTestUser(targetUser);

    // Ensure target user has active session
    const preSession = await Session.findById(targetLogin.session._id);
    expect(preSession.isActive()).toBe(true);

    // Admin suspends user
    const suspendRes = await request(app)
      .patch(`/api/admin/users/${targetUser._id}/status`)
      .set(adminLogin.authHeader)
      .send({ status: 'SUSPENDED', reason: 'Severe community guideline violations' });

    expect(suspendRes.status).toBe(200);

    // 1. User document marked SUSPENDED
    const dbUser = await User.findById(targetUser._id);
    expect(dbUser.accountStatus).toBe('SUSPENDED');

    // 2. Existing sessions revoked
    const postSession = await Session.findById(targetLogin.session._id);
    expect(postSession.revokedAt).not.toBeNull();
    expect(postSession.isActive()).toBe(false);

    // 3. User login blocked with 403
    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: 'target_suspend@example.com', password: 'Password123!' });
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.body.error.code || loginAttempt.body.error.message).toMatch(/SUSPEND/i);

    // 4. AuditLog created for suspension
    const auditLogs = await request(app)
      .get(`/api/admin/audit-logs?action=USER_SUSPENDED&targetId=${targetUser._id}`)
      .set(adminLogin.authHeader);
    expect(auditLogs.status).toBe(200);
    expect(auditLogs.body.data.logs.length).toBeGreaterThanOrEqual(1);

    // Verify audit logs do not expose sensitive credentials
    const logStr = JSON.stringify(auditLogs.body.data.logs);
    expect(logStr).not.toContain('Password123!');
    expect(logStr).not.toContain('$2a$');
  });
});
