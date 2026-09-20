import api from './api.js';

export const commentService = {
  /**
   * Gets paginated top-level comments for a post.
   */
  async getPostComments(postId, { page = 1, limit = 10 } = {}) {
    return api.get(`/posts/${postId}/comments?page=${page}&limit=${limit}`);
  },

  /**
   * Creates a top-level comment on a post.
   */
  async createComment(postId, content) {
    return api.post(`/posts/${postId}/comments`, { content });
  },

  /**
   * Gets paginated replies for a comment.
   */
  async getCommentReplies(commentId, { page = 1, limit = 10 } = {}) {
    return api.get(`/comments/${commentId}/replies?page=${page}&limit=${limit}`);
  },

  /**
   * Creates a reply to a top-level comment.
   */
  async createReply(commentId, content) {
    return api.post(`/comments/${commentId}/replies`, { content });
  },

  /**
   * Updates a comment (author only).
   */
  async updateComment(commentId, content) {
    return api.patch(`/comments/${commentId}`, { content });
  },

  /**
   * Deletes a comment (author or post owner).
   */
  async deleteComment(commentId) {
    return api.delete(`/comments/${commentId}`);
  },
};

export default commentService;
