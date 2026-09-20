# Social Connect — Socket.IO Real-Time Messaging & Presence API

## 1. Overview & Architectural Role

Social Connect utilizes **Socket.IO** as a high-performance, real-time transport layer for instantaneous chat delivery, live read receipts, typing indicators, and online presence tracking.

### Core Architectural Principle
> **MongoDB is the single authoritative source of truth; Socket.IO is the ephemeral real-time distribution engine.**

Every direct message sent over WebSockets is validated, authorization-checked, and persisted into MongoDB via `messageService` before being broadcast to conversation participants. If a client is offline or temporarily disconnected, all state remains durable in MongoDB and is retrieved via REST upon reconnection.

---

## 2. Connection & Handshake Authentication

The Socket.IO server is mounted on the primary HTTP server and secured via handshake middleware ([`server/src/socket/socketAuth.js`](file:///c:/Users/Lenovo/Documents/Projects/Project/Social-Connect/server/src/socket/socketAuth.js)).

### Connection URL
```text
ws://localhost:5000 (or http://localhost:5000 with WebSocket upgrade)
```

### Handshake Credentials
Clients must supply a valid JWT Access Token via either:
1. **`auth` option in Socket.IO client**:
   ```javascript
   import { io } from 'socket.io-client';

   const socket = io('http://localhost:5000', {
     auth: {
       token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
     },
     withCredentials: true
   });
   ```
2. **`Authorization: Bearer <token>` Header**:
   ```javascript
   const socket = io('http://localhost:5000', {
     extraHeaders: {
       Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
     }
   });
   ```

### Handshake Rejection
If the token is missing, expired, or cryptographically invalid, the connection is rejected immediately:
```json
{
  "code": "AUTHENTICATION_FAILED",
  "message": "Authentication token required"
}
```

---

## 3. Rooms Architecture

Upon successful connection, the server manages two types of Socket.IO rooms:

| Room Pattern | Purpose | Lifetime |
|---|---|---|
| `user:<userId>` | Personal inbox room for targeted events (e.g. `conversation:updated`, `message:read`, `presence:online`) | Joined automatically upon connection, persists across all sockets for this user |
| `conversation:<conversationId>` | Active chat room for real-time `message:new` broadcasts | Joined dynamically via `conversation:join`, left via `conversation:leave` |

---

## 4. Client-to-Server Events (Emitted by Client)

All client-to-server operations support standard Socket.IO acknowledgment callbacks formatted as:
- Success: `callback({ success: true, ...data })`
- Error: `callback({ success: false, error: { code: string, message: string } })`

---

### `conversation:join`
Joins the real-time room for an active conversation.

#### Pre-conditions & Validation:
- Valid 24-character hexadecimal MongoDB `conversationId`.
- Current user must be one of the two participants in the conversation (`CONVERSATION_ACCESS_DENIED`).
- Neither user has blocked the other (`CONVERSATION_ACCESS_DENIED`).

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

#### Acknowledgment Callback:
```json
{
  "success": true,
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

---

### `conversation:leave`
Leaves the active conversation room.

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

#### Acknowledgment Callback:
```json
{
  "success": true,
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

---

### `message:send`
Sends a direct message to a conversation.

#### Enforcement & Execution Lifecycle:
1. **Rate Limiting**: Checked via sliding window (prevents rapid-fire socket flooding).
2. **Account Suspension**: Verified against live database state. If account status is `SUSPENDED`, socket is forcibly disconnected immediately.
3. **Validation**: `content` must be non-empty string, trimmed, max 5,000 characters.
4. **Persistence**: Saved to MongoDB `messages` collection and updates `Conversation.lastMessage` atomically.
5. **Acknowledgment**: Sent back to the sender with the saved `message` object.
6. **Room Broadcast**: Server broadcasts `message:new` to other participant(s) in `conversation:<id>`.
7. **Inbox Update**: Server emits `conversation:updated` to participants' personal `user:<id>` rooms.
8. **Typing Cleanup**: Automatically clears any active typing timer for the sender.

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1",
  "content": "Hey, let's catch up tomorrow!",
  "clientMessageId": "uuid-client-12345"
}
```

#### Acknowledgment Callback:
```json
{
  "success": true,
  "message": {
    "_id": "6aafa0cc49feee7e447560f9",
    "conversation": "6aafa0cc49feee7e447560d1",
    "sender": {
      "_id": "6aafa0c649feee7e44756037",
      "username": "alex_chen",
      "fullName": "Alex Chen",
      "avatar": "https://..."
    },
    "content": "Hey, let's catch up tomorrow!",
    "clientMessageId": "uuid-client-12345",
    "createdAt": "2026-09-20T12:00:00.000Z"
  }
}
```

---

### `conversation:read`
Marks all messages in the conversation as read by the current user.

#### Execution Lifecycle:
1. Updates `Conversation.lastReadAt` for the current user in MongoDB.
2. Invokes acknowledgment callback.
3. Emits `message:read` to the other participant's personal room (`user:<otherUserId>`).

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

#### Acknowledgment Callback:
```json
{
  "success": true,
  "conversationId": "6aafa0cc49feee7e447560d1",
  "readAt": "2026-09-20T12:00:05.000Z"
}
```

---

### `typing:start`
In-memory typing indicator.

#### Lifecycle & Rules:
- Ephemeral in-memory management with automatic 5-second expiration timeout.
- Only broadcasts when transitioning to typing state (prevents redundant spam).
- Rejects if recipient is blocked.

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

---

### `typing:stop`
Clears active in-memory typing indicator.

#### Payload:
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1"
}
```

---

## 5. Server-to-Client Events (Received by Client)

### `message:new`
Broadcast to the `conversation:<conversationId>` room when a new message is posted.
```json
{
  "_id": "6aafa0cc49feee7e447560f9",
  "conversation": "6aafa0cc49feee7e447560d1",
  "sender": {
    "_id": "6aafa0c649feee7e44756037",
    "username": "alex_chen",
    "fullName": "Alex Chen",
    "avatar": "https://..."
  },
  "content": "Hey, let's catch up tomorrow!",
  "clientMessageId": "uuid-client-12345",
  "createdAt": "2026-09-20T12:00:00.000Z"
}
```

### `conversation:updated`
Broadcast to participants' personal `user:<userId>` rooms to update conversation preview lists.
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1",
  "lastMessage": {
    "content": "Hey, let's catch up tomorrow!",
    "createdAt": "2026-09-20T12:00:00.000Z"
  },
  "lastMessageAt": "2026-09-20T12:00:00.000Z"
}
```

### `message:read`
Broadcast to the other participant when the current user views the conversation.
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1",
  "userId": "6aafa0c649feee7e44756037",
  "readAt": "2026-09-20T12:00:05.000Z"
}
```

### `typing:start`
Received by the other participant when user begins typing.
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1",
  "userId": "6aafa0c649feee7e44756037"
}
```

### `typing:stop`
Received when user stops typing or typing timeout expires.
```json
{
  "conversationId": "6aafa0cc49feee7e447560d1",
  "userId": "6aafa0c649feee7e44756037"
}
```

### `presence:online`
Global event broadcast when a user establishes their first active socket connection.
```json
{
  "userId": "6aafa0c649feee7e44756037"
}
```

### `presence:offline`
Global event broadcast when a user closes their last active socket connection.
```json
{
  "userId": "6aafa0c649feee7e44756037"
}
```

---

## 6. Socket Error Code Reference

When an operation fails, the acknowledgment callback or error listener receives a structured error object:
```json
{
  "success": false,
  "error": {
    "code": "CONVERSATION_ACCESS_DENIED",
    "message": "You are not a participant in this conversation"
  }
}
```

| Code | Trigger |
|---|---|
| `AUTHENTICATION_FAILED` | Token missing, invalid signature, or expired during handshake |
| `INVALID_CONVERSATION_ID` | Malformed ObjectId string |
| `CONVERSATION_NOT_FOUND` | Conversation does not exist in database |
| `CONVERSATION_ACCESS_DENIED` | Non-participant or blocked relationship |
| `ACCOUNT_SUSPENDED` | Sender account is suspended by an administrator |
| `INVALID_MESSAGE` | Message content is empty or exceeds 5,000 characters |
| `RATE_LIMIT_EXCEEDED` | Exceeded message submission rate limit on socket |
| `JOIN_FAILED` / `LEAVE_FAILED` | Internal socket room failure |
| `TYPING_ERROR` | Typing indicator processing error |
