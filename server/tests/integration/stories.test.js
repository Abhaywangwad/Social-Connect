import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Story from '../../src/models/Story.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestStory } from '../helpers/entityHelper.js';
import { _setCustomMediaHandlers, _resetCustomMediaHandlers } from '../../src/services/mediaService.js';
import { VALID_JPEG_BUFFER } from '../fixtures/dummyImages.js';

describe('Integration: Stories & 24h TTL Filtering', () => {
  beforeEach(() => {
    _setCustomMediaHandlers(
      async (buf, opts) => ({
        type: 'image',
        url: 'https://res.cloudinary.com/mock/image/upload/v1/test_story.jpg',
        publicId: 'test_story_public_id',
        width: 1080,
        height: 1920,
      }),
      async (publicId) => ({ result: 'ok' })
    );
  });

  afterEach(() => {
    _resetCustomMediaHandlers();
  });

  it('creates an ephemeral story with media', async () => {
    const user = await createTestUser();
    const loginData = await loginTestUser(user);

    const res = await request(app)
      .post('/api/stories')
      .set(loginData.authHeader)
      .attach('media', VALID_JPEG_BUFFER, 'story.jpg');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.story.media.url).toBeDefined();
    expect(new Date(res.body.data.story.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('retrieves active stories and excludes expired stories even before MongoDB TTL purge', async () => {
    const user = await createTestUser();
    const loginData = await loginTestUser(user);

    // Create an active story (expires in 24 hours)
    const activeStory = await createTestStory(user._id, {
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Create an expired story (expired 1 hour ago)
    const expiredStory = await createTestStory(user._id, {
      expiresAt: new Date(Date.now() - 3600 * 1000),
    });

    const res = await request(app)
      .get('/api/stories')
      .set(loginData.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stories = res.body.data.stories;
    const storyIds = stories.map((s) => (s.id || s._id).toString());
    expect(storyIds).toContain(activeStory._id.toString());
    expect(storyIds).not.toContain(expiredStory._id.toString());
  });

  it('allows story owner to delete story and forbids strangers (IDOR check)', async () => {
    const owner = await createTestUser();
    const stranger = await createTestUser();
    const ownerLogin = await loginTestUser(owner);
    const strangerLogin = await loginTestUser(stranger);

    const story = await createTestStory(owner._id);

    // Stranger deletion -> 403 Forbidden
    const forbiddenRes = await request(app)
      .delete(`/api/stories/${story._id}`)
      .set(strangerLogin.authHeader);
    expect(forbiddenRes.status).toBe(403);

    // Owner deletion -> 200 OK
    const deleteRes = await request(app)
      .delete(`/api/stories/${story._id}`)
      .set(ownerLogin.authHeader);
    expect(deleteRes.status).toBe(200);

    expect(await Story.findById(story._id)).toBeNull();
  });
});
