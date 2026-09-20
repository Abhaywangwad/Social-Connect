import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../../src/app.js';
import initSocket from '../../src/socket/index.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { createTestUser } from '../helpers/authHelper.js';
import { createTestConversation } from '../helpers/entityHelper.js';
import { createSocketClient, waitForSocketEvent } from '../helpers/socketHelper.js';
import Message from '../../src/models/Message.js';
import Conversation from '../../src/models/Conversation.js';

describe('Socket.IO — Presence & Typing Indicators', () => {
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

  it('broadcasts presence:online on initial connection and presence:offline upon disconnect', async () => {
    const observer = await createTestUser({ username: 'observer_user' });
    const connectingUser = await createTestUser({ username: 'connecting_user' });

    const observerToken = generateAccessToken({ userId: observer._id, role: observer.role });
    const connectingToken = generateAccessToken({ userId: connectingUser._id, role: connectingUser.role });

    const observerClient = await createSocketClient(observerToken, port);

    // Setup listener for presence:online
    const onlinePromise = waitForSocketEvent(observerClient, 'presence:online');

    // Connect user
    const userClient = await createSocketClient(connectingToken, port);
    const onlineEvent = await onlinePromise;

    expect(onlineEvent.userId).toBe(connectingUser._id.toString());

    // Setup listener for presence:offline
    const offlinePromise = waitForSocketEvent(observerClient, 'presence:offline');

    // Disconnect user
    userClient.disconnect();
    const offlineEvent = await offlinePromise;

    expect(offlineEvent.userId).toBe(connectingUser._id.toString());

    observerClient.disconnect();
  });

  it('delivers ephemeral typing:start and typing:stop events without writing to MongoDB', async () => {
    const userA = await createTestUser({ username: 'typer_a' });
    const userB = await createTestUser({ username: 'listener_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const tokenB = generateAccessToken({ userId: userB._id, role: userB.role });

    const clientA = await createSocketClient(tokenA, port);
    const clientB = await createSocketClient(tokenB, port);

    const messageCountBefore = await Message.countDocuments();
    const conversationCountBefore = await Conversation.countDocuments();

    // 1. typing:start
    const typingStartPromise = waitForSocketEvent(clientB, 'typing:start');
    const startAck = await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: conversation._id.toString() }, resolve);
    });
    expect(startAck.success).toBe(true);

    const typingStartData = await typingStartPromise;
    expect(typingStartData.conversationId).toBe(conversation._id.toString());
    expect(typingStartData.userId).toBe(userA._id.toString());

    // 2. typing:stop
    const typingStopPromise = waitForSocketEvent(clientB, 'typing:stop');
    const stopAck = await new Promise((resolve) => {
      clientA.emit('typing:stop', { conversationId: conversation._id.toString() }, resolve);
    });
    expect(stopAck.success).toBe(true);

    const typingStopData = await typingStopPromise;
    expect(typingStopData.conversationId).toBe(conversation._id.toString());
    expect(typingStopData.userId).toBe(userA._id.toString());

    // 3. Verify zero database mutations occurred
    const messageCountAfter = await Message.countDocuments();
    const conversationCountAfter = await Conversation.countDocuments();
    expect(messageCountAfter).toBe(messageCountBefore);
    expect(conversationCountAfter).toBe(conversationCountBefore);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('automatically broadcasts typing:stop when user disconnects while actively typing', async () => {
    const userA = await createTestUser({ username: 'disconnect_typer_a' });
    const userB = await createTestUser({ username: 'disconnect_listener_b' });
    const conversation = await createTestConversation(userA._id, userB._id);

    const tokenA = generateAccessToken({ userId: userA._id, role: userA.role });
    const tokenB = generateAccessToken({ userId: userB._id, role: userB.role });

    const clientA = await createSocketClient(tokenA, port);
    const clientB = await createSocketClient(tokenB, port);

    // User A starts typing
    await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: conversation._id.toString() }, resolve);
    });

    // User B listens for typing:stop triggered by disconnect
    const stopPromise = waitForSocketEvent(clientB, 'typing:stop');

    // Disconnect user A
    clientA.disconnect();

    const stopEvent = await stopPromise;
    expect(stopEvent.conversationId).toBe(conversation._id.toString());
    expect(stopEvent.userId).toBe(userA._id.toString());

    clientB.disconnect();
  });
});
