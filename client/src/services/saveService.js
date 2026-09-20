import api from './api.js';

export const saveService = {
  /**
   * Saves a post.
   */
  async savePost(postId) {
    return api.post(`/posts/${postId}/save`);
  },

  /**
   * Unsaves a post.
   */
  async unsavePost(postId) {
    return api.delete(`/posts/${postId}/save`);
  },

  /**
   * Checks if a post is saved by the current user.
   */
  async getSaveStatus(postId) {
    return api.get(`/posts/${postId}/save-status`);
  },

  /**
   * Gets the current user's saved posts with pagination.
   */
  async getSavedPosts({ page = 1, limit = 12 } = {}) {
    return api.get(`/users/me/saved-posts?page=${page}&limit=${limit}`);
  },
};

export default saveService;
