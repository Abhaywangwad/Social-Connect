import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── User Schema ─────────────────────────────────────────────────────────────
 *
 * Represents a registered user of Social Connect.
 *
 * FOLLOWERS / FOLLOWING DESIGN DECISION
 * ─────────────────────────────────────
 * We store followers and following as arrays of ObjectId references on the
 * User document (embedded reference approach).
 *
 * Pros:
 *  - Simple to query for "does user A follow user B?" — O(1) with $in
 *  - Easy to populate follower/following lists in a single query
 *  - No extra collection or join needed for small/medium accounts
 *
 * Cons:
 *  - MongoDB documents have a 16 MB size limit. A user with millions of
 *    followers will cause the document to grow excessively.
 *  - Updating the array (push/pull) on large documents is costly.
 *  - No efficient way to paginate followers without pulling the whole array.
 *
 * Scalability note:
 *  For a production system at scale (celebrity accounts, viral users), the
 *  industry standard is a separate "Follow" collection:
 *    { follower: ObjectId, followee: ObjectId, createdAt: Date }
 *  with compound indexes on both directions. We will migrate to this pattern
 *  in a later phase once authentication and follow APIs are implemented.
 */
const userSchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────

    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,          // normalize to lowercase for consistent lookups
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
      match: [
        /^[a-z0-9_.]+$/,
        'Username may only contain lowercase letters, numbers, underscores, and periods',
      ],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address',
      ],
    },

    /**
     * Password is stored as a bcrypt hash (NOT plain text).
     * Hashing will be wired up in Phase 3 (Authentication) via a Mongoose
     * pre-save hook. The field is defined here so the schema is complete.
     *
     * `select: false` ensures the password hash is NEVER returned by default
     * when documents are queried — it must be explicitly opted-in with
     * `.select('+password')` in the authentication service only.
     */
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,            // excluded from all query results by default
    },

    // ── Profile ───────────────────────────────────────────────────────────────

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [50, 'Full name must be at most 50 characters'],
    },

    /**
     * Normalized full name for predictable, fast case-insensitive search queries.
     * Maintained automatically via pre-save hook and profile update service.
     */
    normalizedFullName: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },

    bio: {
      type: String,
      trim: true,
      maxlength: [150, 'Bio must be at most 150 characters'],
      default: '',
    },

    /**
     * profilePicture stores a URL string pointing to an image hosted on an
     * object-storage service (e.g., Cloudinary, AWS S3).
     * Binary image data is NEVER stored in MongoDB — that would cause extreme
     * document bloat and poor performance.
     */
    profilePicture: {
      type: String,
      default: '',
    },

    // ── Denormalized Social Graph Counters ───────────────────────────────────
    /**
     * Fast cached counters for profile reads.
     * The Follow collection (Follow.js) is the authoritative source of truth.
     */
    followersCount: {
      type: Number,
      default: 0,
      min: [0, 'Followers count cannot be negative'],
    },

    followingCount: {
      type: Number,
      default: 0,
      min: [0, 'Following count cannot be negative'],
    },

    // ── Account Settings ──────────────────────────────────────────────────────

    /**
     * Private accounts require the owner to approve follow requests before
     * followers can see their posts. Default is public.
     */
    isPrivate: {
      type: Boolean,
      default: false,
    },

    /**
     * Verified badge — manually granted by admins. Default is unverified.
     */
    isVerified: {
      type: Boolean,
      default: false,
    },

    /**
     * Email verification state.
     */
    emailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    // ── Authorization ────────────────────────────────────────────────────────

    /**
     * User role for authorization.
     * Only 'USER' (default) and 'ADMIN' are supported.
     * `select: false` ensures the role is NEVER returned in normal API responses.
     * Must be set via trusted server-side operations only (bootstrap script).
     * Normal users can NEVER change their own role through profile update APIs.
     */
    role: {
      type: String,
      enum: {
        values: ['USER', 'ADMIN'],
        message: 'Role must be USER or ADMIN',
      },
      default: 'USER',
      select: false, // excluded from normal query results by default
    },

    // ── Account Status ───────────────────────────────────────────────────────

    /**
     * Account moderation status.
     * ACTIVE: normal operations permitted.
     * SUSPENDED: login rejected, refresh sessions revoked, write operations blocked.
     *
     * Deliberately NOT 'select: false' — accountStatus must be checked at
     * login time by authService without an extra projection.
     */
    accountStatus: {
      type: String,
      enum: {
        values: ['ACTIVE', 'SUSPENDED'],
        message: 'Account status must be ACTIVE or SUSPENDED',
      },
      default: 'ACTIVE',
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    /**
     * Internal admin note explaining why the account was suspended.
     * Never exposed through normal user-facing APIs.
     */
    suspensionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Suspension reason cannot exceed 500 characters'],
      default: '',
      select: false,
    },
  },
  {
    /**
     * Mongoose automatically adds `createdAt` and `updatedAt` fields and
     * keeps `updatedAt` current on every save() / findOneAndUpdate() call.
     */
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
//
// username and email already have unique indexes created automatically by
// Mongoose when `unique: true` is set on the field definition above.

// Supports case-insensitive full-name prefix and token searches
userSchema.index({ normalizedFullName: 1 });

// Supports admin user listing filtered by account status
userSchema.index({ accountStatus: 1 });

// Supports admin user listing filtered by role
userSchema.index({ role: 1 });

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Automatically synchronize normalizedFullName before saving.
 */
userSchema.pre('save', function (next) {
  if (this.isModified('fullName') && typeof this.fullName === 'string') {
    this.normalizedFullName = this.fullName.toLowerCase().trim();
  }
  next();
});

// ─── JSON Serialization ───────────────────────────────────────────────────────

/**
 * Override toJSON to strip sensitive / internal fields before the document
 * is serialized and sent to any client.
 *
 * Fields removed:
 *  - password           (already select:false, but double-protected here)
 *  - __v                (Mongoose internal version key — irrelevant to consumers)
 *  - normalizedFullName (internal search index field)
 */
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.__v;
    delete ret.normalizedFullName;
    // Security: role is select:false and should never appear in normal toJSON
    // but guard explicitly in case it is accidentally selected
    delete ret.role;
    // Strip internal moderation fields from normal consumer responses
    delete ret.suspensionReason;
    delete ret.suspendedAt;
    return ret;
  },
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Compares candidate plain-text password with stored hash.
 * Used during login in the upcoming authentication phase.
 *
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.default.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
