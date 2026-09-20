import api from './api.js';

export const notificationService = {
  /**
   * Gets the unread notification count.
   */
  async getUnreadCount() {
    return api.get('/notifications/unread-count');
  },

  /**
   * Gets paginated notification list.
   */
  async getNotifications({ page = 1, limit = 20, unreadOnly = false } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (unreadOnly) params.set('unreadOnly', 'true');
    return api.get(`/notifications?${params.toString()}`);
  },

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(notificationId) {
    return api.patch(`/notifications/${notificationId}/read`);
  },

  /**
   * Marks all notifications as read.
   */
  async markAllAsRead() {
    return api.patch('/notifications/read-all');
  },
};

export default notificationService;
