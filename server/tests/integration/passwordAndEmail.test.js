import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import User from '../../src/models/User.js';
import emailService from '../../src/services/emailService.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';

describe('Integration: Password Recovery & Email Verification', () => {
  describe('Password Reset Flow', () => {
    it('requests password reset, dispatches email token, and resets password', async () => {
      const email = 'resetflow@example.com';
      await createTestUser({ email, password: 'OldPassword123!' });

      // 1. Forgot password request
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.success).toBe(true);

      // 2. Retrieve raw token from email inspection queue
      const latestEmail = emailService.getLatestEmail(email, 'PASSWORD_RESET');
      expect(latestEmail).not.toBeNull();
      expect(latestEmail.rawToken).toBeDefined();

      // 3. Reset password using valid token
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: latestEmail.rawToken,
          newPassword: 'BrandNewPassword123!',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // 4. Verify login with new password succeeds and old password fails
      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'OldPassword123!' });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'BrandNewPassword123!' });
      expect(newLogin.status).toBe(200);
    });

    it('rejects password reset with invalid or already-used token', async () => {
      const email = 'usedtoken@example.com';
      await createTestUser({ email, password: 'Password123!' });

      await request(app).post('/api/auth/forgot-password').send({ email });
      const emailObj = emailService.getLatestEmail(email, 'PASSWORD_RESET');

      // Use once
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token: emailObj.rawToken, newPassword: 'NewPassword999!' });

      // Try reuse (already consumed)
      const reuseRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: emailObj.rawToken, newPassword: 'AnotherPassword999!' });

      expect(reuseRes.status).toBe(400);
    });
  });

  describe('Change Password (Authenticated)', () => {
    it('updates password and verifies previous sessions are invalidated', async () => {
      const user = await createTestUser({ password: 'CurrentPassword123!' });
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .patch('/api/auth/change-password')
        .set(loginData.authHeader)
        .send({
          currentPassword: 'CurrentPassword123!',
          newPassword: 'UpdatedPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects change-password when current password is incorrect', async () => {
      const user = await createTestUser({ password: 'CurrentPassword123!' });
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .patch('/api/auth/change-password')
        .set(loginData.authHeader)
        .send({
          currentPassword: 'WrongCurrentPassword!',
          newPassword: 'UpdatedPassword123!',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Email Verification Flow', () => {
    it('verifies user email using raw verification token', async () => {
      // Register user
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'verifyuser',
          email: 'verifyuser@example.com',
          password: 'Password123!',
          fullName: 'Verify User',
        });
      expect(regRes.status).toBe(201);

      // Extract verification email
      const emailObj = emailService.getLatestEmail('verifyuser@example.com', 'VERIFICATION');
      expect(emailObj).not.toBeNull();
      expect(emailObj.rawToken).toBeDefined();

      // Submit verification token
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: emailObj.rawToken });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Verify user document updated in DB
      const user = await User.findOne({ email: 'verifyuser@example.com' });
      expect(user.emailVerified).toBe(true);
    });

    it('resends verification email for authenticated unverified user', async () => {
      const user = await createTestUser({ isVerified: false, email: 'resend@example.com' });
      const loginData = await loginTestUser(user);

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set(loginData.authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const emailObj = emailService.getLatestEmail('resend@example.com', 'VERIFICATION');
      expect(emailObj).not.toBeNull();
    });
  });
});
