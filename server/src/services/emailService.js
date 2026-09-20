import config from '../config/config.js';

// In-memory queue of recently dispatched emails for testing and development inspection
const emailQueue = [];

/**
 * ─── Email Service ────────────────────────────────────────────────────────────
 *
 * Provider abstraction for transactional emails (Verification, Password Reset).
 * In development / test mode, emails are captured into an inspection queue.
 */
export const emailService = {
  /**
   * Dispatches an account verification email containing a time-limited secure link.
   *
   * @param {string} toEmail Recipient email address
   * @param {string} rawToken Raw verification token (unhashed)
   * @returns {Promise<Object>} Delivery summary
   */
  async sendVerificationEmail(toEmail, rawToken) {
    const verificationUrl = `${config.clientUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const subject = 'Verify your Social Connect account';
    const text = `Welcome to Social Connect! Please verify your email by clicking the link: ${verificationUrl}. This link expires in 24 hours.`;

    const emailPayload = {
      to: toEmail,
      from: config.email.from,
      subject,
      text,
      verificationUrl,
      rawToken,
      type: 'VERIFICATION',
      sentAt: new Date(),
    };

    emailQueue.push(emailPayload);
    if (emailQueue.length > 100) emailQueue.shift();

    if (config.isDev && process.env.NODE_ENV !== 'test') {
      console.log(`[EmailService DEV] Verification email sent to: ${toEmail}`);
    }

    return { success: true, messageId: `mock-${Date.now()}` };
  },

  /**
   * Dispatches a password reset email containing a time-limited secure link.
   *
   * @param {string} toEmail Recipient email address
   * @param {string} rawToken Raw password reset token (unhashed)
   * @returns {Promise<Object>} Delivery summary
   */
  async sendPasswordResetEmail(toEmail, rawToken) {
    const resetUrl = `${config.clientUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const subject = 'Reset your Social Connect password';
    const text = `You requested a password reset. Please click the following link: ${resetUrl}. This link expires in 15 minutes. If you did not request this, please ignore this email.`;

    const emailPayload = {
      to: toEmail,
      from: config.email.from,
      subject,
      text,
      resetUrl,
      rawToken,
      type: 'PASSWORD_RESET',
      sentAt: new Date(),
    };

    emailQueue.push(emailPayload);
    if (emailQueue.length > 100) emailQueue.shift();

    if (config.isDev && process.env.NODE_ENV !== 'test') {
      console.log(`[EmailService DEV] Password reset email sent to: ${toEmail}`);
    }

    return { success: true, messageId: `mock-${Date.now()}` };
  },

  /**
   * Retrieves the most recent email sent to a given recipient.
   * Used for automated test assertion and development debugging.
   *
   * @param {string} toEmail
   * @param {string} [type] 'VERIFICATION' | 'PASSWORD_RESET'
   * @returns {Object|null}
   */
  getLatestEmail(toEmail, type = null) {
    const matching = emailQueue
      .slice()
      .reverse()
      .find((e) => e.to.toLowerCase() === toEmail.toLowerCase() && (!type || e.type === type));
    return matching || null;
  },

  /**
   * Clears in-memory email inspection queue.
   */
  clearQueue() {
    emailQueue.length = 0;
  },
};

export default emailService;
