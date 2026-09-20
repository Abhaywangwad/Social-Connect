import api from './api.js';

export const messageService = {
  /**
   * Creates or retrieves a conversation with a recipient.
   */
  async createConversation(recipientId) {
    return api.post('/conversations', { recipientId, targetUserId: recipientId });
  },

  /**
   * Gets paginated list of conversations for the current user.
   */
  async getConversations({ page = 1, limit = 20 } = {}) {
    return api.get(`/conversations?page=${page}&limit=${limit}`);
  },

  /**
   * Gets details for a specific conversation.
   */
  async getConversationById(conversationId) {
    return api.get(`/conversations/${conversationId}`);
  },

  /**
   * Sends a REST message to a conversation (fallback when socket is unavailable).
   */
  async sendMessage(conversationId, content) {
    return api.post(`/conversations/${conversationId}/messages`, { content });
  },

  /**
   * Gets paginated messages for a conversation using cursor-based pagination.
   */
  async getMessages(conversationId, { cursor, limit = 30 } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit);
    return api.get(`/conversations/${conversationId}/messages?${params.toString()}`);
  },

  /**
   * Marks a conversation as read via REST (complements Socket.IO read receipts).
   */
  async markConversationAsRead(conversationId) {
    return api.patch(`/conversations/${conversationId}/read`);
  },
};

export default messageService;
