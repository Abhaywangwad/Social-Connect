import api from './api.js';

export const userService = {
  /**
   * Fetches the current authenticated user's detailed profile.
   */
  async getMyProfile() {
    return api.get('/users/me');
  },

  /**
   * Updates profile information (fullName, bio, profilePicture, isPrivate).
   */
  async updateProfile(profileData) {
    return api.patch('/users/me', profileData);
  },

  /**
   * Fetches a public user profile by username.
   */
  async getUserProfile(username) {
    return api.get(`/users/${encodeURIComponent(username)}`);
  },

  /**
   * Fetches posts grid for a user profile.
   */
  async getUserPosts(username, { cursor, limit = 12 } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit);
    const query = params.toString() ? `?${params.toString()}` : '';
    return api.get(`/users/${encodeURIComponent(username)}/posts${query}`);
  },

  /**
   * Searches users with debouncing support and cursor pagination.
   */
  async searchUsers({ q, cursor, limit = 20 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit);
    return api.get(`/users/search?${params.toString()}`);
  },

  /**
   * Follows a user.
   */
  async followUser(username) {
    return api.post(`/users/${encodeURIComponent(username)}/follow`);
  },

  /**
   * Unfollows a user.
   */
  async unfollowUser(username) {
    return api.delete(`/users/${encodeURIComponent(username)}/follow`);
  },

  /**
   * Gets follow relationship status for a user.
   */
  async getFollowStatus(username) {
    return api.get(`/users/${encodeURIComponent(username)}/follow-status`);
  },

  /**
   * Gets paginated followers list.
   */
  async getFollowers(username, { page = 1, limit = 20 } = {}) {
    return api.get(`/users/${encodeURIComponent(username)}/followers?page=${page}&limit=${limit}`);
  },

  /**
   * Gets paginated following list.
   */
  async getFollowing(username, { page = 1, limit = 20 } = {}) {
    return api.get(`/users/${encodeURIComponent(username)}/following?page=${page}&limit=${limit}`);
  },

  /**
   * Blocks a user.
   */
  async blockUser(username) {
    return api.post(`/users/${encodeURIComponent(username)}/block`);
  },

  /**
   * Unblocks a user.
   */
  async unblockUser(username) {
    return api.delete(`/users/${encodeURIComponent(username)}/block`);
  },

  /**
   * Checks block status with a user.
   */
  async getBlockStatus(username) {
    return api.get(`/users/${encodeURIComponent(username)}/block-status`);
  },

  /**
   * Gets the authenticated user's blocked users list.
   */
  async getBlockedUsers() {
    return api.get('/users/me/blocked');
  },
};

export default userService;
