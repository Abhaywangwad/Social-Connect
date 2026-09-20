import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ─── Message Schema ──────────────────────────────────────────────────────────
 *
 * Represents an individual direct message inside a conversation.
 *
 * Query Performance:
 * - Compound index on (conversation, createdAt, _id) accelerates backward cursor
 *   pagination when scrolling through message histories.
 * - Compound index on (conversation, sender, createdAt) optimizes unread message counts
 *   filtering messages from other participants after the viewer's lastReadAt.
 */
const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message sender is required'],
    },

    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      maxlength: [5000, 'Message content cannot exceed 5000 characters'],
    },

    clientMessageId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Supports reverse-chronological and cursor-based pagination within a conversation
messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });

// Optimizes unread count evaluations per conversation and sender
messageSchema.index({ conversation: 1, sender: 1, createdAt: 1 });

// Idempotency: ensures a client retry with the same clientMessageId cannot create duplicate messages
messageSchema.index(
  { sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  }
);

messageSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
