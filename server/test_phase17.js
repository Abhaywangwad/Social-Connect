import http from 'http';
import mongoose from 'mongoose';
import { io as ClientIO } from 'socket.io-client';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import config from './src/config/config.js';
import { initSocket } from './src/socket/index.js';
import { presenceManager, rateLimiter } from './src/socket/socketUtils.js';
import { generateToken } from './src/utils/jwt.js';
import User from './src/models/User.js';
import Conversation from './src/models/Conversation.js';
import Message from './src/models/Message.js';
import messageService from './src/services/messageService.js';

const TEST_PORT = 5055;
const TEST_SERVER_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let ioServer;

let userA, userB, userC;
let tokenA, tokenB, tokenC, expiredToken;
let testConversation;

// Helper to create connected client socket with auth
const createClientSocket = (token, options = {}) => {
  return ClientIO(TEST_SERVER_URL, {
    auth: token ? { token } : undefined,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...options,
  });
};

// Helper to wait for event
const waitForEvent = (socket, eventName, timeoutMs = 4000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${eventName}"`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 17 VERIFICATION TEST SUITE');
  console.log('   Real-Time One-to-One Messaging with Socket.IO');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  };

  try {
    // 1. Connect DB and start test HTTP server with Socket.IO
    await connectDB();

    httpServer = http.createServer(app);
    ioServer = initSocket(httpServer);

    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
    console.log(`[Test Server] Running on ${TEST_SERVER_URL}\n`);

    // Clean up test data
    await User.deleteMany({ email: { $regex: /@sockettest\.com$/ } });
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    try {
      await Message.collection.dropIndex('sender_1_clientMessageId_1');
    } catch (e) {}
    await Message.syncIndexes();
    presenceManager.reset();
    rateLimiter.reset();

    // Create test users
    userA = await User.create({
      username: `socket_user_a_${Date.now()}`,
      email: `user_a_${Date.now()}@sockettest.com`,
      password: 'password123',
      fullName: 'Alice Socket',
    });

    userB = await User.create({
      username: `socket_user_b_${Date.now()}`,
      email: `user_b_${Date.now()}@sockettest.com`,
      password: 'password123',
      fullName: 'Bob Socket',
    });

    userC = await User.create({
      username: `socket_user_c_${Date.now()}`,
      email: `user_c_${Date.now()}@sockettest.com`,
      password: 'password123',
      fullName: 'Charlie Socket',
    });

    tokenA = generateToken({ userId: userA._id.toString() }, '1h');
    tokenB = generateToken({ userId: userB._id.toString() }, '1h');
    tokenC = generateToken({ userId: userC._id.toString() }, '1h');
    expiredToken = generateToken({ userId: userA._id.toString() }, '-1s');

    // Create a conversation between userA and userB
    testConversation = await messageService.createOrGetConversation(
      userA._id.toString(),
      userB._id.toString()
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Authenticated socket connection
    // ─────────────────────────────────────────────────────────────
    const clientA = createClientSocket(tokenA);
    await new Promise((resolve, reject) => {
      clientA.on('connect', resolve);
      clientA.on('connect_error', reject);
    });
    assert(clientA.connected, 'Test 1 — Authenticated socket connection succeeds');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Missing JWT
    // ─────────────────────────────────────────────────────────────
    const clientNoAuth = createClientSocket(null);
    const noAuthError = await new Promise((resolve) => {
      clientNoAuth.on('connect_error', (err) => resolve(err));
      clientNoAuth.on('connect', () => resolve(null));
    });
    assert(
      noAuthError && noAuthError.message.includes('Authentication'),
      'Test 2 — Missing JWT connection rejected',
      noAuthError?.message
    );
    clientNoAuth.close();

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Invalid JWT
    // ─────────────────────────────────────────────────────────────
    const clientInvalidAuth = createClientSocket('invalid.jwt.token');
    const invalidAuthError = await new Promise((resolve) => {
      clientInvalidAuth.on('connect_error', (err) => resolve(err));
      clientInvalidAuth.on('connect', () => resolve(null));
    });
    assert(
      invalidAuthError && invalidAuthError.message.includes('Authentication'),
      'Test 3 — Invalid JWT connection rejected',
      invalidAuthError?.message
    );
    clientInvalidAuth.close();

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Expired JWT
    // ─────────────────────────────────────────────────────────────
    const clientExpiredAuth = createClientSocket(expiredToken);
    const expiredAuthError = await new Promise((resolve) => {
      clientExpiredAuth.on('connect_error', (err) => resolve(err));
      clientExpiredAuth.on('connect', () => resolve(null));
    });
    assert(
      expiredAuthError && expiredAuthError.message.includes('Authentication'),
      'Test 4 — Expired JWT connection rejected',
      expiredAuthError?.message
    );
    clientExpiredAuth.close();

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Join own conversation
    // ─────────────────────────────────────────────────────────────
    const joinOwnRes = await new Promise((resolve) => {
      clientA.emit(
        'conversation:join',
        { conversationId: testConversation.id.toString() },
        resolve
      );
    });
    assert(
      joinOwnRes?.success === true &&
        joinOwnRes?.conversationId === testConversation.id.toString(),
      'Test 5 — Participant successfully joins own conversation room'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Join unauthorized conversation
    // ─────────────────────────────────────────────────────────────
    const clientC = createClientSocket(tokenC);
    await new Promise((resolve) => clientC.on('connect', resolve));
    const joinUnauthRes = await new Promise((resolve) => {
      clientC.emit(
        'conversation:join',
        { conversationId: testConversation.id.toString() },
        resolve
      );
    });
    assert(
      joinUnauthRes?.success === false &&
        joinUnauthRes?.error?.code === 'CONVERSATION_ACCESS_DENIED',
      'Test 6 — Unauthorized user rejected when attempting to join conversation',
      JSON.stringify(joinUnauthRes)
    );
    clientC.close();
    await new Promise((r) => setTimeout(r, 50));

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Send message & real-time delivery
    // ─────────────────────────────────────────────────────────────
    const clientB = createClientSocket(tokenB);
    await new Promise((resolve) => clientB.on('connect', resolve));
    await new Promise((resolve) => {
      clientB.emit(
        'conversation:join',
        { conversationId: testConversation.id.toString() },
        resolve
      );
    });

    const bMessagePromise = waitForEvent(clientB, 'message:new');

    const sendRes = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Hello Bob! This is Alice.',
        },
        resolve
      );
    });

    assert(
      sendRes?.success === true &&
        sendRes?.message?.content === 'Hello Bob! This is Alice.' &&
        sendRes?.message?.sender?.id.toString() === userA._id.toString(),
      'Test 7a — Sender receives authoritative persistence acknowledgement'
    );

    const receivedByB = await bMessagePromise;
    assert(
      receivedByB &&
        receivedByB.content === 'Hello Bob! This is Alice.' &&
        receivedByB.sender?.id.toString() === userA._id.toString(),
      'Test 7b — Recipient receives real-time message:new event'
    );

    const savedInDB = await Message.findById(sendRes.message.id);
    assert(
      savedInDB && savedInDB.content === 'Hello Bob! This is Alice.',
      'Test 7c — Message verified persisted in MongoDB'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Offline recipient
    // ─────────────────────────────────────────────────────────────
    clientB.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const offlineSendRes = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Message while you are offline',
        },
        resolve
      );
    });

    if (!offlineSendRes?.success) {
      console.error('[DEBUG] offlineSendRes error:', offlineSendRes);
    }

    assert(
      offlineSendRes?.success === true,
      'Test 8a — Message sent successfully while recipient is offline',
      JSON.stringify(offlineSendRes)
    );

    const offlineMsgInDB = offlineSendRes?.message?.id
      ? await Message.findById(offlineSendRes.message.id)
      : null;
    assert(
      offlineMsgInDB && offlineMsgInDB.content === 'Message while you are offline',
      'Test 8b — Offline message verified persisted in MongoDB'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Reconnect & load history via REST
    // ─────────────────────────────────────────────────────────────
    const clientBReconnected = createClientSocket(tokenB);
    await new Promise((resolve) => clientBReconnected.on('connect', resolve));
    assert(
      clientBReconnected.connected,
      'Test 9a — User B successfully reconnected with fresh JWT'
    );

    const historyResult = await messageService.getConversationMessages(
      testConversation.id.toString(),
      userB._id.toString()
    );
    const foundOfflineMsg = historyResult.messages.some(
      (m) => m.content === 'Message while you are offline'
    );
    assert(
      foundOfflineMsg,
      'Test 9b — Reconnected recipient loads offline message via REST history'
    );
    clientBReconnected.close();

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Duplicate message attempt (clientMessageId idempotency)
    // ─────────────────────────────────────────────────────────────
    const idempotencyKey = `client_msg_${Date.now()}`;
    const firstSend = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Idempotency test message',
          clientMessageId: idempotencyKey,
        },
        resolve
      );
    });

    const secondSend = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Idempotency test message',
          clientMessageId: idempotencyKey,
        },
        resolve
      );
    });

    const dbIdempotentCount = await Message.countDocuments({
      sender: userA._id,
      clientMessageId: idempotencyKey,
    });

    assert(
      firstSend?.success &&
        secondSend?.success &&
        firstSend.message.id.toString() === secondSend.message.id.toString() &&
        dbIdempotentCount === 1,
      'Test 10 — Duplicate message with clientMessageId is idempotent and does not duplicate'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Sender identity forgery attempt
    // ─────────────────────────────────────────────────────────────
    const forgeryRes = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          senderId: userB._id.toString(), // client tries to impersonate Bob
          content: 'Forged identity attempt',
        },
        resolve
      );
    });

    assert(
      forgeryRes?.success &&
        forgeryRes?.message?.sender?.id.toString() === userA._id.toString(),
      'Test 11 — Sender identity is derived strictly from socket JWT, ignoring client senderId'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Empty message validation
    // ─────────────────────────────────────────────────────────────
    const emptyRes = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: '      ',
        },
        resolve
      );
    });

    assert(
      emptyRes?.success === false && emptyRes?.error?.code === 'INVALID_MESSAGE',
      'Test 12 — Empty message rejected with INVALID_MESSAGE'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 13: Message too long validation
    // ─────────────────────────────────────────────────────────────
    const longContent = 'A'.repeat(5001);
    const longRes = await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: longContent,
        },
        resolve
      );
    });

    assert(
      longRes?.success === false && longRes?.error?.code === 'INVALID_MESSAGE',
      'Test 13 — Message > 5000 chars rejected with INVALID_MESSAGE'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 14: Conversation update event
    // ─────────────────────────────────────────────────────────────
    const clientBforUpdate = createClientSocket(tokenB);
    await new Promise((resolve) => clientBforUpdate.on('connect', resolve));
    const convUpdatePromise = waitForEvent(clientBforUpdate, 'conversation:updated');

    await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Preview update text',
        },
        resolve
      );
    });

    const updateEvent = await convUpdatePromise;
    assert(
      updateEvent &&
        updateEvent.conversationId === testConversation.id.toString() &&
        updateEvent.lastMessage?.content === 'Preview update text' &&
        Boolean(updateEvent.lastMessageAt),
      'Test 14 — conversation:updated event emitted with updated preview'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 15: Unread state (delivery does NOT mark read)
    // ─────────────────────────────────────────────────────────────
    const convBeforeRead = await messageService.getConversationById(
      testConversation.id.toString(),
      userB._id.toString()
    );
    assert(
      convBeforeRead.unreadCount > 0,
      'Test 15 — Real-time delivery does not mark as read; unread count > 0 for User B'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 16: Mark as read via REST
    // ─────────────────────────────────────────────────────────────
    const readResult = await messageService.markConversationAsRead(
      testConversation.id.toString(),
      userB._id.toString()
    );
    const convAfterRead = await messageService.getConversationById(
      testConversation.id.toString(),
      userB._id.toString()
    );
    assert(
      readResult.unreadCount === 0 && convAfterRead.unreadCount === 0,
      'Test 16 — Explicit mark as read resets unread count to 0'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 17: Own messages are not counted as unread
    // ─────────────────────────────────────────────────────────────
    const convForSender = await messageService.getConversationById(
      testConversation.id.toString(),
      userA._id.toString()
    );
    assert(
      convForSender.unreadCount === 0,
      'Test 17 — Sender does not count their own sent messages as unread'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 18: Multiple sockets per user (multi-tab support)
    // ─────────────────────────────────────────────────────────────
    // User C connects tab 1
    const clientC1 = createClientSocket(tokenC);
    await new Promise((resolve) => clientC1.on('connect', resolve));
    // User C connects tab 2
    const clientC2 = createClientSocket(tokenC);
    await new Promise((resolve) => clientC2.on('connect', resolve));

    assert(
      presenceManager.isUserOnline(userC._id.toString()),
      'Test 18a — User C online with 2 sockets'
    );

    // Disconnect tab 1
    clientC1.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    assert(
      presenceManager.isUserOnline(userC._id.toString()),
      'Test 18b — Disconnecting 1 tab keeps user online while tab 2 is active'
    );

    // Disconnect tab 2
    clientC2.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    assert(
      !presenceManager.isUserOnline(userC._id.toString()),
      'Test 18c — Disconnecting all tabs marks user offline'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 19: Presence events (online & offline)
    // ─────────────────────────────────────────────────────────────
    const presenceOnlinePromise = waitForEvent(clientA, 'presence:online');
    const clientCNew = createClientSocket(tokenC);
    await new Promise((resolve) => clientCNew.on('connect', resolve));

    const onlineEvent = await presenceOnlinePromise;
    assert(
      onlineEvent?.userId === userC._id.toString(),
      'Test 19a — presence:online event emitted when User C connects'
    );

    const presenceOfflinePromise = waitForEvent(clientA, 'presence:offline');
    clientCNew.disconnect();
    const offlineEvent = await presenceOfflinePromise;
    assert(
      offlineEvent?.userId === userC._id.toString(),
      'Test 19b — presence:offline event emitted when User C disconnects'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 20: Rate limiting on message:send
    // ─────────────────────────────────────────────────────────────
    rateLimiter.reset();
    let rateLimitedEncountered = false;
    // Send 25 messages rapidly
    for (let i = 0; i < 25; i++) {
      const res = await new Promise((resolve) => {
        clientA.emit(
          'message:send',
          {
            conversationId: testConversation.id.toString(),
            content: `Flood test message ${i}`,
          },
          resolve
        );
      });
      if (res?.success === false && res?.error?.code === 'RATE_LIMIT_EXCEEDED') {
        rateLimitedEncountered = true;
        break;
      }
    }
    assert(
      rateLimitedEncountered,
      'Test 20 — Socket-level rate limiter triggers RATE_LIMIT_EXCEEDED on message flooding'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 21: Invalid conversation ID
    // ─────────────────────────────────────────────────────────────
    const invalidIdRes = await new Promise((resolve) => {
      clientA.emit('conversation:join', { conversationId: 'not-a-valid-object-id' }, resolve);
    });
    assert(
      invalidIdRes?.success === false &&
        invalidIdRes?.error?.code === 'INVALID_CONVERSATION_ID',
      'Test 21 — Invalid conversation ID returns clean INVALID_CONVERSATION_ID error'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 22: Non-existent conversation
    // ─────────────────────────────────────────────────────────────
    const fakeId = new mongoose.Types.ObjectId().toString();
    const notFoundRes = await new Promise((resolve) => {
      clientA.emit('conversation:join', { conversationId: fakeId }, resolve);
    });
    assert(
      notFoundRes?.success === false &&
        notFoundRes?.error?.code === 'CONVERSATION_NOT_FOUND',
      'Test 22 — Non-existent conversation returns clean CONVERSATION_NOT_FOUND error'
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 23: REST APIs continue working seamlessly
    // ─────────────────────────────────────────────────────────────
    // 1. /api/health
    const healthRes = await fetch(`${TEST_SERVER_URL}/api/health`);
    const healthJson = await healthRes.json();

    // 2. /api/conversations
    const convListRes = await fetch(`${TEST_SERVER_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const convListJson = await convListRes.json();

    // 3. /api/conversations/:id/messages
    const messagesRes = await fetch(
      `${TEST_SERVER_URL}/api/conversations/${testConversation.id}/messages`,
      {
        headers: { Authorization: `Bearer ${tokenA}` },
      }
    );
    const messagesJson = await messagesRes.json();

    assert(
      healthRes.status === 200 &&
        healthJson.success === true &&
        convListRes.status === 200 &&
        convListJson.data.conversations.length > 0 &&
        messagesRes.status === 200 &&
        messagesJson.data.messages.length > 0,
      'Test 23 — REST APIs (/health, /conversations, /messages) continue to function perfectly alongside Socket.IO'
    );

    // Cleanup client connections
    clientA?.close();
    clientBforUpdate?.close();
    clientC?.close();
  } catch (error) {
    console.error('\n❌ UNEXPECTED TEST RUNNER ERROR:', error);
    failed++;
  } finally {
    if (ioServer) {
      await new Promise((resolve) => ioServer.close(resolve));
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await mongoose.connection.close();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  process.exitCode = failed > 0 ? 1 : 0;
};

runTests();
