import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import config from './config/config.js';
import logger from './utils/logger.js';
import { initSocket } from './socket/index.js';

/**
 * Server entry point with hardened lifecycle management and graceful shutdown.
 */
const startServer = async () => {
  // 1. Create shared HTTP server wrapping Express app
  const httpServer = http.createServer(app);

  // 2. Attach Socket.IO to HTTP server
  const io = initSocket(httpServer);

  // 3. Start HTTP server immediately
  const server = httpServer.listen(config.port, () => {
    logger.info(`✅ Social Connect API v${config.version} running on port ${config.port}`, {
      port: config.port,
      environment: config.nodeEnv,
      version: config.version,
      healthCheck: `http://localhost:${config.port}/api/health`,
      readinessCheck: `http://localhost:${config.port}/api/health/ready`,
    });
  });

  // 4. Attempt MongoDB connection
  try {
    await connectDB();
  } catch (err) {
    logger.error(`❌ MongoDB initial connection failed: ${err.message}`, { error: err.message });
  }

  // 5. Graceful shutdown handler
  let isShuttingDown = false;
  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    // Force close after 10s if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000);
    forceExitTimeout.unref();

    try {
      // Step A: Close Socket.IO connections
      if (io) {
        await new Promise((resolve) => {
          io.close(() => {
            logger.info('Socket.IO connections closed.');
            resolve();
          });
        });
      }

      // Step B: Stop accepting new HTTP requests
      if (server.listening) {
        await new Promise((resolve) => {
          server.close((err) => {
            if (err) logger.error(`Error closing HTTP server: ${err.message}`);
            else logger.info('HTTP server closed cleanly.');
            resolve();
          });
        });
      }

      // Step C: Close MongoDB connection
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close(false);
        logger.info('MongoDB connection closed.');
      }

      logger.info('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (shutdownErr) {
      logger.error(`Error during graceful shutdown: ${shutdownErr.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.stack : reason}`);
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.stack || err.message}`);
    gracefulShutdown('uncaughtException');
  });
};

startServer();
