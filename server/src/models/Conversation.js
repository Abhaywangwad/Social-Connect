import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Conversation Schema ─────────────────────────────────────────────────────
 *
 * Represents a one-to-one direct messaging conversation between two users.
 *
 * Duplicate Prevention:
 * `conversationKey` is a deterministic string composed of the two participant ObjectIds
 * sorted lexicographically: `min(idA, idB) + ":" + max(idA, idB)`.
 * A unique compound index on `conversationKey` guarantees that no two concurrent
 * requests can create duplicate conversations between the same pair of users.
 *
 * Unread Tracking:
 * Rather than updating an `isRead` flag on potentially hundreds of individual messages,
 * `participantStates` tracks each participant's `lastReadAt` timestamp.
 * Any message sent by the other participant after `lastReadAt` is unread.
 */
const participantStateSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    participants: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      ],
      validate: {
        validator(val) {
          return Array.isArray(val) && val.length === 2;
        },
        message: 'A direct conversation must contain exactly two participants',
      },
    },

    conversationKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    lastMessage: {
      content: {
        type: String,
        default: '',
      },
      sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      createdAt: {
        type: Date,
      },
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    participantStates: {
      type: [participantStateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Note: conversationKey already has a unique index created automatically by `unique: true` above.

// Accelerates querying conversations for a given participant ordered by most recent activity
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
