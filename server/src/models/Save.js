import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Save Schema ─────────────────────────────────────────────────────────────
 *
 * Represents a privately saved/bookmarked post by a user.
 *
 * Designed as a dedicated relational collection rather than an unbounded array
 * on the User document to ensure high scalability and zero document bloat.
 */
const saveSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post reference is required'],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * COMPOUND UNIQUE INDEX: (user, post)
 *
 * Enforces database-level uniqueness ensuring a user cannot save the same post twice.
 * Prevents race condition duplicates.
 */
saveSchema.index({ user: 1, post: 1 }, { unique: true });

/**
 * COMPOUND INDEX: (user, createdAt)
 *
 * Optimizes retrieving a user's saved posts in reverse-chronological order of
 * when the post was SAVED (Save.createdAt DESC):
 * Save.find({ user: currentUserId }).sort({ createdAt: -1 })
 */
saveSchema.index({ user: 1, createdAt: -1 });

/**
 * INDEX: (post)
 *
 * Supports fast cascade deletion when a post is removed:
 * Save.deleteMany({ post: postId })
 */
saveSchema.index({ post: 1 });

saveSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Save = mongoose.model('Save', saveSchema);

export default Save;
