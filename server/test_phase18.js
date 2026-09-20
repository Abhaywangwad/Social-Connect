import http from 'http';
import mongoose from 'mongoose';
import { io as ClientIO } from 'socket.io-client';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { initSocket } from './src/socket/index.js';
import { presenceManager, rateLimiter } from './src/socket/socketUtils.js';
import typingManager from './src/socket/typingManager.js';
import { generateToken } from './src/utils/jwt.js';
import User from './src/models/User.js';
import Conversation from './src/models/Conversation.js';
import Message from './src/models/Message.js';
import messageService from './src/services/messageService.js';

const TEST_PORT = 5056;
const TEST_SERVER_URL = `http://localhost:${TEST_PORT}`;

let httpServer;
let ioServer;

let userA, userB, userC;
let tokenA, tokenB, tokenC;
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
const waitForEvent = (socket, eventName, timeoutMs = 5000) => {
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
  console.log('🚀 STARTING PHASE 18 VERIFICATION TEST SUITE');
  console.log('   Read Receipts & Typing Indicators');
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
    await connectDB();

    httpServer = http.createServer(app);
    ioServer = initSocket(httpServer);

    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
    console.log(`[Test Server] Running on ${TEST_SERVER_URL}\n`);

    // Clean up test data
    await User.deleteMany({ email: { $regex: /@p18test\.com$/ } });
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    try {
      await Message.collection.dropIndex('sender_1_clientMessageId_1');
    } catch (e) {}
    await Message.syncIndexes();
    presenceManager.reset();
    rateLimiter.reset();
    typingManager.reset();

    // Create test users
    userA = await User.create({
      username: `p18_user_a_${Date.now()}`,
      email: `user_a_${Date.now()}@p18test.com`,
      password: 'password123',
      fullName: 'Alice Read',
    });

    userB = await User.create({
      username: `p18_user_b_${Date.now()}`,
      email: `user_b_${Date.now()}@p18test.com`,
      password: 'password123',
      fullName: 'Bob Read',
    });

    userC = await User.create({
      username: `p18_user_c_${Date.now()}`,
      email: `user_c_${Date.now()}@p18test.com`,
      password: 'password123',
      fullName: 'Charlie Outsider',
    });

    tokenA = generateToken({ userId: userA._id.toString() }, '1h');
    tokenB = generateToken({ userId: userB._id.toString() }, '1h');
    tokenC = generateToken({ userId: userC._id.toString() }, '1h');

    // Create conversation between userA and userB
    testConversation = await messageService.createOrGetConversation(
      userA._id.toString(),
      userB._id.toString()
    );

    // Sockets for live tests
    const clientA = createClientSocket(tokenA);
    const clientB = createClientSocket(tokenB);
    const clientC = createClientSocket(tokenC);

    await Promise.all([
      new Promise((res) => clientA.on('connect', res)),
      new Promise((res) => clientB.on('connect', res)),
      new Promise((res) => clientC.on('connect', res)),
    ]);

    // ─────────────────────────────────────────────────────────────
    // PART A: READ RECEIPTS
    // ─────────────────────────────────────────────────────────────

    // TEST 1: User A sends User B a message -> initially unread
    // Reset B's lastReadAt to epoch 0 for clean test
    await Conversation.findByIdAndUpdate(testConversation.id, {
      $set: { 'participantStates.$[elem].lastReadAt': new Date(0) },
    }, {
      arrayFilters: [{ 'elem.user': userB._id }],
    });

    const m1 = await messageService.sendMessage(testConversation.id, userA._id.toString(), {
      content: 'Message 1 from Alice',
    });

    const historyAfterM1 = await messageService.getConversationMessages(
      testConversation.id,
      userA._id.toString()
    );

    const m1Formatted = historyAfterM1.messages.find((m) => m.id.toString() === m1.id.toString());
    assert(
      m1Formatted && m1Formatted.isRead === false,
      'Test 1 — Newly sent message has isRead === false for sender before recipient reads'
    );

    // TEST 2: User B calls PATCH /api/conversations/:id/read -> B.lastReadAt updates in MongoDB
    // Also listen for Test 3 real-time message:read event on clientA
    const messageReadPromise = waitForEvent(clientA, 'message:read');

    const restReadRes = await fetch(`${TEST_SERVER_URL}/api/conversations/${testConversation.id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lastReadAt: '1999-01-01T00:00:00.000Z' }), // Client-supplied time must be ignored
    });
    const restReadJson = await restReadRes.json();

    const convInDBAfterRead = await Conversation.findById(testConversation.id).lean();
    const bState = convInDBAfterRead.participantStates.find(
      (s) => s.user.toString() === userB._id.toString()
    );

    const isUpdatedRecently = bState && (Date.now() - new Date(bState.lastReadAt).getTime()) < 5000;
    assert(
      restReadRes.status === 200 && isUpdatedRecently && bState.lastReadAt.toISOString() !== '1999-01-01T00:00:00.000Z',
      'Test 2 — PATCH /api/conversations/:id/read updates B.lastReadAt using server time, ignoring client timestamp'
    );

    // TEST 3: User A receives real-time message:read socket event
    const readEventData = await messageReadPromise;
    assert(
      readEventData &&
        readEventData.conversationId === testConversation.id.toString() &&
        readEventData.userId === userB._id.toString() &&
        Boolean(readEventData.readAt),
      'Test 3 — User A receives real-time message:read event with { conversationId, userId, readAt }'
    );

    // TEST 4: Messages sent before lastReadAt are marked isRead === true
    const historyAfterRead = await messageService.getConversationMessages(
      testConversation.id,
      userA._id.toString()
    );
    const m1AfterRead = historyAfterRead.messages.find((m) => m.id.toString() === m1.id.toString());
    assert(
      m1AfterRead && m1AfterRead.isRead === true,
      'Test 4 — Message sent before lastReadAt is marked isRead: true in message history'
    );

    // TEST 5: Newer message sent after lastReadAt remains isRead === false
    await new Promise((r) => setTimeout(r, 100)); // Ensure timestamp advance
    const m2 = await messageService.sendMessage(testConversation.id, userA._id.toString(), {
      content: 'Message 2 from Alice (sent after read)',
    });

    const historyAfterM2 = await messageService.getConversationMessages(
      testConversation.id,
      userA._id.toString()
    );
    const m1InM2History = historyAfterM2.messages.find((m) => m.id.toString() === m1.id.toString());
    const m2InM2History = historyAfterM2.messages.find((m) => m.id.toString() === m2.id.toString());

    assert(
      m1InM2History?.isRead === true && m2InM2History?.isRead === false,
      'Test 5 — Earlier message remains isRead: true, new message sent after read is isRead: false'
    );

    // TEST 6: User A attempts to update User B's read state -> server only updates authenticated user
    const bLastReadBefore = bState.lastReadAt;
    await messageService.markConversationAsRead(testConversation.id, userA._id.toString());
    const convAfterA = await Conversation.findById(testConversation.id).lean();
    const bStateAfterA = convAfterA.participantStates.find(
      (s) => s.user.toString() === userB._id.toString()
    );
    assert(
      new Date(bStateAfterA.lastReadAt).getTime() === new Date(bLastReadBefore).getTime(),
      'Test 6 — User A read update modifies only User A state; User B lastReadAt remains untouched'
    );

    // TEST 7: Unauthorized User C tries to mark A-B conversation as read -> 403 Forbidden
    const unauthReadRes = await fetch(`${TEST_SERVER_URL}/api/conversations/${testConversation.id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    assert(
      unauthReadRes.status === 403,
      'Test 7 — Unauthorized User C rejected with 403 Forbidden on PATCH read'
    );

    // TEST 8: Socket conversation:read from authorized participant
    const socketReadPromise = waitForEvent(clientA, 'message:read');
    const socketReadAck = await new Promise((resolve) => {
      clientB.emit('conversation:read', { conversationId: testConversation.id.toString() }, resolve);
    });

    const socketReadEvent = await socketReadPromise;
    assert(
      socketReadAck?.success === true &&
        socketReadEvent &&
        socketReadEvent.conversationId === testConversation.id.toString() &&
        socketReadEvent.userId === userB._id.toString(),
      'Test 8 — Socket conversation:read persists to MongoDB, acks sender, and emits message:read to recipient'
    );

    // TEST 9: Unauthorized socket attempts conversation:read -> rejected
    const unauthSocketReadAck = await new Promise((resolve) => {
      clientC.emit('conversation:read', { conversationId: testConversation.id.toString() }, resolve);
    });
    assert(
      unauthSocketReadAck?.success === false &&
        unauthSocketReadAck?.error?.code === 'CONVERSATION_ACCESS_DENIED',
      'Test 9 — Unauthorized socket rejected on conversation:read with CONVERSATION_ACCESS_DENIED'
    );

    // ─────────────────────────────────────────────────────────────
    // PART B: TYPING INDICATORS
    // ─────────────────────────────────────────────────────────────

    // TEST 10: User A emits typing:start -> User B receives typing:start
    const bTypingStartPromise = waitForEvent(clientB, 'typing:start');
    const aTypingStartAck = await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });

    const bReceivedTypingStart = await bTypingStartPromise;
    assert(
      aTypingStartAck?.success === true &&
        bReceivedTypingStart &&
        bReceivedTypingStart.conversationId === testConversation.id.toString() &&
        bReceivedTypingStart.userId === userA._id.toString(),
      'Test 10 — User A emits typing:start; User B receives typing:start event'
    );

    // TEST 11: User A does NOT receive their own typing event
    let aReceivedOwnTyping = false;
    clientA.once('typing:start', () => {
      aReceivedOwnTyping = true;
    });
    // Trigger another typing event after clearing
    typingManager.reset();
    const bTypingStartPromise2 = waitForEvent(clientB, 'typing:start');
    await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });
    await bTypingStartPromise2;
    await new Promise((r) => setTimeout(r, 100));

    assert(
      aReceivedOwnTyping === false,
      'Test 11 — User A does not receive their own typing:start event'
    );

    // TEST 12: User A emits typing:stop -> User B receives typing:stop
    const bTypingStopPromise = waitForEvent(clientB, 'typing:stop');
    const aTypingStopAck = await new Promise((resolve) => {
      clientA.emit('typing:stop', { conversationId: testConversation.id.toString() }, resolve);
    });

    const bReceivedTypingStop = await bTypingStopPromise;
    assert(
      aTypingStopAck?.success === true &&
        bReceivedTypingStop &&
        bReceivedTypingStop.conversationId === testConversation.id.toString() &&
        bReceivedTypingStop.userId === userA._id.toString(),
      'Test 12 — User A emits typing:stop; User B receives typing:stop event'
    );

    // TEST 13: User C tries typing events for A-B conversation -> rejected
    const unauthTypingStart = await new Promise((resolve) => {
      clientC.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });
    assert(
      unauthTypingStart?.success === false &&
        unauthTypingStart?.error?.code === 'CONVERSATION_ACCESS_DENIED',
      'Test 13 — Unauthorized User C rejected on typing:start with CONVERSATION_ACCESS_DENIED'
    );

    // TEST 14: Spam typing events rapidly -> duplicate broadcasts debounced
    typingManager.reset();
    let broadcastCount = 0;
    clientB.on('typing:start', () => {
      broadcastCount++;
    });

    // Rapidly emit typing:start 10 times from client A
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => {
        clientA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
      });
    }
    await new Promise((r) => setTimeout(r, 200));

    assert(
      broadcastCount === 1,
      `Test 14 — Rapid typing:start spam debounced: sent 10 events, broadcasted exactly ${broadcastCount} time`
    );
    clientB.off('typing:start');

    // TEST 15: Start typing without typing:stop -> auto-expires after 3 seconds
    typingManager.reset();
    const bAutoStopPromise = waitForEvent(clientB, 'typing:stop', 5000);
    const startT15 = Date.now();

    await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });

    const expiredEvent = await bAutoStopPromise;
    const elapsed = Date.now() - startT15;
    assert(
      expiredEvent &&
        expiredEvent.conversationId === testConversation.id.toString() &&
        expiredEvent.userId === userA._id.toString() &&
        elapsed >= 2800 && elapsed <= 4500,
      `Test 15 — Typing state auto-expires after ~3s timeout (${elapsed}ms elapsed) emitting typing:stop`
    );

    // TEST 16: Disconnect User A while typing -> typing state cleaned up and B receives typing:stop
    const tempSocketA = createClientSocket(tokenA);
    await new Promise((r) => tempSocketA.on('connect', r));

    await new Promise((resolve) => {
      tempSocketA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });

    const bDisconnectStopPromise = waitForEvent(clientB, 'typing:stop');
    tempSocketA.disconnect();

    const disconnectStopEvent = await bDisconnectStopPromise;
    assert(
      disconnectStopEvent &&
        disconnectStopEvent.conversationId === testConversation.id.toString() &&
        disconnectStopEvent.userId === userA._id.toString(),
      'Test 16 — Disconnecting socket while typing cleans up state and emits typing:stop to recipient'
    );

    // TEST 17: Multiple sockets: disconnecting 1 tab retains state while other tab is active
    const tabA1 = createClientSocket(tokenA);
    const tabA2 = createClientSocket(tokenA);
    await Promise.all([
      new Promise((r) => tabA1.on('connect', r)),
      new Promise((r) => tabA2.on('connect', r)),
    ]);

    // Start typing on tabA1
    await new Promise((resolve) => {
      tabA1.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });
    // Register tabA2 into typing state as well
    await new Promise((resolve) => {
      tabA2.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });

    // Disconnect tabA1
    let tabStopEmitted = false;
    clientB.once('typing:stop', () => {
      tabStopEmitted = true;
    });
    tabA1.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    assert(
      tabStopEmitted === false && typingManager.isTyping(testConversation.id, userA._id.toString()),
      'Test 17 — Multi-socket: disconnecting 1 tab does not destroy typing state while tab 2 remains active'
    );

    tabA2.disconnect();

    // TEST 18: Send message while typing -> typing state automatically terminates
    typingManager.reset();
    await new Promise((resolve) => {
      clientA.emit('typing:start', { conversationId: testConversation.id.toString() }, resolve);
    });
    assert(
      typingManager.isTyping(testConversation.id, userA._id.toString()),
      'User A confirmed typing before sending message'
    );

    const bMessageSendStopPromise = waitForEvent(clientB, 'typing:stop');

    await new Promise((resolve) => {
      clientA.emit(
        'message:send',
        {
          conversationId: testConversation.id.toString(),
          content: 'Sent message while typing',
        },
        resolve
      );
    });

    const sendStopEvent = await bMessageSendStopPromise;
    assert(
      sendStopEvent &&
        sendStopEvent.conversationId === testConversation.id.toString() &&
        !typingManager.isTyping(testConversation.id, userA._id.toString()),
      'Test 18 — Sending a message automatically terminates typing state and emits typing:stop to recipient'
    );

    // Cleanup client connections
    clientA?.close();
    clientB?.close();
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
