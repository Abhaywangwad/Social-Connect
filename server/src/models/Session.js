import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Session Model ────────────────────────────────────────────────────────────
 *
 * Represents an authenticated device/login session.
 *
 * Security Architecture:
 * 1. The raw refresh token is NEVER stored in the database. Only its SHA-256 hash
 *    is persisted. If the database is compromised, an attacker cannot mint valid tokens.
 * 2. Each login initiates a unique `tokenFamily`. During token rotation, the hash is
 *    replaced with the new token's hash.
 * 3. If an old, already-rotated token hash is presented, it indicates potential token theft.
 *    The system immediately revokes all sessions sharing that `tokenFamily`.
 * 4. Revocation is marked by setting `revokedAt = new Date()`.
 */
const sessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Session user is required'],
    },

    refreshTokenHash: {
      type: String,
      required: [true, 'Refresh token hash is required'],
      index: true,
    },

    previousTokenHashes: {
      type: [String],
      default: [],
      index: true,
    },

    tokenFamily: {
      type: String,
      required: [true, 'Token family identifier is required'],
      index: true,
    },

    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },

    userAgent: {
      type: String,
      default: '',
      trim: true,
    },

    ipAddress: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Efficient lookup for active sessions per user (sorted by recency)
sessionSchema.index({ user: 1, createdAt: -1 });

// TTL Index: MongoDB automatically purges session documents after they expire
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper instance method to check active state
sessionSchema.methods.isActive = function () {
  return !this.revokedAt && this.expiresAt > new Date();
};

const Session = mongoose.model('Session', sessionSchema);

export default Session;
