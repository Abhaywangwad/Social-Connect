import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import Conversation from '../../src/models/Conversation.js';
import Message from '../../src/models/Message.js';
import { createTestUser, loginTestUser } from '../helpers/authHelper.js';
import { createTestConversation } from '../helpers/entityHelper.js';

describe('Integration: Conversations & Direct Messages', () => {
  it('creates or retrieves 1:1 conversation and sends a message', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const loginA = await loginTestUser(userA);

    // 1. Create conversation
    const convRes = await request(app)
      .post('/api/conversations')
      .set(loginA.authHeader)
      .send({ targetUserId: userB._id.toString() });

    expect([200, 201]).toContain(convRes.status);
    expect(convRes.body.success).toBe(true);
    const conv = convRes.body.data.conversation;
    const convId = conv.id || conv._id;

    // 2. Send message via REST
    const msgRes = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set(loginA.authHeader)
      .send({ content: 'Hello user B!' });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.success).toBe(true);
    expect(msgRes.body.data.message.content).toBe('Hello user B!');

    // 3. Message persisted in DB
    const dbMsg = await Message.findOne({ conversation: convId });
    expect(dbMsg).not.toBeNull();
    expect(dbMsg.content).toBe('Hello user B!');
    expect(dbMsg.sender.toString()).toBe(userA._id.toString());
  });

  it('forbids non-participants from viewing or sending messages to conversation (IDOR prevention)', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const intruder = await createTestUser();

    const intruderLogin = await loginTestUser(intruder);
    const conv = await createTestConversation(userA._id, userB._id);

    // Intruder trying to get conversation details -> 403
    const getRes = await request(app)
      .get(`/api/conversations/${conv._id}`)
      .set(intruderLogin.authHeader);
    expect(getRes.status).toBe(403);

    // Intruder trying to view message history -> 403
    const msgsRes = await request(app)
      .get(`/api/conversations/${conv._id}/messages`)
      .set(intruderLogin.authHeader);
    expect(msgsRes.status).toBe(403);

    // Intruder trying to send message -> 403
    const sendRes = await request(app)
      .post(`/api/conversations/${conv._id}/messages`)
      .set(intruderLogin.authHeader)
      .send({ content: 'Intruder message' });
    expect(sendRes.status).toBe(403);
  });

  it('marks conversation as read for authenticated participant', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const loginB = await loginTestUser(userB);

    const conv = await createTestConversation(userA._id, userB._id);

    const readRes = await request(app)
      .patch(`/api/conversations/${conv._id}/read`)
      .set(loginB.authHeader);

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);
  });
});
