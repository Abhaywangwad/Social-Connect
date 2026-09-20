import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Block Schema ────────────────────────────────────────────────────────────
 *
 * Represents a directional block relationship where User A (blocker) blocks
 * User B (blocked).
 *
 * While the document is directional, Social Connect applies bilateral interaction
 * restrictions: neither user can follow, message, view stories, or view posts/feed
 * of the other while an active block exists in either direction.
 *
 * Duplicate Prevention:
 * Compound unique index on { blocker: 1, blocked: 1 } prevents race condition
 * duplicate block records at the database level.
 */
const blockSchema = new Schema(
  {
    blocker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Blocker user ID is required'],
    },
    blocked: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Blocked user ID is required'],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// 1. Enforces uniqueness so a user cannot block the same user multiple times
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

// 2. Accelerates paginated retrieval of users blocked by a specific user
blockSchema.index({ blocker: 1, createdAt: -1 });

// 3. Accelerates reverse lookup (checking who has blocked User B)
blockSchema.index({ blocked: 1, createdAt: -1 });

blockSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Block = mongoose.model('Block', blockSchema);

export default Block;
