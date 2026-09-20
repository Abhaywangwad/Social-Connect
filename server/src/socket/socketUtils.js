import config from '../config/config.js';

/**
 * Generates personal room name for a user.
 */
export const getUserRoom = (userId) => `user:${userId}`;

/**
 * Generates conversation room name.
 */
export const getConversationRoom = (conversationId) => `conversation:${conversationId}`;

/**
 * Standardized Socket Error response builder.
 */
export const formatSocketError = (code, message) => ({
  success: false,
  error: {
    code,
    message,
  },
});

/**
 * ─── In-Memory Presence Tracker ──────────────────────────────────────────────
 * Tracks online state per userId across multiple concurrent sockets (tabs/devices).
 *
 * NOTE: This in-memory implementation operates on a single server node.
 * In a multi-server cluster, a centralized store (such as Redis pub/sub) is required.
 */
const userSocketCounts = new Map();

export const presenceManager = {
  /**
   * Registers an active socket for a user.
   * @param {string} userId
   * @returns {{ isFirst: boolean, socketCount: number }}
   */
  addSocket(userId) {
    const id = userId.toString();
    const currentCount = userSocketCounts.get(id) || 0;
    const newCount = currentCount + 1;
    userSocketCounts.set(id, newCount);
    return {
      isFirst: currentCount === 0,
      socketCount: newCount,
    };
  },

  /**
   * Deregisters a socket for a user.
   * @param {string} userId
   * @returns {{ isLast: boolean, socketCount: number }}
   */
  removeSocket(userId) {
    const id = userId.toString();
    const currentCount = userSocketCounts.get(id) || 0;
    if (currentCount <= 1) {
      userSocketCounts.delete(id);
      return {
        isLast: true,
        socketCount: 0,
      };
    }
    const newCount = currentCount - 1;
    userSocketCounts.set(id, newCount);
    return {
      isLast: false,
      socketCount: newCount,
    };
  },

  /**
   * Returns true if the user has at least one active socket.
   */
  isUserOnline(userId) {
    return (userSocketCounts.get(userId.toString()) || 0) > 0;
  },

  /**
   * Returns total count of unique online users.
   */
  getOnlineUsersCount() {
    return userSocketCounts.size;
  },

  /**
   * Resets presence tracker (used for test teardown).
   */
  reset() {
    userSocketCounts.clear();
  },
};

/**
 * ─── Per-Socket Message Rate Limiter ──────────────────────────────────────────
 * Sliding window rate limiting on message:send events per socket connection.
 */
const socketMessageTimestamps = new Map();

export const rateLimiter = {
  /**
   * Checks if socket message attempt is within rate limit.
   * @param {string} socketId
   * @param {number} [maxMessages]
   * @param {number} [windowMs]
   * @returns {boolean} true if allowed, false if limit exceeded
   */
  checkLimit(
    socketId,
    maxMessages = config.socketRateLimit.maxMessages,
    windowMs = config.socketRateLimit.windowMs
  ) {
    const now = Date.now();
    const timestamps = socketMessageTimestamps.get(socketId) || [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxMessages) {
      socketMessageTimestamps.set(socketId, recent);
      return false;
    }

    recent.push(now);
    socketMessageTimestamps.set(socketId, recent);
    return true;
  },

  /**
   * Cleans up tracking data when socket disconnects.
   */
  cleanup(socketId) {
    socketMessageTimestamps.delete(socketId);
  },

  /**
   * Resets rate limiter (used for tests).
   */
  reset() {
    socketMessageTimestamps.clear();
  },
};

export default {
  getUserRoom,
  getConversationRoom,
  formatSocketError,
  presenceManager,
  rateLimiter,
};
