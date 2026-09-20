import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { encodeCursor, decodeCursor } from './feedService.js';
import blockService from './blockService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Validates MongoDB ObjectId format.
 */
const validateObjectId = (id, resourceName = 'Resource') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${resourceName} ID format`);
  }
};

/**
 * Generates a deterministic conversation key from two participant IDs.
 * Ensures that [A, B] and [B, A] always map to the exact same key.
 */
const generateConversationKey = (idA, idB) => {
  const sorted = [idA.toString(), idB.toString()].sort();
  return `${sorted[0]}:${sorted[1]}`;
};

/**
 * Formats a safe public user representation for participants and senders.
 */
const formatSafeUser = (user) => {
  if (!user) return null;
  return {
    id: user._id || user.id,
    username: user.username,
    fullName: user.fullName,
    profilePicture: user.profilePicture || null,
    isVerified: Boolean(user.isVerified),
  };
};

/**
 * Formats a message document into a clean API response object.
 */
const formatMessage = (msg) => ({
  id: msg._id,
  conversationId: msg.conversation?._id
    ? msg.conversation._id.toString()
    : (msg.conversation ? msg.conversation.toString() : undefined),
  conversation: msg.conversation,
  content: msg.content,
  createdAt: msg.createdAt,
  sender: formatSafeUser(msg.sender),
  ...(msg.clientMessageId ? { clientMessageId: msg.clientMessageId } : {}),
});

/**
 * Creates or retrieves a one-to-one conversation between the authenticated user and target user.
 * Guarantees duplicate prevention through deterministic conversationKey and MongoDB unique index.
 *
 * @param {string} currentUserId Authenticated user ID (from JWT)
 * @param {string} targetUserId Target user ID
 * @returns {Promise<Object>} Conversation with otherUser populated
 */
export const createOrGetConversation = async (currentUserId, targetUserId) => {
  validateObjectId(targetUserId, 'Target User');

  // Self-conversation check
  if (currentUserId.toString() === targetUserId.toString()) {
    throw ApiError.badRequest('You cannot create a conversation with yourself');
  }

  // Ensure target user exists
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw ApiError.notFound('User not found');
  }

  // Prevent messaging if either user has blocked the other
  await blockService.assertUsersNotBlocked(currentUserId, targetUserId);

  const conversationKey = generateConversationKey(currentUserId, targetUserId);

  let conversation = await Conversation.findOne({ conversationKey }).populate(
    'participants',
    'username fullName profilePicture isVerified'
  );

  if (!conversation) {
    try {
      const now = new Date();
      conversation = await Conversation.create({
        participants: [currentUserId, targetUserId],
        conversationKey,
        lastMessageAt: now,
        participantStates: [
          { user: currentUserId, lastReadAt: now },
          { user: targetUserId, lastReadAt: new Date(0) },
        ],
      });

      await conversation.populate(
        'participants',
        'username fullName profilePicture isVerified'
      );
    } catch (error) {
      if (error.code === 11000) {
        // Race condition: another concurrent request created this conversation
        conversation = await Conversation.findOne({ conversationKey }).populate(
          'participants',
          'username fullName profilePicture isVerified'
        );
      } else {
        throw error;
      }
    }
  }

  const otherUserDoc = conversation.participants.find(
    (p) => p._id.toString() !== currentUserId.toString()
  );

  return {
    id: conversation._id,
    otherUser: formatSafeUser(otherUserDoc),
    lastMessage: conversation.lastMessage?.content
      ? {
          content: conversation.lastMessage.content,
          createdAt: conversation.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
  };
};

/**
 * Retrieves paginated list of conversations for the authenticated user.
 * Avoids N+1 queries by aggregating unread counts across all retrieved conversations in ONE query.
 *
 * @param {string} currentUserId
 * @param {Object} queryParams { page, limit }
 * @returns {Promise<{ conversations: Array<Object>, pagination: Object }>}
 */
export const getUserConversations = async (
  currentUserId,
  { page = 1, limit = 20 } = {}
) => {
  const rawPage = parseInt(page, 10);
  const rawLimit = parseInt(limit, 10);

  if (isNaN(rawPage) || rawPage < 1) {
    throw ApiError.badRequest('Page must be a positive integer');
  }
  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }

  const parsedLimit = Math.min(50, rawLimit);
  const parsedPage = rawPage;
  const skip = (parsedPage - 1) * parsedLimit;

  const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);
  const filter = {
    participants: currentUserId,
    ...(blockedUserIds.length > 0
      ? { participants: { $all: [currentUserId], $nin: blockedUserIds } }
      : {}),
  };

  const [conversations, totalConversations] = await Promise.all([
    Conversation.find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('participants', 'username fullName profilePicture isVerified')
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  // Single-Query Batch Unread Count Calculation (Preventing N+1 queries)
  const unreadCountMap = new Map();

  if (conversations.length > 0) {
    const matchConditions = conversations.map((c) => {
      const userState = (c.participantStates || []).find(
        (s) => s.user.toString() === currentUserId.toString()
      );
      const lastReadAt = userState?.lastReadAt || new Date(0);
      return {
        conversation: c._id,
        sender: { $ne: new mongoose.Types.ObjectId(currentUserId) },
        createdAt: { $gt: lastReadAt },
      };
    });

    const unreadStats = await Message.aggregate([
      { $match: { $or: matchConditions } },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]);

    for (const stat of unreadStats) {
      unreadCountMap.set(stat._id.toString(), stat.count);
    }
  }

  const formattedConversations = conversations.map((conv) => {
    const otherUserDoc = (conv.participants || []).find(
      (p) => p._id.toString() !== currentUserId.toString()
    );

    return {
      id: conv._id,
      otherUser: formatSafeUser(otherUserDoc),
      lastMessage: conv.lastMessage?.content
        ? {
            content: conv.lastMessage.content,
            createdAt: conv.lastMessage.createdAt,
          }
        : null,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: unreadCountMap.get(conv._id.toString()) || 0,
    };
  });

  const totalPages = Math.ceil(totalConversations / parsedLimit);

  return {
    conversations: formattedConversations,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalConversations,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
    },
  };
};

/**
 * Retrieves details of a single conversation.
 * Verifies that the authenticated user is a participant.
 *
 * @param {string} conversationId
 * @param {string} currentUserId
 * @returns {Promise<Object>}
 */
export const getConversationById = async (conversationId, currentUserId) => {
  validateObjectId(conversationId, 'Conversation');

  const conversation = await Conversation.findById(conversationId)
    .populate('participants', 'username fullName profilePicture isVerified')
    .lean();

  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
  }

  const isParticipant = (conversation.participants || []).some(
    (p) => p._id.toString() === currentUserId.toString()
  );

  if (!isParticipant) {
    throw ApiError.forbidden('You are not authorized to view this conversation');
  }

  const otherUserDoc = (conversation.participants || []).find(
    (p) => p._id.toString() !== currentUserId.toString()
  );

  if (otherUserDoc) {
    const isBlocked = await blockService.areUsersBlocked(currentUserId, otherUserDoc._id);
    if (isBlocked) {
      throw ApiError.forbidden('You cannot access this conversation because one of the users is blocked');
    }
  }

  const userState = (conversation.participantStates || []).find(
    (s) => s.user.toString() === currentUserId.toString()
  );
  const lastReadAt = userState?.lastReadAt || new Date(0);

  const unreadCount = await Message.countDocuments({
    conversation: conversationId,
    sender: { $ne: currentUserId },
    createdAt: { $gt: lastReadAt },
  });

  return {
    id: conversation._id,
    otherUser: formatSafeUser(otherUserDoc),
    lastMessage: conversation.lastMessage?.content
      ? {
          content: conversation.lastMessage.content,
          createdAt: conversation.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount,
  };
};

/**
 * Sends a message in a conversation.
 * Sender is strictly derived from verified JWT.
 * Updates Conversation.lastMessage, lastMessageAt, and sender's lastReadAt atomically.
 *
 * @param {string} conversationId
 * @param {string} currentUserId
 * @param {Object} messageData { content }
 * @returns {Promise<Object>}
 */
export const sendMessage = async (conversationId, currentUserId, messageData = {}) => {
  validateObjectId(conversationId, 'Conversation');

  const { content, clientMessageId } = messageData || {};
  if (typeof content !== 'string') {
    throw ApiError.badRequest('Message content must be a string');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    throw ApiError.badRequest('Message content cannot be empty');
  }

  if (trimmedContent.length > 5000) {
    throw ApiError.badRequest('Message content cannot exceed 5000 characters');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
  }

  // Authorization check: User must be a participant
  const isParticipant = conversation.participants.some(
    (p) => p.toString() === currentUserId.toString()
  );

  if (!isParticipant) {
    throw ApiError.forbidden('You are not authorized to send messages in this conversation');
  }

  const otherParticipantId = (conversation.participants || []).find(
    (p) => p.toString() !== currentUserId.toString()
  );
  if (otherParticipantId) {
    await blockService.assertUsersNotBlocked(currentUserId, otherParticipantId);
  }

  const cleanClientMessageId =
    typeof clientMessageId === 'string' && clientMessageId.trim()
      ? clientMessageId.trim()
      : null;

  // Duplicate protection / idempotency: check if already persisted
  if (cleanClientMessageId) {
    const existingMessage = await Message.findOne({
      sender: currentUserId,
      clientMessageId: cleanClientMessageId,
    }).populate('sender', 'username fullName profilePicture isVerified');

    if (existingMessage) {
      const formatted = formatMessage(existingMessage);
      Object.defineProperty(formatted, '_conversation', {
        value: {
          id: conversation._id.toString(),
          participants: conversation.participants.map((p) => p.toString()),
          lastMessage: {
            content: conversation.lastMessage?.content || existingMessage.content,
            createdAt: conversation.lastMessage?.createdAt || existingMessage.createdAt,
          },
          lastMessageAt: conversation.lastMessageAt || existingMessage.createdAt,
        },
        enumerable: false,
        writable: true,
      });
      return formatted;
    }
  }

  // Create message document with race condition safety for clientMessageId
  let message;
  try {
    message = await Message.create({
      conversation: conversationId,
      sender: currentUserId,
      content: trimmedContent,
      ...(cleanClientMessageId ? { clientMessageId: cleanClientMessageId } : {}),
    });
  } catch (error) {
    if (error.code === 11000 && cleanClientMessageId) {
      const existingMessage = await Message.findOne({
        sender: currentUserId,
        clientMessageId: cleanClientMessageId,
      }).populate('sender', 'username fullName profilePicture isVerified');

      if (existingMessage) {
        const formatted = formatMessage(existingMessage);
        Object.defineProperty(formatted, '_conversation', {
          value: {
            id: conversation._id.toString(),
            participants: conversation.participants.map((p) => p.toString()),
            lastMessage: {
              content: conversation.lastMessage?.content || existingMessage.content,
              createdAt: conversation.lastMessage?.createdAt || existingMessage.createdAt,
            },
            lastMessageAt: conversation.lastMessageAt || existingMessage.createdAt,
          },
          enumerable: false,
          writable: true,
        });
        return formatted;
      }
    }
    throw error;
  }

  // Update Conversation denormalized preview and sender lastReadAt
  const now = message.createdAt || new Date();
  conversation.lastMessage = {
    content: trimmedContent.length > 100 ? `${trimmedContent.substring(0, 97)}...` : trimmedContent,
    sender: currentUserId,
    createdAt: now,
  };
  conversation.lastMessageAt = now;

  // Sender has read their own sent message
  const senderState = conversation.participantStates.find(
    (s) => s.user.toString() === currentUserId.toString()
  );
  if (senderState) {
    senderState.lastReadAt = now;
  } else {
    conversation.participantStates.push({ user: currentUserId, lastReadAt: now });
  }

  await conversation.save();

  await message.populate('sender', 'username fullName profilePicture isVerified');

  const formatted = formatMessage(message);
  Object.defineProperty(formatted, '_conversation', {
    value: {
      id: conversation._id.toString(),
      participants: conversation.participants.map((p) => p.toString()),
      lastMessage: {
        content: conversation.lastMessage.content,
        createdAt: conversation.lastMessage.createdAt,
      },
      lastMessageAt: conversation.lastMessageAt,
    },
    enumerable: false,
    writable: true,
  });

  return formatted;
};

/**
 * Retrieves paginated messages for a conversation (chat history).
 * Returns messages in chronological order (oldest -> newest).
 * Supports backward cursor pagination (before=<cursor>) to load older messages.
 *
 * @param {string} conversationId
 * @param {string} currentUserId
 * @param {Object} options { limit, before }
 * @returns {Promise<{ messages: Array<Object>, pagination: Object }>}
 */
export const getConversationMessages = async (
  conversationId,
  currentUserId,
  { limit = 30, before } = {}
) => {
  validateObjectId(conversationId, 'Conversation');

  const conversation = await Conversation.findById(conversationId)
    .select('participants participantStates')
    .lean();
  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
  }

  const isParticipant = (conversation.participants || []).some(
    (p) => p.toString() === currentUserId.toString()
  );

  if (!isParticipant) {
    throw ApiError.forbidden('You are not authorized to view messages in this conversation');
  }

  const otherParticipant = (conversation.participants || []).find(
    (p) => p.toString() !== currentUserId.toString()
  );
  if (otherParticipant) {
    const isBlocked = await blockService.areUsersBlocked(currentUserId, otherParticipant);
    if (isBlocked) {
      throw ApiError.forbidden('You cannot view messages because one of the users is blocked');
    }
  }

  // Extract lastReadAt timestamps for both participants to compute dynamic isRead
  const currentUserState = (conversation.participantStates || []).find(
    (s) => s.user.toString() === currentUserId.toString()
  );
  const currentUserLastReadAt = currentUserState?.lastReadAt
    ? new Date(currentUserState.lastReadAt).getTime()
    : 0;

  const recipientState = (conversation.participantStates || []).find(
    (s) => s.user.toString() === otherParticipant?.toString()
  );
  const recipientLastReadAt = recipientState?.lastReadAt
    ? new Date(recipientState.lastReadAt).getTime()
    : 0;

  const rawLimit = parseInt(limit, 10);
  if (isNaN(rawLimit) || rawLimit < 1) {
    throw ApiError.badRequest('Limit must be a positive integer');
  }
  const parsedLimit = Math.min(100, Math.max(1, rawLimit));

  const filter = { conversation: conversationId };

  if (before) {
    const decoded = decodeCursor(before);
    filter.$or = [
      { createdAt: { $lt: decoded.createdAt } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ];
  }

  // Query newest to oldest for the given slice
  const messagesDesc = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(parsedLimit + 1)
    .populate('sender', 'username fullName profilePicture isVerified')
    .lean();

  const hasMore = messagesDesc.length > parsedLimit;
  const resultMessages = hasMore ? messagesDesc.slice(0, parsedLimit) : messagesDesc;

  // The cursor points to the oldest message in this retrieved slice
  const nextCursor =
    hasMore && resultMessages.length > 0
      ? encodeCursor({
          createdAt: resultMessages[resultMessages.length - 1].createdAt,
          id: resultMessages[resultMessages.length - 1]._id,
        })
      : null;

  // Reverse back to chronological order (oldest to newest) for client chat display
  const messagesAsc = [...resultMessages].reverse();

  // Compute isRead dynamically in O(1) time without extra database queries
  const messagesWithReadState = messagesAsc.map((msg) => {
    const formatted = formatMessage(msg);
    const msgCreatedAt = new Date(msg.createdAt).getTime();
    const isSentByCurrentUser =
      msg.sender?._id?.toString() === currentUserId.toString() ||
      msg.sender?.toString() === currentUserId.toString();

    const isRead = isSentByCurrentUser
      ? msgCreatedAt <= recipientLastReadAt
      : msgCreatedAt <= currentUserLastReadAt;

    return {
      ...formatted,
      isRead,
    };
  });

  return {
    messages: messagesWithReadState,
    pagination: {
      limit: parsedLimit,
      nextCursor,
    },
  };
};

/**
 * Marks a conversation as read for the authenticated user.
 * Updates the user's participantStates.lastReadAt to the current timestamp.
 *
 * @param {string} conversationId
 * @param {string} currentUserId
 * @returns {Promise<Object>}
 */
export const markConversationAsRead = async (conversationId, currentUserId) => {
  validateObjectId(conversationId, 'Conversation');

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw ApiError.notFound('Conversation not found');
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === currentUserId.toString()
  );

  if (!isParticipant) {
    throw ApiError.forbidden('You are not authorized to modify this conversation');
  }

  const now = new Date();
  const userState = conversation.participantStates.find(
    (s) => s.user.toString() === currentUserId.toString()
  );

  if (userState) {
    userState.lastReadAt = now;
  } else {
    conversation.participantStates.push({ user: currentUserId, lastReadAt: now });
  }

  await conversation.save();

  const otherParticipant = conversation.participants.find(
    (p) => p.toString() !== currentUserId.toString()
  );

  return {
    message: 'Conversation marked as read',
    conversationId: conversation._id.toString(),
    userId: currentUserId.toString(),
    otherUserId: otherParticipant ? otherParticipant.toString() : null,
    lastReadAt: now,
    readAt: now,
    unreadCount: 0,
  };
};

export default {
  createOrGetConversation,
  getUserConversations,
  getConversationById,
  sendMessage,
  getConversationMessages,
  markConversationAsRead,
};
