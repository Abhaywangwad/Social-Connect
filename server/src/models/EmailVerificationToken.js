import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Email Verification Token Model ───────────────────────────────────────────
 *
 * Stores hashed, single-use, time-limited tokens for account email verification.
 *
 * Security Architecture:
 * - High-entropy random token is issued to user via email only.
 * - Only the SHA-256 hash is stored in MongoDB.
 * - Enforces single-use via `usedAt` timestamp.
 * - Automatically cleaned up via MongoDB TTL index.
 * - Explicit application-level expiration check `expiresAt > now` is mandatory.
 */
const emailVerificationTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },

    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL index: asynchronous document deletion after expiration
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerificationToken = mongoose.model('EmailVerificationToken', emailVerificationTokenSchema);

export default EmailVerificationToken;
