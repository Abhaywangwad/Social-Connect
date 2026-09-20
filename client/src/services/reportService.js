import api from './api.js';

export const reportService = {
  /**
   * Submits a moderation report for a post, comment, story, or user.
   */
  async createReport({ targetType, targetId, reason, details, description }) {
    return api.post('/reports', {
      targetType,
      targetId,
      reason,
      details: details || description || '',
    });
  },
};

export default reportService;
