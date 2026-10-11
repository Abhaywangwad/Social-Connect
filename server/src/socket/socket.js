import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// Reads the "token" cookie from the raw Cookie header, e.g. "token=abc; other=xyz"
const getTokenFromCookie = (cookieHeader = '') => {
  const tokenCookie = cookieHeader.split('; ').find((c) => c.startsWith('token='));
  return tokenCookie ? tokenCookie.slice('token='.length) : null;
};

const setupSocket = (server) => {
  const io = new Server(server);

  // Only logged-in users can connect: check the same JWT cookie as the REST API
  io.use((socket, next) => {
    try {
      const token = getTokenFromCookie(socket.handshake.headers.cookie);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Not authenticated'));
    }
  });

  io.on('connection', (socket) => {
    // Each user joins a room named after their id.
    // To message someone we just do: io.to(theirId).emit(...)
    socket.join(socket.userId);
  });

  return io;
};

export default setupSocket;
