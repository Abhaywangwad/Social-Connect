import storyService from '../services/storyService.js';

/**
 * POST /api/stories
 * Creates a new story. Protected (multipart/form-data).
 */
export const createStory = async (req, res, next) => {
  try {
    const story = await storyService.createStory(
      req.user.userId,
      req.body,
      req.file
    );

    res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: { story },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/stories
 * Retrieves active visible stories for current user and followed users.
 */
export const getActiveStories = async (req, res, next) => {
  try {
    const result = await storyService.getActiveStories(
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      message: 'Stories fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/stories/:storyId
 * Retrieves a single active story.
 */
export const getStoryById = async (req, res, next) => {
  try {
    const story = await storyService.getStoryById(
      req.params.storyId,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Story fetched successfully',
      data: { story },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/stories/:storyId
 * Deletes a story. Protected (owner only).
 */
export const deleteStory = async (req, res, next) => {
  try {
    const result = await storyService.deleteStory(
      req.params.storyId,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: { storyId: result.storyId },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createStory,
  getActiveStories,
  getStoryById,
  deleteStory,
};
