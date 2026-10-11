import 'dotenv/config'; // loads variables from server/.env into process.env
import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';

import connectDB from './config/db.js';
import setupSocket from './socket/socket.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import messageRoutes from './routes/messageRoutes.js';

const app = express();

// Middleware: read JSON bodies and cookies on every request
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);

// Unknown API route
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler: any error thrown in a controller ends up here
// (Express 5 automatically catches errors from async functions).
app.use((err, req, res, next) => {
  console.error(err.message);

  let status = err.status || 500;
  if (err.name === 'CastError') status = 400; // invalid MongoDB id in the URL
  if (err.name === 'MulterError') status = 400; // e.g. image too large

  res.status(status).json({ message: status === 500 ? 'Something went wrong' : err.message });
});

// Socket.IO needs a plain Node HTTP server wrapped around the Express app
const server = http.createServer(app);
const io = setupSocket(server);
app.set('io', io); // so controllers can use req.app.get('io')

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
