import mongoose from 'mongoose';
import config from '../config/config.js';
import metrics from '../utils/metrics.js';

/**
 * GET /api/health
 * Lightweight liveness check confirming the Express process is running.
 */
export const healthCheck = (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    message: 'Social Connect API is running',
    version: config.version,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
};

/**
 * GET /api/health/ready
 * Readiness check confirming critical dependencies (MongoDB) are connected and accepting queries.
 */
export const readinessCheck = (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    return res.status(200).json({
      success: true,
      status: 'ready',
      database: 'connected',
      version: config.version,
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    });
  }

  return res.status(503).json({
    success: false,
    status: 'unready',
    database: 'disconnected',
    version: config.version,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
};

/**
 * GET /api/health/metrics
 * Operational metrics endpoint exposing in-memory performance and Socket.IO counters.
 * Protected by secret key (x-metrics-key) in production, or accessible locally.
 */
export const metricsCheck = (req, res) => {
  // In production, enforce secret token or local loopback access
  if (config.isProd) {
    const key = req.headers['x-metrics-key'];
    const isLoopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const isAuthorizedKey = config.metricsSecret && key === config.metricsSecret;

    if (!isAuthorizedKey && !isLoopback) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'METRICS_ACCESS_DENIED',
          message: 'Access to operational metrics is restricted to internal callers.',
        },
      });
    }
  }

  const snapshot = metrics.getSnapshot();
  return res.status(200).json({
    success: true,
    version: config.version,
    environment: config.nodeEnv,
    metrics: snapshot,
  });
};

export default {
  healthCheck,
  readinessCheck,
  metricsCheck,
};
