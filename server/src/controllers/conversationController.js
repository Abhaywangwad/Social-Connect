import messageService from '../services/messageService.js';
import { getIO } from '../socket/index.js';
import { getUserRoom } from '../socket/socketUtils.js';

/**
 * POST /api/conversations
 * Creates or retrieves a one-to-one conversation.
 */
export const createConversation = async (req, res, next) => {
  try {
    const targetUserId = req.body.userId || req.body.targetUserId || req.body.recipientId;
    const conversation = await messageService.createOrGetConversation(
      req.user.userId,
      targetUserId
    );

    res.status(200).json({
      success: true,
      message: 'Conversation retrieved successfully',
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations
 * Retrieves all conversations for the authenticated user.
 */
export const getUserConversations = async (req, res, next) => {
  try {
    const result = await messageService.getUserConversations(
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      message: 'Conversations fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations/:conversationId
 * Retrieves a single conversation by ID.
 */
export const getConversationById = async (req, res, next) => {
  try {
    const conversation = await messageService.getConversationById(
      req.params.conversationId,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Conversation fetched successfully',
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/conversations/:conversationId/messages
 * Sends a message in a conversation.
 */
export const sendMessage = async (req, res, next) => {
  try {
    const message = await messageService.sendMessage(
      req.params.conversationId,
      req.user.userId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations/:conversationId/messages
 * Retrieves paginated chat messages for a conversation.
 */
export const getConversationMessages = async (req, res, next) => {
  try {
    const result = await messageService.getConversationMessages(
      req.params.conversationId,
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      message: 'Messages fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/conversations/:conversationId/read
 * Marks a conversation as read for the authenticated user.
 */
export const markConversationAsRead = async (req, res, next) => {
  try {
    const result = await messageService.markConversationAsRead(
      req.params.conversationId,
      req.user.userId
    );

    if (result.otherUserId) {
      try {
        const io = getIO();
        io.to(getUserRoom(result.otherUserId)).emit('message:read', {
          conversationId: result.conversationId,
          userId: req.user.userId,
          readAt: result.readAt,
        });
      } catch (err) {
        // Live socket emission failure does not compromise HTTP response
      }
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createConversation,
  getUserConversations,
  getConversationById,
  sendMessage,
  getConversationMessages,
  markConversationAsRead,
};
