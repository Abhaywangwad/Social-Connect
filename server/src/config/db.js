import mongoose from 'mongoose';
import config from './config.js';
import logger from '../utils/logger.js';
import metrics from '../utils/metrics.js';

let isListenersAttached = false;

/**
 * Attaches operational lifecycle event listeners to the Mongoose connection.
 */
export const registerMongooseLifecycleListeners = () => {
  if (isListenersAttached) return;
  isListenersAttached = true;

  mongoose.connection.on('connected', () => {
    logger.info(`[MongoDB] Connected: ${mongoose.connection.host}`, {
      host: mongoose.connection.host,
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('[MongoDB] Connection lost / disconnected');
    metrics.recordDbDisconnect();
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('[MongoDB] Connection re-established (reconnected)');
    metrics.recordDbReconnect();
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`[MongoDB] Connection error: ${err.message}`, {
      error: err.message,
    });
    metrics.recordDbError();
  });
};

/**
 * Connects to MongoDB using Mongoose with bounded retries.
 * Handles transient container network delays during cold starts.
 *
 * @param {number} [maxRetries] Max connection attempts (default 5 for dev/prod, 1 for tests)
 * @param {number} [retryDelayMs] Delay between retries in milliseconds (default 2500ms)
 */
const connectDB = async (
  maxRetries = config.isTest ? 1 : 5,
  retryDelayMs = 2500
) => {
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  registerMongooseLifecycleListeners();

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt += 1;
    try {
      const conn = await mongoose.connect(config.mongoUri, {
        maxPoolSize: config.db.maxPoolSize,
        minPoolSize: config.db.minPoolSize,
        serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
        socketTimeoutMS: config.db.socketTimeoutMS,
      });

      logger.info(
        `[MongoDB] Initial connection established: ${conn.connection.host} (Pool: min=${config.db.minPoolSize}, max=${config.db.maxPoolSize})`,
        {
          host: conn.connection.host,
          poolMin: config.db.minPoolSize,
          poolMax: config.db.maxPoolSize,
        }
      );
      return conn;
    } catch (err) {
      if (attempt >= maxRetries) {
        logger.error(`[MongoDB] Failed to connect after ${maxRetries} attempts: ${err.message}`);
        throw new Error(
          `[MongoDB] Failed to connect after ${maxRetries} attempts: ${err.message}`
        );
      }
      logger.warn(
        `[MongoDB] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${retryDelayMs / 1000}s...`,
        { attempt, maxRetries, retryDelaySeconds: retryDelayMs / 1000 }
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

export default connectDB;
