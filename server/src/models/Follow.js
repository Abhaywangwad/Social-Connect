import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Follow Schema ───────────────────────────────────────────────────────────
 *
 * Represents a directed follow relationship between two users.
 *
 * Relationship direction:
 *   follower ──follows──▶ following
 *
 * Example:
 *   If user "abhay" follows "rohan":
 *     follower  = abhay's _id
 *     following = rohan's _id
 *
 * Why a separate collection instead of an embedded array?
 * ────────────────────────────────────────────────────────
 * 1. Infinite Scalability: Avoids MongoDB's 16 MB document size limit.
 * 2. Unbounded Growth: A user can have millions of followers without
 *    bloating the User document.
 * 3. Atomic Indexes & Fast Queries: High-speed queries in both directions
 *    (who follows X, who X follows).
 * 4. Efficient Cursor/Skip Pagination: Paginates relationships directly
 *    at the database engine level.
 */
const followSchema = new Schema(
  {
    follower: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Follower user ID is required'],
    },
    following: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Following target user ID is required'],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * COMPOUND UNIQUE INDEX: (follower, following)
 *
 * 1. Guarantees that a user CANNOT follow the same person more than once.
 * 2. Provides rapid O(log n) lookup for: "Does user A follow user B?"
 * 3. Also accelerates queries filtering by follower: "Who does user A follow?"
 */
followSchema.index({ follower: 1, following: 1 }, { unique: true });

/**
 * SECONDARY INDEX: (following, createdAt)
 *
 * Accelerates reverse queries: "Who are the followers of user B?"
 * sorted by most recent follow date (for follower lists).
 */
followSchema.index({ following: 1, createdAt: -1 });

/**
 * SECONDARY INDEX: (follower, createdAt)
 *
 * Accelerates forward queries: "Who does user A follow?"
 * sorted by most recent follow date (for following lists).
 */
followSchema.index({ follower: 1, createdAt: -1 });

// Clean JSON representation
followSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Follow = mongoose.model('Follow', followSchema);

export default Follow;
