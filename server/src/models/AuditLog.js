import mongoose from 'mongoose';

/**
 * Controlled list of valid Audit Action Types.
 * Arbitrary action names from clients or untrusted code are strictly rejected.
 */
export const AUDIT_ACTIONS = [
  // Authentication
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'USER_LOGOUT_ALL',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'EMAIL_VERIFIED',

  // Sessions & Tokens
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'REFRESH_TOKEN_REUSED',

  // Social
  'FOLLOW_CREATED',
  'FOLLOW_REMOVED',
  'USER_BLOCKED',
  'USER_UNBLOCKED',

  // Content
  'POST_CREATED',
  'POST_UPDATED',
  'POST_DELETED',
  'COMMENT_CREATED',
  'COMMENT_UPDATED',
  'COMMENT_DELETED',

  // Moderation
  'REPORT_CREATED',
  'REPORT_STATUS_CHANGED',
  'POST_MODERATED',
  'COMMENT_MODERATED',
  'STORY_MODERATED',
  'USER_SUSPENDED',
  'USER_REACTIVATED',

  // Security & Authorization
  'ADMIN_ACCESS_DENIED',
];

/**
 * Controlled list of valid Audit Target Types.
 */
export const AUDIT_TARGET_TYPES = [
  'USER',
  'POST',
  'COMMENT',
  'STORY',
  'REPORT',
  'SESSION',
  'SYSTEM',
];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: [true, 'Audit action is required'],
      enum: {
        values: AUDIT_ACTIONS,
        message: 'Invalid audit action: {VALUE}',
      },
    },
    targetType: {
      type: String,
      enum: {
        values: AUDIT_TARGET_TYPES,
        message: 'Invalid audit target type: {VALUE}',
      },
      default: null,
    },
    targetId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    requestId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// ─── Indexes for Common Admin Investigation Queries ─────────────────────────
// 1. Default timeline listing: newest events first (with _id for deterministic tie-breaking)
auditLogSchema.index({ createdAt: -1, _id: -1 });

// 2. Filter by actor over time (e.g. investigate actions performed by a specific user or admin)
auditLogSchema.index({ actor: 1, createdAt: -1 });

// 3. Filter by action type over time (e.g. view all USER_LOGIN_FAILED or USER_SUSPENDED events)
auditLogSchema.index({ action: 1, createdAt: -1 });

// 4. Filter by target resource lifecycle (e.g. see all events affecting Post X or User Y)
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Clean JSON transformation for API responses
auditLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
