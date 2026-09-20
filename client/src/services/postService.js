import api from './api.js';

export const postService = {
  /**
   * Fetches home activity feed using cursor-based pagination.
   */
  async getFeed({ cursor, limit = 10 } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', limit);
    return api.get(`/feed?${params.toString()}`);
  },

  /**
   * Fetches explore / public posts feed.
   */
  async getPublicPosts({ page = 1, limit = 10 } = {}) {
    return api.get(`/posts?page=${page}&limit=${limit}`);
  },

  /**
   * Fetches a single post by ID.
   */
  async getPostById(postId) {
    return api.get(`/posts/${postId}`);
  },

  /**
   * Creates a new post with multipart image upload and caption.
   */
  async createPost(formData) {
    return api.upload('/posts', formData);
  },

  /**
   * Updates an existing post's caption/location (owner only).
   */
  async updatePost(postId, data) {
    return api.patch(`/posts/${postId}`, data);
  },

  /**
   * Deletes a post (owner only).
   */
  async deletePost(postId) {
    return api.delete(`/posts/${postId}`);
  },

  /**
   * Toggles like/unlike on a post.
   * Returns authoritative { isLiked, likesCount }.
   */
  async toggleLike(postId) {
    return api.post(`/posts/${postId}/like`);
  },
};

export default postService;
