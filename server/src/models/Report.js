import mongoose from 'mongoose';

const { Schema } = mongoose;

export const REPORT_TARGET_TYPES = ['USER', 'POST', 'COMMENT', 'STORY'];

export const REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'SCAM',
  'INAPPROPRIATE_CONTENT',
  'IMPERSONATION',
  'OTHER',
];

export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];

/**
 * ─── Report Schema ───────────────────────────────────────────────────────────
 *
 * Represents an individual moderation signal submitted by a user against a
 * User, Post, Comment, or Story.
 *
 * Privacy:
 * Reports are confidential. Only admins will have access to review reports in
 * future phases. Normal users cannot view or edit reports.
 *
 * Anti-Spam:
 * Partial unique index on { reporter, targetType, targetId } with status: 'OPEN'
 * ensures a reporter cannot submit multiple duplicate active reports for the same item.
 */
const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter user ID is required'],
    },

    targetType: {
      type: String,
      enum: {
        values: REPORT_TARGET_TYPES,
        message: 'Invalid target type. Must be USER, POST, COMMENT, or STORY.',
      },
      required: [true, 'Report target type is required'],
    },

    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Report target ID is required'],
    },

    reason: {
      type: String,
      enum: {
        values: REPORT_REASONS,
        message: 'Invalid report reason.',
      },
      required: [true, 'Report reason is required'],
    },

    details: {
      type: String,
      trim: true,
      maxlength: [1000, 'Details cannot exceed 1000 characters'],
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: REPORT_STATUSES,
        message: 'Invalid report status.',
      },
      default: 'OPEN',
    },

    /**
     * Admin-controlled private note explaining the moderation decision.
     * Never exposed through normal user-facing APIs.
     * Max 2000 characters — allows detailed moderation context.
     */
    moderationNote: {
      type: String,
      trim: true,
      maxlength: [2000, 'Moderation note cannot exceed 2000 characters'],
      default: '',
    },

    /**
     * Admin user who resolved or dismissed this report.
     * Set automatically by moderationService when status changes to RESOLVED or DISMISSED.
     */
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// 1. Prevents duplicate active reports from the same user on the same entity
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN' },
  }
);

// 2. Accelerates queries by target entity (used for moderation review)
reportSchema.index({ targetType: 1, targetId: 1 });

// 3. Accelerates queries by report status and recency (DESC for general listing)
reportSchema.index({ status: 1, createdAt: -1 });

// 4. Accelerates the moderation queue — oldest unresolved reports surface first (ASC)
reportSchema.index({ status: 1, createdAt: 1 });

// 5. Accelerates queries by reporter and recency
reportSchema.index({ reporter: 1, createdAt: -1 });

reportSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Report = mongoose.model('Report', reportSchema);

export default Report;
