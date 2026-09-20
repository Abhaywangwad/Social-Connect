import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Media Subdocument Schema ────────────────────────────────────────────────
 *
 * Each post can contain up to 10 media items.
 * Images are uploaded to Cloudinary; MongoDB stores URLs, publicIds, and metadata.
 * Binary data is NEVER stored in MongoDB.
 */
const mediaItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
      required: [true, 'Media type is required (image or video)'],
    },
    url: {
      type: String,
      required: [true, 'Media URL is required'],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, 'Cloudinary public_id is required'],
      trim: true,
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

/**
 * ─── Post Schema ─────────────────────────────────────────────────────────────
 *
 * Represents a user post in Social Connect.
 *
 * Content Rules:
 * A post must contain at least one meaningful piece of content:
 * - Caption only → allowed
 * - Media only → allowed
 * - Caption + media → allowed
 * - Empty caption + no media → rejected
 */
const postSchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
    },
    caption: {
      type: String,
      trim: true,
      maxlength: [2200, 'Caption cannot exceed 2200 characters'],
      default: '',
    },
    media: {
      type: [mediaItemSchema],
      default: [],
      validate: {
        validator(val) {
          return !val || val.length <= 10;
        },
        message: 'A post cannot contain more than 10 media items',
      },
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters'],
      default: '',
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: [0, 'Comments count cannot be negative'],
    },
    likesCount: {
      type: Number,
      default: 0,
      min: [0, 'Likes count cannot be negative'],
    },

    // ── Moderation ────────────────────────────────────────────────────────

    /**
     * Content moderation state.
     * ACTIVE  → visible to all authorized users (default)
     * HIDDEN  → not shown to normal users; document preserved for review
     * REMOVED → considered removed; document retained as evidence
     *
     * Physical deletion is NOT triggered automatically by moderation.
     * Visibility enforcement is applied at the query layer in all
     * user-facing services (feed, post detail, user posts).
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

// Content validation: Ensure post has either caption or media
postSchema.pre('validate', function (next) {
  const hasCaption = typeof this.caption === 'string' && this.caption.trim().length > 0;
  const hasMedia = Array.isArray(this.media) && this.media.length > 0;

  if (!hasCaption && !hasMedia) {
    this.invalidate(
      'content',
      'A post must contain either a text caption or at least one media item'
    );
  }
  next();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * COMPOUND INDEX: (author, createdAt, _id)
 * Supports feed retrieval and deterministic cursor pagination sorted newest-first
 * with _id as tiebreaker:
 * Post.find({ author: { $in: authorIds } }).sort({ createdAt: -1, _id: -1 })
 */
postSchema.index({ author: 1, createdAt: -1, _id: -1 });

/**
 * INDEX: (createdAt)
 * Supports global reverse-chronological post feeds and pagination.
 */
postSchema.index({ createdAt: -1 });

/**
 * COMPOUND INDEX: (moderationStatus, author, createdAt, _id)
 * Perfectly supports filtered feed queries that exclude non-ACTIVE posts
 * with zero in-memory sort required for deterministic cursor pagination:
 * Post.find({ moderationStatus: 'ACTIVE', author: { $in: ... } }).sort({ createdAt: -1, _id: -1 })
 */
postSchema.index({ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 });

// Clean JSON representation for client consumption
postSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    // Omit sensitive external storage identifiers (publicId) from client responses
    if (Array.isArray(ret.media)) {
      ret.media = ret.media.map((item) => {
        const { publicId, ...safeItem } = item;
        return safeItem;
      });
    }
    return ret;
  },
});

const Post = mongoose.model('Post', postSchema);

export default Post;
