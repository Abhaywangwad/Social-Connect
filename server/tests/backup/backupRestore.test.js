/**
 * Disaster Recovery: MongoDB Backup, Restore & Relational Integrity Tests
 *
 * This suite is SELF-CONTAINED. It manages its own dedicated MongoDB connections
 * so it is not affected by the global clearDatabase() lifecycle that runs between
 * every other test's beforeEach/afterEach hooks.
 *
 * What is tested:
 *  1. Backup creation — compressed archive, SHA-256 checksum, metadata file
 *  2. Archive verification — integrity check and tamper detection
 *  3. Safety guardrail — restore refuses to overwrite production without confirmation
 *  4. End-to-end restore — backup → isolated database restore
 *  5. Post-restore verification — indexes, schema fields, relational FK consistency
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runBackup } from '../../scripts/backup.js';
import { runRestore } from '../../scripts/restore.js';
import { verifyBackupArchive } from '../../scripts/verify_backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Test Configuration ──────────────────────────────────────────────────────

const SOURCE_DB = 'social-connect-backup-source';
const RESTORE_DB = 'social-connect-restore-test';
const SOURCE_URI = `mongodb://localhost:27017/${SOURCE_DB}`;
const RESTORE_URI = `mongodb://localhost:27017/${RESTORE_DB}`;

// Use a directory relative to the test file so cwd doesn't matter
const TEST_BACKUP_DIR = path.resolve(__dirname, '../../test_backups_staging');

// Longer timeout for backup/restore I/O operations
const OP_TIMEOUT = 60_000;

// ─── Suite State ─────────────────────────────────────────────────────────────

let sourceConn = null;
let createdArchive = null;

// Document IDs seeded into source DB — used for FK verification after restore
let user1Id, user2Id, post1Id, convo1Id;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal-but-valid document matching each model's required fields.
 * We operate directly via the raw MongoDB driver so Mongoose schema validation
 * middleware does not interfere with the backup/restore stress data.
 */
async function seedSourceDatabase(db) {
  // Clean slate
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    await db.collection(c.name).drop().catch(() => {});
  }

  const users = db.collection('users');
  const posts = db.collection('posts');
  const comments = db.collection('comments');
  const likes = db.collection('likes');
  const saves = db.collection('saves');
  const follows = db.collection('follows');
  const conversations = db.collection('conversations');
  const messages = db.collection('messages');
  const notifications = db.collection('notifications');

  // Insert Users
  const now = new Date();
  user1Id = new mongoose.Types.ObjectId();
  user2Id = new mongoose.Types.ObjectId();

  await users.insertMany([
    {
      _id: user1Id,
      username: `backup_u1_${Date.now()}`,
      fullName: 'Backup User One',
      email: `bu1_${Date.now()}@example.com`,
      password: '$2b$10$HashedPasswordHashHere1234567890',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: user2Id,
      username: `backup_u2_${Date.now()}`,
      fullName: 'Backup User Two',
      email: `bu2_${Date.now()}@example.com`,
      password: '$2b$10$HashedPasswordHashHere1234567890',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Create minimal indexes on users (mirrors actual application indexes)
  await users.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
  await users.createIndex({ username: 1 }, { unique: true, name: 'username_1' });

  // Insert Post
  post1Id = new mongoose.Types.ObjectId();
  await posts.insertMany([
    {
      _id: post1Id,
      author: user1Id,
      caption: 'Crucial post for backup verification #disasterrecovery',
      media: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', publicId: 'sample_id' }],
      moderationStatus: 'ACTIVE',
      likesCount: 0,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await posts.createIndex({ author: 1, createdAt: -1 }, { name: 'author_1_createdAt_-1' });
  await posts.createIndex({ moderationStatus: 1, createdAt: -1 }, { name: 'moderationStatus_1_createdAt_-1' });

  // Insert Comment
  await comments.insertOne({
    _id: new mongoose.Types.ObjectId(),
    post: post1Id,
    author: user2Id,
    content: 'Important comment to be restored',
    createdAt: now,
    updatedAt: now,
  });
  await comments.createIndex({ post: 1, createdAt: -1 }, { name: 'post_1_createdAt_-1' });

  // Insert Like
  await likes.insertOne({
    _id: new mongoose.Types.ObjectId(),
    user: user2Id,
    post: post1Id,
    createdAt: now,
  });
  await likes.createIndex({ user: 1, post: 1 }, { unique: true, name: 'user_1_post_1' });

  // Insert Save
  await saves.insertOne({
    _id: new mongoose.Types.ObjectId(),
    user: user2Id,
    post: post1Id,
    createdAt: now,
  });
  await saves.createIndex({ user: 1, post: 1 }, { unique: true, name: 'user_1_post_1' });

  // Insert Follow
  await follows.insertOne({
    _id: new mongoose.Types.ObjectId(),
    follower: user2Id,
    following: user1Id,
    createdAt: now,
  });
  await follows.createIndex({ follower: 1, following: 1 }, { unique: true, name: 'follower_1_following_1' });

  // Insert Conversation
  convo1Id = new mongoose.Types.ObjectId();
  const sorted = [user1Id.toString(), user2Id.toString()].sort();
  await conversations.insertOne({
    _id: convo1Id,
    participants: [user1Id, user2Id],
    conversationKey: `${sorted[0]}:${sorted[1]}`,
    participantStates: [
      { user: user1Id, lastReadAt: now },
      { user: user2Id, lastReadAt: now },
    ],
    createdAt: now,
    updatedAt: now,
  });
  await conversations.createIndex({ conversationKey: 1 }, { unique: true, name: 'conversationKey_1' });

  // Insert Message
  await messages.insertOne({
    _id: new mongoose.Types.ObjectId(),
    conversation: convo1Id,
    sender: user1Id,
    content: 'Hello, testing backup message preservation!',
    readBy: [user1Id],
    createdAt: now,
    updatedAt: now,
  });
  await messages.createIndex({ conversation: 1, createdAt: 1 }, { name: 'conversation_1_createdAt_1' });

  // Insert Notification
  await notifications.insertOne({
    _id: new mongoose.Types.ObjectId(),
    recipient: user1Id,
    actor: user2Id,
    type: 'LIKE',
    post: post1Id,
    read: false,
    createdAt: now,
  });
  await notifications.createIndex({ recipient: 1, read: 1, createdAt: -1 }, { name: 'recipient_1_read_1_createdAt_-1' });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Disaster Recovery: MongoDB Backup, Restore & Relational Integrity', () => {
  // ── Global setup: connect to source DB, seed, run backup ──────────────────
  beforeAll(async () => {
    // Ensure staging directory exists
    if (!fs.existsSync(TEST_BACKUP_DIR)) {
      fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true });
    }

    // Open dedicated source connection (bypasses global Mongoose state)
    sourceConn = await mongoose.createConnection(SOURCE_URI, {
      serverSelectionTimeoutMS: 10000,
    }).asPromise();

    await seedSourceDatabase(sourceConn.db);
  }, OP_TIMEOUT);

  // ── Global teardown: drop both scratch databases, remove temp files ────────
  afterAll(async () => {
    // Remove backup staging directory
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }

    // Drop source test DB
    if (sourceConn) {
      await sourceConn.db.dropDatabase().catch(() => {});
      await sourceConn.close();
    }

    // Drop restore target DB
    try {
      const conn = await mongoose.createConnection(RESTORE_URI, {
        serverSelectionTimeoutMS: 5000,
      }).asPromise();
      await conn.db.dropDatabase().catch(() => {});
      await conn.close();
    } catch (_e) {}
  }, OP_TIMEOUT);

  // ── Test 1: Backup Creation & Integrity ────────────────────────────────────
  it('creates a compressed backup archive with valid SHA-256 checksum and metadata', async () => {
    const backupResult = await runBackup({
      backupDir: TEST_BACKUP_DIR,
      mongoUri: SOURCE_URI,
    });

    expect(backupResult.success).toBe(true);
    expect(fs.existsSync(backupResult.archivePath)).toBe(true);
    expect(fs.existsSync(backupResult.checksumPath)).toBe(true);
    expect(fs.existsSync(backupResult.metaPath)).toBe(true);
    expect(backupResult.sizeBytes).toBeGreaterThan(0);
    expect(backupResult.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(backupResult.totalDocuments).toBeGreaterThan(0);

    // Verify metadata JSON
    const meta = JSON.parse(fs.readFileSync(backupResult.metaPath, 'utf8'));
    expect(meta.status).toBe('COMPLETED');
    expect(meta.database).toBe(SOURCE_DB);
    expect(meta.collectionsCount).toBeGreaterThan(0);
    expect(meta.sha256).toBe(backupResult.sha256);

    createdArchive = backupResult.archivePath;
  }, OP_TIMEOUT);

  // ── Test 2: Archive Verification & Tamper Detection ────────────────────────
  it('verifies archive integrity and detects corrupted or tampered archives', () => {
    expect(createdArchive).not.toBeNull();

    // Happy path: valid archive
    const verifyResult = verifyBackupArchive(createdArchive);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.shaVerified).toBe(true);
    expect(verifyResult.collectionsCount).toBeGreaterThan(0);
    expect(verifyResult.totalDocuments).toBeGreaterThan(0);
    expect(verifyResult.collections.users).toBeDefined();
    expect(verifyResult.collections.posts).toBeDefined();

    // Tamper path: single-byte corruption in the middle of the archive
    const tamperedPath = path.join(TEST_BACKUP_DIR, 'tampered.archive.gz');
    fs.copyFileSync(createdArchive, tamperedPath);
    // Copy the original checksum file so the verifier can detect the mismatch
    fs.copyFileSync(`${createdArchive}.sha256`, `${tamperedPath}.sha256`);

    const buf = fs.readFileSync(tamperedPath);
    buf[Math.floor(buf.length / 2)] ^= 0xff;
    fs.writeFileSync(tamperedPath, buf);

    expect(() => verifyBackupArchive(tamperedPath)).toThrow(/checksum mismatch|decompression|parsing/i);
  });

  // ── Test 3: Safety Guardrail — Production Confirmation ────────────────────
  it('blocks dangerous restore operations when confirmation is omitted on production', async () => {
    await expect(
      runRestore(createdArchive, {
        mongoUri: 'mongodb://localhost:27017/social-connect',
        confirm: false,
      })
    ).rejects.toThrow(/SAFETY GUARD/);
  }, 15_000);

  // ── Test 4: End-to-End Restore into Isolated Database ─────────────────────
  it('restores backup archive cleanly into isolated test database', async () => {
    const restoreResult = await runRestore(createdArchive, {
      mongoUri: RESTORE_URI,
      targetDb: RESTORE_DB,
      confirm: true,
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.database).toBe(RESTORE_DB);
    expect(restoreResult.totalRestoredDocs).toBeGreaterThan(0);
    expect(restoreResult.restoredCollections).toContain('users');
    expect(restoreResult.restoredCollections).toContain('posts');
    expect(restoreResult.restoredCollections).toContain('messages');
    expect(restoreResult.restoredCollections).toContain('conversations');
  }, OP_TIMEOUT);

  // ── Test 5: Post-Restore — Indexes, Fields & Relational Consistency ─────────
  it('verifies indexes, schema fields, and logical foreign-key relationships on restored database', async () => {
    const conn = await mongoose.createConnection(RESTORE_URI, {
      serverSelectionTimeoutMS: 10000,
    }).asPromise();
    const db = conn.db;

    try {
      const usersColl     = db.collection('users');
      const postsColl     = db.collection('posts');
      const commentsColl  = db.collection('comments');
      const likesColl     = db.collection('likes');
      const followsColl   = db.collection('follows');
      const messagesColl  = db.collection('messages');
      const convosColl    = db.collection('conversations');

      // ── A: Representative document spot-checks ─────────────────────────────
      const restoredUser1 = await usersColl.findOne({ _id: user1Id });
      expect(restoredUser1).not.toBeNull();
      expect(restoredUser1.fullName).toBe('Backup User One');

      const restoredPost1 = await postsColl.findOne({ _id: post1Id });
      expect(restoredPost1).not.toBeNull();
      expect(restoredPost1.caption).toContain('#disasterrecovery');
      expect(restoredPost1.author.toString()).toBe(user1Id.toString());

      // ── B: Index verification ──────────────────────────────────────────────
      const userIndexNames = (await usersColl.indexes()).map((i) => i.name);
      expect(userIndexNames.some((n) => n.includes('email'))).toBe(true);
      expect(userIndexNames.some((n) => n.includes('username'))).toBe(true);

      const postIndexNames = (await postsColl.indexes()).map((i) => i.name);
      expect(
        postIndexNames.some((n) => n.includes('moderationStatus') || n.includes('author'))
      ).toBe(true);

      const followIndexNames = (await followsColl.indexes()).map((i) => i.name);
      expect(
        followIndexNames.some((n) => n.includes('follower') || n.includes('following'))
      ).toBe(true);

      const convoIndexNames = (await convosColl.indexes()).map((i) => i.name);
      expect(convoIndexNames.some((n) => n.includes('conversationKey'))).toBe(true);

      // ── C: Relational FK consistency ───────────────────────────────────────

      // Every Post.author → existing User
      for (const p of await postsColl.find({}).toArray()) {
        expect(await usersColl.findOne({ _id: p.author })).not.toBeNull();
      }

      // Every Like.post → existing Post  &  Like.user → existing User
      for (const l of await likesColl.find({}).toArray()) {
        expect(await postsColl.findOne({ _id: l.post })).not.toBeNull();
        expect(await usersColl.findOne({ _id: l.user })).not.toBeNull();
      }

      // Every Comment.post → Post  &  Comment.author → User
      for (const c of await commentsColl.find({}).toArray()) {
        expect(await postsColl.findOne({ _id: c.post })).not.toBeNull();
        expect(await usersColl.findOne({ _id: c.author })).not.toBeNull();
      }

      // Every Message.conversation → Conversation  &  sender → User
      for (const m of await messagesColl.find({}).toArray()) {
        expect(await convosColl.findOne({ _id: m.conversation })).not.toBeNull();
        expect(await usersColl.findOne({ _id: m.sender })).not.toBeNull();
      }
    } finally {
      await conn.close();
    }
  }, OP_TIMEOUT);
});
