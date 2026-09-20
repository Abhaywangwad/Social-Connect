import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Like Schema ─────────────────────────────────────────────────────────────
 *
 * Represents an individual like relationship: User likes Post.
 *
 * Dedicated collection design prevents unbound array growth inside the Post document.
 * A compound unique index prevents duplicate likes from the same user on the same post.
 */
const likeSchema = new Schema(
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
 * Guarantees that a user can like a specific post at most once.
 * Also accelerates lookup: Like.findOne({ user: userId, post: postId })
 */
likeSchema.index({ user: 1, post: 1 }, { unique: true });

/**
 * INDEX: (post)
 *
 * Supports fast counts, post like listings, and cascade deletion upon post removal:
 * Like.deleteMany({ post: postId })
 */
likeSchema.index({ post: 1 });

// Clean JSON representation
likeSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Like = mongoose.model('Like', likeSchema);

export default Like;
