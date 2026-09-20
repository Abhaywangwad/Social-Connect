import { describe, it, expect, beforeEach } from 'vitest';
import emailService from '../../src/services/emailService.js';

describe('Unit: Email Service Provider', () => {
  beforeEach(() => {
    emailService.clearQueue();
  });

  it('dispatches account verification email and queues for inspection', async () => {
    const rawToken = 'test-raw-verification-token-12345';
    const email = 'verify-me@example.com';

    const result = await emailService.sendVerificationEmail(email, rawToken);
    expect(result.success).toBe(true);

    const latest = emailService.getLatestEmail(email, 'VERIFICATION');
    expect(latest).toBeDefined();
    expect(latest.to).toBe(email);
    expect(latest.rawToken).toBe(rawToken);
    expect(latest.verificationUrl).toContain(encodeURIComponent(rawToken));
    expect(latest.subject).toMatch(/verify/i);
  });

  it('dispatches password reset email and queues for inspection', async () => {
    const rawToken = 'test-raw-reset-token-67890';
    const email = 'reset-me@example.com';

    const result = await emailService.sendPasswordResetEmail(email, rawToken);
    expect(result.success).toBe(true);

    const latest = emailService.getLatestEmail(email, 'PASSWORD_RESET');
    expect(latest).toBeDefined();
    expect(latest.to).toBe(email);
    expect(latest.rawToken).toBe(rawToken);
    expect(latest.resetUrl).toContain(encodeURIComponent(rawToken));
    expect(latest.subject).toMatch(/reset/i);
  });

  it('clears the email queue upon request', async () => {
    await emailService.sendVerificationEmail('clear@example.com', 'token1');
    expect(emailService.getLatestEmail('clear@example.com')).not.toBeNull();

    emailService.clearQueue();
    expect(emailService.getLatestEmail('clear@example.com')).toBeNull();
  });
});
