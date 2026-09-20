import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Comment Schema ──────────────────────────────────────────────────────────
 *
 * Represents a user's comment on a Post or a 1-level reply to another Comment.
 *
 * One-Level Hierarchy:
 * - Top-level comment: parentComment = null
 * - Reply: parentComment = parent comment's _id
 * Replies cannot receive nested replies (max depth: 1 level).
 */
const commentSchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Comment author is required'],
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post reference is required'],
    },
    content: {
      type: String,
      required: [true, 'Comment content cannot be empty'],
      trim: true,
      maxlength: [1000, 'Comment content cannot exceed 1000 characters'],
      validate: {
        validator(val) {
          return typeof val === 'string' && val.trim().length > 0;
        },
        message: 'Comment content cannot be empty or whitespace only',
      },
    },
    parentComment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    repliesCount: {
      type: Number,
      default: 0,
      min: [0, 'Replies count cannot be negative'],
    },

    // ── Moderation ────────────────────────────────────────────────────────

    /**
     * Content moderation state. Hidden/removed comments are omitted
     * from normal comment listing queries. Physical deletion is not
     * triggered by moderation — records are preserved for review.
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
 * COMPOUND INDEX: (post, parentComment, moderationStatus, createdAt)
 *
 * Optimizes fetching active top-level comments for a post in reverse chronological order:
 * Comment.find({ post: postId, parentComment: null, moderationStatus: 'ACTIVE' }).sort({ createdAt: -1 })
 */
commentSchema.index({ post: 1, parentComment: 1, moderationStatus: 1, createdAt: -1 });

/**
 * COMPOUND INDEX: (parentComment, moderationStatus, createdAt)
 *
 * Optimizes fetching active replies for a specific top-level comment in reverse chronological order:
 * Comment.find({ parentComment: commentId, moderationStatus: 'ACTIVE' }).sort({ createdAt: -1 })
 */
commentSchema.index({ parentComment: 1, moderationStatus: 1, createdAt: -1 });

/**
 * COMPOUND INDEX: (author, createdAt)
 *
 * Optimizes fetching all comments authored by a specific user:
 * Comment.find({ author: userId }).sort({ createdAt: -1 })
 */
commentSchema.index({ author: 1, createdAt: -1 });

// Clean JSON serialization
commentSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
