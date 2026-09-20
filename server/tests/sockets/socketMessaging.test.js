import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../../src/app.js';
import initSocket from '../../src/socket/index.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { createTestUser } from '../helpers/authHelper.js';
import { createTestConversation } from '../helpers/entityHelper.js';
import { createSocketClient, waitForSocketEvent } from '../helpers/socketHelper.js';
import Message from '../../src/models/Message.js';
import Block from '../../src/models/Block.js';
import User from '../../src/models/User.js';

describe('Socket.IO — Messaging & Conversation Events', () => {
  let server;
  let io;
  let port;

  beforeAll(async () => {
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (io) await io.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('allows authorized participant to join conversation room', async () => {
    const userA = await createTestUser({ username: 'joiner_a' });
    const userB = await createTestUser({ username: 'joiner_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const clientA = await createSocketClient(tokenA, port);

    const response = await new Promise((resolve) => {
      clientA.emit('conversation:join', { conversationId: conversation._id.toString() }, (ack) => {
        resolve(ack);
      });
    });

    expect(response.success).toBe(true);
    expect(response.conversationId).toBe(conversation._id.toString());

    clientA.disconnect();
  });

  it('rejects join request from non-participant user (IDOR prevention)', async () => {
    const userA = await createTestUser({ username: 'part_a' });
    const userB = await createTestUser({ username: 'part_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const outsider = await createTestUser({ username: 'outsider' });
    const tokenOutsider = generateAccessToken({ userId: outsider._id, role: outsider.role });
    const clientOutsider = await createSocketClient(tokenOutsider, port);

    const response = await new Promise((resolve) => {
      clientOutsider.emit('conversation:join', { conversationId: conversation._id.toString() }, (ack) => {
        resolve(ack);
      });
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('CONVERSATION_ACCESS_DENIED');

    clientOutsider.disconnect();
  });

  it('rejects join request when participants have an active bilateral block', async () => {
    const userA = await createTestUser({ username: 'blocked_joiner_a' });
    const userB = await createTestUser({ username: 'blocked_joiner_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    await Block.create({ blocker: userA._id, blocked: userB._id });

    const tokenB = generateAccessToken({ userId: userB._id, role: userB.role });
    const clientB = await createSocketClient(tokenB, port);

    const response = await new Promise((resolve) => {
      clientB.emit('conversation:join', { conversationId: conversation._id.toString() }, (ack) => {
        resolve(ack);
      });
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('CONVERSATION_ACCESS_DENIED');

    clientB.disconnect();
  });

  it('allows leaving a conversation room', async () => {
    const userA = await createTestUser({ username: 'leaver_a' });
    const userB = await createTestUser({ username: 'leaver_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const clientA = await createSocketClient(tokenA, port);

    const response = await new Promise((resolve) => {
      clientA.emit('conversation:leave', { conversationId: conversation._id.toString() }, (ack) => {
        resolve(ack);
      });
    });

    expect(response.success).toBe(true);
    expect(response.conversationId).toBe(conversation._id.toString());

    clientA.disconnect();
  });

  it('persists message to MongoDB and delivers real-time message:new to conversation room', async () => {
    const userA = await createTestUser({ username: 'sender_a' });
    const userB = await createTestUser({ username: 'receiver_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const tokenB = generateAccessToken({ userId: userB._id, role: userB.role });

    const clientA = await createSocketClient(tokenA, port);
    const clientB = await createSocketClient(tokenB, port);

    // Both join conversation room
    await new Promise((resolve) => {
      clientA.emit('conversation:join', { conversationId: conversation._id.toString() }, resolve);
    });
    await new Promise((resolve) => {
      clientB.emit('conversation:join', { conversationId: conversation._id.toString() }, resolve);
    });

    // Client B listens for incoming message
    const messagePromise = waitForSocketEvent(clientB, 'message:new');

    // Client A sends message
    const ack = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: conversation._id.toString(),
          content: 'Hello over real-time socket!',
        },
        resolve
      );
    });

    expect(ack.success).toBe(true);
    expect(ack.message.content).toBe('Hello over real-time socket!');

    // Wait for client B to receive the event
    const receivedEvent = await messagePromise;
    expect(receivedEvent.content).toBe('Hello over real-time socket!');
    const senderId = (receivedEvent.sender?.id || receivedEvent.sender?._id || receivedEvent.sender).toString();
    expect(senderId).toBe(userA._id.toString());

    // Verify persistence in MongoDB
    const persisted = await Message.findOne({
      conversation: conversation._id,
      content: 'Hello over real-time socket!',
    });
    expect(persisted).not.toBeNull();
    expect(persisted.sender.toString()).toBe(userA._id.toString());

    clientA.disconnect();
    clientB.disconnect();
  });

  it('disconnects and rejects message:send if sender account is suspended', async () => {
    const userA = await createTestUser({ username: 'suspended_sender', accountStatus: 'SUSPENDED' });
    const userB = await createTestUser({ username: 'receiver_for_suspended' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const clientA = await createSocketClient(tokenA, port);

    const disconnectPromise = new Promise((resolve) => {
      clientA.on('disconnect', resolve);
    });

    const ack = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: conversation._id.toString(),
          content: 'I am suspended',
        },
        resolve
      );
    });

    expect(ack.success).toBe(false);
    expect(ack.error.code).toBe('ACCOUNT_SUSPENDED');

    // Socket should have been forcibly disconnected
    await disconnectPromise;
    expect(clientA.connected).toBe(false);
  });

  it('marks conversation as read and emits message:read event to the other participant', async () => {
    const userA = await createTestUser({ username: 'reader_a' });
    const userB = await createTestUser({ username: 'author_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const tokenB = generateAccessToken({ userId: userB._id, role: userB.role });

    const clientA = await createSocketClient(tokenA, port);
    const clientB = await createSocketClient(tokenB, port);

    // User B listens on personal room for message:read
    const readPromise = waitForSocketEvent(clientB, 'message:read');

    // User A calls conversation:read
    const ack = await new Promise((resolve) => {
      clientA.emit('conversation:read', { conversationId: conversation._id.toString() }, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.conversationId).toBe(conversation._id.toString());
    expect(ack.readAt).toBeDefined();

    const readEvent = await readPromise;
    expect(readEvent.conversationId).toBe(conversation._id.toString());
    expect(readEvent.userId).toBe(userA._id.toString());

    clientA.disconnect();
    clientB.disconnect();
  });
});
