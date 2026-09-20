import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Notification Schema ─────────────────────────────────────────────────────
 *
 * Represents an event affecting a recipient user (e.g. FOLLOW, LIKE, COMMENT, REPLY).
 * Structured relational references are stored rather than static display text,
 * enabling dynamic localization and eliminating text update bloat.
 */
const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification recipient is required'],
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification actor is required'],
    },
    type: {
      type: String,
      enum: ['FOLLOW', 'LIKE', 'COMMENT', 'REPLY'],
      required: [true, 'Notification type is required'],
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    follow: {
      type: Schema.Types.ObjectId,
      ref: 'Follow',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * COMPOUND INDEX: (recipient, createdAt)
 * Optimizes listing a user's notifications in reverse chronological order:
 * Notification.find({ recipient: userId }).sort({ createdAt: -1 })
 */
notificationSchema.index({ recipient: 1, createdAt: -1 });

/**
 * COMPOUND INDEX: (recipient, isRead)
 * Optimizes fetching unread notification counts:
 * Notification.countDocuments({ recipient: userId, isRead: false })
 */
notificationSchema.index({ recipient: 1, isRead: 1 });

/**
 * INDEX: (post)
 * Optimizes cascading cleanup when a Post is deleted:
 * Notification.deleteMany({ post: postId })
 */
notificationSchema.index({ post: 1 });

/**
 * INDEX: (comment)
 * Optimizes cascading cleanup when Comments are deleted:
 * Notification.deleteMany({ comment: { $in: commentIds } })
 */
notificationSchema.index({ comment: 1 });

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
