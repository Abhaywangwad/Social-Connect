import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Story Schema ────────────────────────────────────────────────────────────
 *
 * Represents an ephemeral media story created by a user.
 * Stories automatically expire 24 hours after creation.
 *
 * Expiration Architecture:
 * 1. MongoDB TTL Index on `expiresAt` with `expireAfterSeconds: 0`.
 *    MongoDB's background TTL thread periodically sweeps and physically deletes
 *    expired story documents.
 * 2. Application-Level Active Filter:
 *    Because MongoDB's background TTL thread runs asynchronously (typically once every 60 seconds),
 *    the application layer strictly enforces `expiresAt: { $gt: new Date() }` on every query,
 *    guaranteeing that expired stories are never accessible or visible.
 */
const storySchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Story author is required'],
    },

    media: {
      type: {
        type: String,
        enum: ['image'],
        default: 'image',
        required: true,
      },
      url: {
        type: String,
        required: [true, 'Media URL is required'],
      },
      publicId: {
        type: String,
        required: [true, 'Media public ID is required'],
      },
      width: {
        type: Number,
        default: 1080,
      },
      height: {
        type: Number,
        default: 1920,
      },
    },

    caption: {
      type: String,
      trim: true,
      maxlength: [500, 'Story caption cannot exceed 500 characters'],
      default: '',
    },

    expiresAt: {
      type: Date,
      required: [true, 'Expiration timestamp is required'],
    },

    // ── Moderation ────────────────────────────────────────────────────────

    /**
     * Content moderation state.
     *
     * Story visibility requires BOTH conditions:
     *   moderationStatus === 'ACTIVE'  AND  expiresAt > now
     *
     * A REMOVED story must not become visible again simply because
     * the TTL background thread has not yet physically deleted the document.
     * Moderation is independent of natural expiration.
     */
    moderationStatus: {
      type: String,
      enum: {
        values: ['ACTIVE', 'HIDDEN', 'REMOVED'],
        message: 'Moderation status must be ACTIVE, HIDDEN, or REMOVED',
      },
      default: 'ACTIVE',
    },

    moderatedAt: {
      type: Date,
      default: null,
    },

    moderatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * TTL INDEX: Automatically removes story documents once expiresAt timestamp is reached.
 * Note: Actual physical removal by MongoDB occurs asynchronously according to the TTL monitor.
 */
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * COMPOUND QUERY INDEX: (author, expiresAt, createdAt)
 * Accelerates querying active stories for followed users sorted in reverse chronological order.
 */
storySchema.index({ author: 1, expiresAt: 1, createdAt: -1 });

/**
 * SECONDARY INDEX: (author, createdAt)
 * Supports user-specific story timelines.
 */
storySchema.index({ author: 1, createdAt: -1 });

// Clean JSON representation
storySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Story = mongoose.model('Story', storySchema);

export default Story;
