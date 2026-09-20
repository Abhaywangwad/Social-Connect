import { io } from 'socket.io-client';

/**
 * Creates and returns an authenticated Socket.IO client instance.
 *
 * @param {string} token JWT Access Token
 * @param {number} port HTTP server port
 * @returns {Promise<import('socket.io-client').Socket>}
 */
export const createSocketClient = (token, port) => {
  return new Promise((resolve, reject) => {
    const socket = io(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket connection timeout during handshake'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
};

/**
 * Creates an unauthenticated or invalid socket client without rejecting on error.
 *
 * @param {Object} authOptions
 * @param {number} port
 * @returns {import('socket.io-client').Socket}
 */
export const createRawSocketClient = (authOptions, port) => {
  return io(`http://localhost:${port}`, {
    auth: authOptions,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
};

/**
 * Waits for a specific Socket.IO event with a timeout.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {string} eventName
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<any>}
 */
export const waitForSocketEvent = (socket, eventName, timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event: "${eventName}"`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

export default {
  createSocketClient,
  createRawSocketClient,
  waitForSocketEvent,
};
