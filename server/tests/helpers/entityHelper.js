import Post from '../../src/models/Post.js';
import Comment from '../../src/models/Comment.js';
import Story from '../../src/models/Story.js';
import Conversation from '../../src/models/Conversation.js';

let entityCounter = 0;

/**
 * Creates a persisted Post document.
 *
 * @param {string|Object} authorId
 * @param {Object} [overrides]
 * @returns {Promise<import('../../src/models/Post.js').default>}
 */
export const createTestPost = async (authorId, overrides = {}) => {
  entityCounter++;
  return Post.create({
    author: authorId,
    caption: `Test Post Caption #${entityCounter}`,
    media: [
      {
        url: `https://res.cloudinary.com/mock/image/upload/v1/test_post_${entityCounter}.jpg`,
        publicId: `test_post_${entityCounter}`,
        type: 'image',
      },
    ],
    moderationStatus: 'ACTIVE',
    ...overrides,
  });
};

/**
 * Creates a persisted Comment or Reply document.
 *
 * @param {string|Object} postId
 * @param {string|Object} authorId
 * @param {string} [text]
 * @param {Object} [overrides]
 * @returns {Promise<import('../../src/models/Comment.js').default>}
 */
export const createTestComment = async (postId, authorId, text = 'Great post!', overrides = {}) => {
  return Comment.create({
    post: postId,
    author: authorId,
    content: text,
    moderationStatus: 'ACTIVE',
    ...overrides,
  });
};

/**
 * Creates a persisted Story document.
 *
 * @param {string|Object} authorId
 * @param {Object} [overrides]
 * @returns {Promise<import('../../src/models/Story.js').default>}
 */
export const createTestStory = async (authorId, overrides = {}) => {
  entityCounter++;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return Story.create({
    author: authorId,
    media: {
      url: `https://res.cloudinary.com/mock/image/upload/v1/test_story_${entityCounter}.jpg`,
      publicId: `test_story_${entityCounter}`,
      type: 'image',
    },
    expiresAt,
    moderationStatus: 'ACTIVE',
    ...overrides,
  });
};

/**
 * Creates or retrieves a 1:1 Conversation document between two users.
 *
 * @param {string|Object} userAId
 * @param {string|Object} userBId
 * @returns {Promise<import('../../src/models/Conversation.js').default>}
 */
export const createTestConversation = async (userAId, userBId) => {
  const sorted = [userAId.toString(), userBId.toString()].sort();
  return Conversation.create({
    participants: sorted,
    conversationKey: sorted.join(':'),
    participantStates: [
      { user: sorted[0], lastReadAt: new Date() },
      { user: sorted[1], lastReadAt: new Date() },
    ],
  });
};

export default {
  createTestPost,
  createTestComment,
  createTestStory,
  createTestConversation,
};
