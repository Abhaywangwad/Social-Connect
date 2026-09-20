import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import messageService from '../services/messageService.js';
import blockService from '../services/blockService.js';
import {
  getUserRoom,
  getConversationRoom,
  formatSocketError,
  presenceManager,
  rateLimiter,
} from './socketUtils.js';
import typingManager from './typingManager.js';
import logger from '../utils/logger.js';
import metrics from '../utils/metrics.js';

/**
 * Registers all Socket.IO event handlers for an authenticated socket connection.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerSocketHandlers = (io, socket) => {
  const userId = socket.user.userId;

  // 1. Automatically join personal user room for direct user-targeted events
  socket.join(getUserRoom(userId));

  // 2. Track in-memory metrics and connection logging
  metrics.recordSocketConnect();
  logger.info('[Socket.IO] Client connected', {
    socketId: socket.id,
    userId,
    transport: socket.conn?.transport?.name,
  });

  // 3. Track in-memory presence; emit online event if this is user's first active socket
  const { isFirst } = presenceManager.addSocket(userId);
  if (isFirst) {
    io.emit('presence:online', { userId });
  }

  /**
   * ─── conversation:join ──────────────────────────────────────────────────────
   * Joins an authorized conversation room.
   */
  socket.on('conversation:join', async (data, callback = () => {}) => {
    try {
      const { conversationId } = data || {};

      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      const conversation = await Conversation.findById(conversationId)
        .select('participants')
        .lean();

      if (!conversation) {
        return callback(
          formatSocketError('CONVERSATION_NOT_FOUND', 'Conversation not found')
        );
      }

      const isParticipant = (conversation.participants || []).some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback(
          formatSocketError(
            'CONVERSATION_ACCESS_DENIED',
            'You are not a participant in this conversation'
          )
        );
      }

      const otherParticipant = (conversation.participants || []).find(
        (p) => p.toString() !== userId.toString()
      );

      if (otherParticipant && (await blockService.areUsersBlocked(userId, otherParticipant))) {
        return callback(
          formatSocketError(
            'CONVERSATION_ACCESS_DENIED',
            'You cannot access this conversation because one of the users is blocked'
          )
        );
      }

      const roomName = getConversationRoom(conversationId);
      socket.join(roomName);

      return callback({
        success: true,
        conversationId: conversationId.toString(),
      });
    } catch (err) {
      return callback(
        formatSocketError('JOIN_FAILED', 'Unable to join conversation')
      );
    }
  });

  /**
   * ─── conversation:leave ─────────────────────────────────────────────────────
   * Leaves a conversation room.
   */
  socket.on('conversation:leave', (data, callback = () => {}) => {
    try {
      const { conversationId } = data || {};

      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      const roomName = getConversationRoom(conversationId);
      socket.leave(roomName);

      return callback({
        success: true,
        conversationId: conversationId.toString(),
      });
    } catch (err) {
      return callback(
        formatSocketError('LEAVE_FAILED', 'Unable to leave conversation')
      );
    }
  });

  /**
   * ─── message:send ───────────────────────────────────────────────────────────
   * Persists message to MongoDB first via messageService, then emits to recipients.
   */
  socket.on('message:send', async (data, callback = () => {}) => {
    try {
      // 1. Socket rate-limiting check
      if (!rateLimiter.checkLimit(socket.id)) {
        return callback(
          formatSocketError(
            'RATE_LIMIT_EXCEEDED',
            'Too many message attempts. Please slow down.'
          )
        );
      }

      // 2. Account suspension check
      // Defense-in-depth: socket connections are disconnected on suspension,
      // but access tokens may briefly remain valid for their TTL window.
      const senderStatus = await User.findById(userId).select('accountStatus').lean();
      if (!senderStatus || senderStatus.accountStatus !== 'ACTIVE') {
        callback(
          formatSocketError('ACCOUNT_SUSPENDED', 'Your account has been suspended')
        );
        setTimeout(() => socket.disconnect(true), 50);
        return;
      }

      const { conversationId, content, clientMessageId } = data || {};

      // 3. Validate conversation ID
      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      // 3. Content validation
      if (typeof content !== 'string') {
        return callback(
          formatSocketError('INVALID_MESSAGE', 'Message content must be a string')
        );
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        return callback(
          formatSocketError('INVALID_MESSAGE', 'Message content cannot be empty')
        );
      }

      if (trimmedContent.length > 5000) {
        return callback(
          formatSocketError('INVALID_MESSAGE', 'Message content cannot exceed 5000 characters')
        );
      }

      // 4. Persist message via messageService (MongoDB remains single source of truth)
      // Note: Sender is strictly derived from verified socket.user.userId
      const message = await messageService.sendMessage(conversationId, userId, {
        content: trimmedContent,
        clientMessageId,
      });

      // 5. Authoritative acknowledgement returned to sender
      callback({
        success: true,
        message,
      });

      // 6. Broadcast real-time message to other participants in the conversation room
      socket.to(getConversationRoom(conversationId)).emit('message:new', message);

      // 7. Emit conversation preview updates to participants' personal rooms
      const participants = message._conversation?.participants || [];
      const updatePayload = {
        conversationId: conversationId.toString(),
        lastMessage: {
          content: message.content,
          createdAt: message.createdAt,
        },
        lastMessageAt: message._conversation?.lastMessageAt || message.createdAt,
      };

      for (const participantId of participants) {
        io.to(getUserRoom(participantId)).emit('conversation:updated', updatePayload);
      }

      // 8. Clear active typing state on message send
      const otherParticipantId = participants.find((p) => p.toString() !== userId.toString());
      const wasTyping = typingManager.stopTyping(conversationId, userId);
      if (wasTyping.shouldBroadcast && otherParticipantId) {
        io.to(getUserRoom(otherParticipantId)).emit('typing:stop', {
          conversationId: conversationId.toString(),
          userId,
        });
      }
    } catch (error) {
      metrics.recordSocketMessageFailure();
      logger.warn('[Socket.IO] Message delivery failed', {
        socketId: socket.id,
        userId,
        error: error.message,
      });

      let code = 'MESSAGE_SEND_FAILED';
      let clientMsg = 'Message could not be sent';

      if (error.statusCode === 400 || error.name === 'ValidationError') {
        code = 'INVALID_MESSAGE';
        clientMsg = error.message;
      } else if (error.statusCode === 404) {
        code = 'CONVERSATION_NOT_FOUND';
        clientMsg = error.message;
      } else if (error.statusCode === 403) {
        code = 'CONVERSATION_ACCESS_DENIED';
        clientMsg = error.message;
      }

      return callback(formatSocketError(code, clientMsg));
    }
  });

  /**
   * ─── conversation:read ──────────────────────────────────────────────────────
   * Persists read state in MongoDB via messageService, then emits message:read.
   */
  socket.on('conversation:read', async (data, callback = () => {}) => {
    try {
      const { conversationId } = data || {};

      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      // 1. Update lastReadAt in MongoDB via messageService
      const result = await messageService.markConversationAsRead(conversationId, userId);

      // 2. Authoritative acknowledgement returned to caller
      callback({
        success: true,
        conversationId: result.conversationId,
        readAt: result.readAt,
      });

      // 3. Emit real-time read receipt to the other participant
      if (result.otherUserId) {
        io.to(getUserRoom(result.otherUserId)).emit('message:read', {
          conversationId: result.conversationId,
          userId,
          readAt: result.readAt,
        });
      }
    } catch (error) {
      let code = 'READ_FAILED';
      if (error.statusCode === 403) {
        code = 'CONVERSATION_ACCESS_DENIED';
      } else if (error.statusCode === 404) {
        code = 'CONVERSATION_NOT_FOUND';
      } else if (error.statusCode === 400) {
        code = 'INVALID_CONVERSATION_ID';
      }
      return callback(
        formatSocketError(code, error.message || 'Unable to mark conversation as read')
      );
    }
  });

  /**
   * ─── typing:start ───────────────────────────────────────────────────────────
   * Ephemeral in-memory typing indicator start event.
   */
  socket.on('typing:start', async (data, callback = () => {}) => {
    try {
      const { conversationId } = data || {};

      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      const conversation = await Conversation.findById(conversationId)
        .select('participants')
        .lean();

      if (!conversation) {
        return callback(
          formatSocketError('CONVERSATION_NOT_FOUND', 'Conversation not found')
        );
      }

      const isParticipant = (conversation.participants || []).some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback(
          formatSocketError(
            'CONVERSATION_ACCESS_DENIED',
            'You are not a participant in this conversation'
          )
        );
      }

      const otherParticipantId = (conversation.participants || []).find(
        (p) => p.toString() !== userId.toString()
      );

      if (!otherParticipantId) {
        return callback({ success: true });
      }

      if (await blockService.areUsersBlocked(userId, otherParticipantId)) {
        return callback(
          formatSocketError(
            'CONVERSATION_ACCESS_DENIED',
            'Cannot send typing indicator to a blocked user'
          )
        );
      }

      const { shouldBroadcast } = typingManager.startTyping(
        conversationId,
        userId,
        socket.id,
        (expired) => {
          io.to(getUserRoom(otherParticipantId)).emit('typing:stop', {
            conversationId: expired.conversationId,
            userId: expired.userId,
          });
        }
      );

      // Only broadcast if transitioning to typing (prevents redundant spam)
      if (shouldBroadcast) {
        io.to(getUserRoom(otherParticipantId)).emit('typing:start', {
          conversationId: conversationId.toString(),
          userId,
        });
      }

      callback({ success: true });
    } catch (error) {
      return callback(
        formatSocketError('TYPING_ERROR', 'Unable to process typing start')
      );
    }
  });

  /**
   * ─── typing:stop ────────────────────────────────────────────────────────────
   * Ephemeral in-memory typing indicator stop event.
   */
  socket.on('typing:stop', async (data, callback = () => {}) => {
    try {
      const { conversationId } = data || {};

      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return callback(
          formatSocketError('INVALID_CONVERSATION_ID', 'Invalid conversation ID format')
        );
      }

      const conversation = await Conversation.findById(conversationId)
        .select('participants')
        .lean();

      if (!conversation) {
        return callback(
          formatSocketError('CONVERSATION_NOT_FOUND', 'Conversation not found')
        );
      }

      const isParticipant = (conversation.participants || []).some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        return callback(
          formatSocketError(
            'CONVERSATION_ACCESS_DENIED',
            'You are not a participant in this conversation'
          )
        );
      }

      const otherParticipantId = (conversation.participants || []).find(
        (p) => p.toString() !== userId.toString()
      );

      const { shouldBroadcast } = typingManager.stopTyping(conversationId, userId);

      if (shouldBroadcast && otherParticipantId) {
        io.to(getUserRoom(otherParticipantId)).emit('typing:stop', {
          conversationId: conversationId.toString(),
          userId,
        });
      }

      callback({ success: true });
    } catch (error) {
      return callback(
        formatSocketError('TYPING_ERROR', 'Unable to process typing stop')
      );
    }
  });

  /**
   * ─── disconnect ─────────────────────────────────────────────────────────────
   * Handles socket termination, cleans up rate limiter and typing state.
   */
  socket.on('disconnect', (reason) => {
    rateLimiter.cleanup(socket.id);
    metrics.recordSocketDisconnect(reason);
    logger.info('[Socket.IO] Client disconnected', {
      socketId: socket.id,
      userId,
      reason,
      transport: socket.conn?.transport?.name,
    });

    // Clean up active typing state and notify other participants if user stopped typing
    typingManager.handleDisconnect(socket.id, async ({ conversationId, userId: stoppedUserId }) => {
      try {
        const conv = await Conversation.findById(conversationId).select('participants').lean();
        if (conv) {
          const otherId = (conv.participants || []).find(
            (p) => p.toString() !== stoppedUserId.toString()
          );
          if (otherId) {
            io.to(getUserRoom(otherId)).emit('typing:stop', {
              conversationId,
              userId: stoppedUserId,
            });
          }
        }
      } catch (err) {}
    });

    const { isLast } = presenceManager.removeSocket(userId);
    if (isLast) {
      io.emit('presence:offline', { userId });
    }
  });
};

export default registerSocketHandlers;

