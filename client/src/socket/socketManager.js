import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/api.js';

class SocketManager {
  constructor() {
    this.socket = null;
    this.token = null;
    this.activeConversationId = null;
    this.listeners = new Map();
  }

  /**
   * Initializes and connects the singleton Socket.IO connection.
   */
  connect(token) {
    if (!token) return null;

    // If already connected with the same token, return existing socket
    if (this.socket?.connected && this.token === token) {
      return this.socket;
    }

    // Clean up any stale or previous socket instance
    if (this.socket) {
      this.disconnect();
    }

    this.token = token;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      // If we were inside an active conversation, re-join it upon reconnect
      if (this.activeConversationId) {
        this.joinConversation(this.activeConversationId);
      }
      this._emitLocal('connection:change', { connected: true, socketId: this.socket.id });
    });

    this.socket.on('disconnect', (reason) => {
      this._emitLocal('connection:change', { connected: false, reason });
    });

    this.socket.on('connect_error', (error) => {
      this._emitLocal('connection:error', error);
    });

    // Wire forwarding of core real-time events to local event bus
    const eventsToForward = [
      'message:new',
      'conversation:updated',
      'message:read',
      'typing:start',
      'typing:stop',
      'presence:online',
      'presence:offline',
    ];

    eventsToForward.forEach((event) => {
      this.socket.on(event, (payload) => {
        this._emitLocal(event, payload);
      });
    });

    return this.socket;
  }

  /**
   * Disconnects the socket upon logout or session termination.
   */
  disconnect() {
    if (this.socket) {
      if (this.activeConversationId) {
        this.leaveConversation(this.activeConversationId);
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.token = null;
    this.activeConversationId = null;
    this._emitLocal('connection:change', { connected: false });
  }

  /**
   * Checks if socket is currently connected.
   */
  isConnected() {
    return Boolean(this.socket?.connected);
  }

  /**
   * Joins an authorized conversation room.
   */
  joinConversation(conversationId, callback = () => {}) {
    this.activeConversationId = conversationId;
    if (!this.socket?.connected) return;
    this.socket.emit('conversation:join', { conversationId }, callback);
  }

  /**
   * Leaves a conversation room.
   */
  leaveConversation(conversationId, callback = () => {}) {
    if (this.activeConversationId === conversationId) {
      this.activeConversationId = null;
    }
    if (!this.socket?.connected) return;
    this.socket.emit('conversation:leave', { conversationId }, callback);
  }

  /**
   * Emits message:send with authoritative acknowledgement callback.
   */
  sendMessage(conversationId, content, clientMessageId, callback = () => {}) {
    if (!this.socket?.connected) {
      return callback({
        success: false,
        error: { code: 'SOCKET_DISCONNECTED', message: 'Socket is not connected' },
      });
    }

    this.socket.emit(
      'message:send',
      {
        conversationId,
        content,
        clientMessageId,
      },
      callback
    );
  }

  /**
   * Emits conversation:read event to record read receipt in MongoDB.
   */
  markConversationRead(conversationId, callback = () => {}) {
    if (!this.socket?.connected) return;
    this.socket.emit('conversation:read', { conversationId }, callback);
  }

  /**
   * Emits ephemeral typing:start.
   */
  startTyping(conversationId) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing:start', { conversationId });
  }

  /**
   * Emits ephemeral typing:stop.
   */
  stopTyping(conversationId) {
    if (!this.socket?.connected) return;
    this.socket.emit('typing:stop', { conversationId });
  }

  /**
   * Event subscription system for components.
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);

    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  _emitLocal(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in local socket event handler [${event}]:`, err);
        }
      });
    }
  }
}

export const socketManager = new SocketManager();
export default socketManager;
