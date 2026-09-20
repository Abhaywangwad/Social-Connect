import { Server } from 'socket.io';
import config from '../config/config.js';
import socketAuth from './socketAuth.js';
import registerSocketHandlers from './socketHandlers.js';

let ioInstance = null;

/**
 * Initializes Socket.IO on the shared HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Apply JWT authentication middleware during handshake
  io.use(socketAuth);

  // Register real-time event listeners on each authenticated connection
  io.on('connection', (socket) => {
    registerSocketHandlers(io, socket);
  });

  ioInstance = io;
  return io;
};

/**
 * Retrieves the active Socket.IO server instance.
 * @returns {import('socket.io').Server|null}
 */
export const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized. Call initSocket(httpServer) first.');
  }
  return ioInstance;
};

export default initSocket;
