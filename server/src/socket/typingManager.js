/**
 * ─── Ephemeral In-Memory Typing State Manager ────────────────────────────────
 *
 * Tracks temporary typing state per conversation without writing to MongoDB.
 *
 * Architecture:
 * - Managed completely in-memory via nested Maps:
 *   activeTyping: Map<conversationId, Map<userId, { socketIds: Set<string>, timer: Timeout }>>
 * - Automatic 3-second timeout ensures stale typing indicators cleanly disappear
 *   even if clients fail to emit typing:stop.
 * - Anti-spam: Consecutive typing:start events from an already-typing user refresh
 *   the timeout without broadcasting redundant events to the network.
 * - Multi-socket safe: Tracks multiple tabs per user.
 */

const DEFAULT_TYPING_TIMEOUT_MS = 3000;

// Map<conversationId, Map<userId, { socketIds: Set<string>, timer: NodeJS.Timeout }>>
const activeTyping = new Map();

export const typingManager = {
  /**
   * Registers typing activity for a user in a conversation.
   *
   * @param {string} conversationId
   * @param {string} userId
   * @param {string} socketId
   * @param {(data: { conversationId: string, userId: string }) => void} onTimeout
   * @param {number} [timeoutMs=3000]
   * @returns {{ shouldBroadcast: boolean }} true if this is a newly transitioned typing state
   */
  startTyping(
    conversationId,
    userId,
    socketId,
    onTimeout = () => {},
    timeoutMs = DEFAULT_TYPING_TIMEOUT_MS
  ) {
    const convId = conversationId.toString();
    const uId = userId.toString();

    if (!activeTyping.has(convId)) {
      activeTyping.set(convId, new Map());
    }

    const userMap = activeTyping.get(convId);

    if (userMap.has(uId)) {
      const entry = userMap.get(uId);
      if (socketId) {
        entry.socketIds.add(socketId);
      }
      // Refresh expiration timer without broadcasting duplicate event
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        this.stopTyping(convId, uId);
        onTimeout({ conversationId: convId, userId: uId });
      }, timeoutMs);

      return { shouldBroadcast: false };
    }

    // New typing state started
    const timer = setTimeout(() => {
      this.stopTyping(convId, uId);
      onTimeout({ conversationId: convId, userId: uId });
    }, timeoutMs);

    userMap.set(uId, {
      socketIds: new Set(socketId ? [socketId] : []),
      timer,
    });

    return { shouldBroadcast: true };
  },

  /**
   * Explicitly stops typing for a user in a conversation.
   *
   * @param {string} conversationId
   * @param {string} userId
   * @returns {{ shouldBroadcast: boolean }}
   */
  stopTyping(conversationId, userId) {
    const convId = conversationId.toString();
    const uId = userId.toString();

    const userMap = activeTyping.get(convId);
    if (!userMap || !userMap.has(uId)) {
      return { shouldBroadcast: false };
    }

    const entry = userMap.get(uId);
    clearTimeout(entry.timer);
    userMap.delete(uId);

    if (userMap.size === 0) {
      activeTyping.delete(convId);
    }

    return { shouldBroadcast: true };
  },

  /**
   * Returns true if user is currently typing in conversation.
   */
  isTyping(conversationId, userId) {
    const convId = conversationId.toString();
    const uId = userId.toString();
    const userMap = activeTyping.get(convId);
    return Boolean(userMap && userMap.has(uId));
  },

  /**
   * Cleans up typing state associated with a disconnecting socket.
   *
   * @param {string} socketId
   * @param {(data: { conversationId: string, userId: string }) => void} onStop
   */
  handleDisconnect(socketId, onStop = () => {}) {
    for (const [convId, userMap] of activeTyping.entries()) {
      for (const [uId, entry] of userMap.entries()) {
        if (entry.socketIds.has(socketId)) {
          entry.socketIds.delete(socketId);
          // If no remaining active sockets for this user are typing, stop typing
          if (entry.socketIds.size === 0) {
            clearTimeout(entry.timer);
            userMap.delete(uId);
            if (userMap.size === 0) {
              activeTyping.delete(convId);
            }
            onStop({ conversationId: convId, userId: uId });
          }
        }
      }
    }
  },

  /**
   * Resets all in-memory typing state (used for testing).
   */
  reset() {
    for (const userMap of activeTyping.values()) {
      for (const entry of userMap.values()) {
        clearTimeout(entry.timer);
      }
    }
    activeTyping.clear();
  },
};

export default typingManager;
