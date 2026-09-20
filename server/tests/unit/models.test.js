import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Follow from '../../src/models/Follow.js';
import Like from '../../src/models/Like.js';
import Save from '../../src/models/Save.js';
import Conversation from '../../src/models/Conversation.js';
import Post from '../../src/models/Post.js';
import { createTestUser } from '../helpers/authHelper.js';
import { createTestPost } from '../helpers/entityHelper.js';

describe('Unit: Mongoose Model Constraints & Indexes', () => {
  describe('User Model', () => {
    it('enforces unique username constraint', async () => {
      await createTestUser({ username: 'uniqueuser' });
      await expect(
        createTestUser({ username: 'uniqueuser', email: 'different@example.com' })
      ).rejects.toThrow(/duplicate key|E11000/i);
    });

    it('enforces unique email constraint', async () => {
      await createTestUser({ email: 'duplicate@example.com' });
      await expect(
        createTestUser({ username: 'differentusername', email: 'duplicate@example.com' })
      ).rejects.toThrow(/duplicate key|E11000/i);
    });

    it('requires mandatory fields: username, email, password', async () => {
      const user = new User({});
      let err;
      try {
        await user.validate();
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.password).toBeDefined();
    });

    it('populates default schema values correctly', async () => {
      const user = await createTestUser();
      expect(user.role).toBe('USER');
      expect(user.accountStatus).toBe('ACTIVE');
      expect(user.followersCount).toBe(0);
      expect(user.followingCount).toBe(0);
    });

    it('excludes password hash when serialized to JSON', async () => {
      const user = await createTestUser({ password: 'SuperSecretPassword123!' });
      const json = user.toJSON();
      expect(json.password).toBeUndefined();
      expect(json._id).toBeDefined();
      expect(json.username).toBeDefined();
    });
  });

  describe('Follow Model', () => {
    it('enforces unique compound index on (follower, following)', async () => {
      const u1 = await createTestUser();
      const u2 = await createTestUser();

      await Follow.create({ follower: u1._id, following: u2._id });

      await expect(
        Follow.create({ follower: u1._id, following: u2._id })
      ).rejects.toThrow(/duplicate key|E11000/i);
    });
  });

  describe('Like Model', () => {
    it('enforces unique compound index on (user, post)', async () => {
      const user = await createTestUser();
      const post = await createTestPost(user._id);

      await Like.create({ user: user._id, post: post._id });

      await expect(
        Like.create({ user: user._id, post: post._id })
      ).rejects.toThrow(/duplicate key|E11000/i);
    });
  });

  describe('Save Model', () => {
    it('enforces unique compound index on (user, post)', async () => {
      const user = await createTestUser();
      const post = await createTestPost(user._id);

      await Save.create({ user: user._id, post: post._id });

      await expect(
        Save.create({ user: user._id, post: post._id })
      ).rejects.toThrow(/duplicate key|E11000/i);
    });
  });

  describe('Conversation Model', () => {
    it('requires at least 2 participants', async () => {
      const user = await createTestUser();
      const conv = new Conversation({ participants: [user._id] });
      let err;
      try {
        await conv.validate();
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
    });
  });
});
