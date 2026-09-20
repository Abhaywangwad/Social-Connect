import api from './api.js';

export const adminService = {
  // ─── Reports ─────────────────────────────────────────────────────────────────

  /**
   * Lists reports with optional filters.
   */
  async listReports({ status, targetType, page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);
    if (targetType) params.set('targetType', targetType);
    return api.get(`/admin/reports?${params.toString()}`);
  },

  /**
   * Gets a single report with full target entity details.
   */
  async getReport(reportId) {
    return api.get(`/admin/reports/${reportId}`);
  },

  /**
   * Updates a report's status (OPEN → REVIEWING → RESOLVED/DISMISSED).
   */
  async updateReportStatus(reportId, { status, moderationNote } = {}) {
    return api.patch(`/admin/reports/${reportId}/status`, { status, moderationNote });
  },

  // ─── User Moderation ──────────────────────────────────────────────────────────

  /**
   * Lists all users with admin-level filters.
   */
  async listUsers({ q, accountStatus, role, page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (q) params.set('q', q);
    if (accountStatus) params.set('accountStatus', accountStatus);
    if (role) params.set('role', role);
    return api.get(`/admin/users?${params.toString()}`);
  },

  /**
   * Suspends or reactivates a user account.
   */
  async updateUserStatus(userId, { status, reason } = {}) {
    return api.patch(`/admin/users/${userId}/status`, { status, reason });
  },

  // ─── Content Moderation ───────────────────────────────────────────────────────

  /**
   * Sets moderation status on a post (ACTIVE, HIDDEN, REMOVED).
   */
  async moderatePost(postId, { status, reason } = {}) {
    return api.patch(`/admin/posts/${postId}/moderation`, { status, reason });
  },

  /**
   * Sets moderation status on a comment.
   */
  async moderateComment(commentId, { status, reason } = {}) {
    return api.patch(`/admin/comments/${commentId}/moderation`, { status, reason });
  },

  /**
   * Sets moderation status on a story.
   */
  async moderateStory(storyId, { status, reason } = {}) {
    return api.patch(`/admin/stories/${storyId}/moderation`, { status, reason });
  },

  // ─── Audit Logs ───────────────────────────────────────────────────────────────

  /**
   * Gets audit logs with optional action/targetId filters.
   */
  async getAuditLogs({ action, targetId, page = 1, limit = 20 } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (action) params.set('action', action);
    if (targetId) params.set('targetId', targetId);
    return api.get(`/admin/audit-logs?${params.toString()}`);
  },
};

export default adminService;
