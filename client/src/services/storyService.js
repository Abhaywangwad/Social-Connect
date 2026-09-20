import api from './api.js';

export const storyService = {
  /**
   * Gets active stories for the current user and followed users.
   */
  async getActiveStories() {
    return api.get('/stories');
  },

  /**
   * Gets a specific story by ID.
   */
  async getStoryById(storyId) {
    return api.get(`/stories/${storyId}`);
  },

  /**
   * Creates a new story. Expects FormData with 'media' file and optional 'caption'.
   */
  async createStory(formData) {
    return api.upload('/stories', formData);
  },

  /**
   * Deletes a story (owner only).
   */
  async deleteStory(storyId) {
    return api.delete(`/stories/${storyId}`);
  },
};

export default storyService;
