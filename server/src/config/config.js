import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env.test when running in test mode, otherwise server/.env if present
const testEnvPath = path.resolve(__dirname, '../../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../../.env');

if (process.env.NODE_ENV === 'test' && fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
} else if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath });
}
// In containerized or production deployments without a .env file,
// process.env values injected by Docker / orchestrator are used directly.

const nodeEnv = process.env.NODE_ENV || 'development';
const isDev = nodeEnv === 'development';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const packageJsonPath = path.resolve(__dirname, '../../package.json');
let appVersion = '1.0.0';
try {
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (pkg.version) appVersion = pkg.version;
  }
} catch (_e) {
  // Fallback default version
}

/**
 * Central configuration object built from environment variables.
 * All other modules should import config values from here — never
 * read process.env directly in business logic.
 */
const config = {
  version: appVersion,
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGODB_URI || (isTest ? 'mongodb://localhost:27017/social-connect-test' : 'mongodb://localhost:27017/social-connect'),
  nodeEnv,
  isDev,
  isProd,
  isTest,
  slowRequestThresholdMs: parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS, 10) || 500,
  errorTracking: {
    enabled: process.env.ERROR_TRACKING_ENABLED === 'true',
    dsn: process.env.ERROR_TRACKING_DSN || '',
  },
  metricsSecret: process.env.METRICS_SECRET || '',
  jwtSecret: process.env.JWT_SECRET || 'default_fallback_secret_change_in_production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'default_fallback_access_secret_change_in_production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'default_fallback_refresh_secret_change_in_production',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  passwordResetExpiresIn: parseInt(process.env.PASSWORD_RESET_EXPIRES_IN_MS, 10) || 15 * 60 * 1000,
  emailVerificationExpiresIn: parseInt(process.env.EMAIL_VERIFICATION_EXPIRES_IN_MS, 10) || 24 * 60 * 60 * 1000,
  email: {
    provider: process.env.EMAIL_PROVIDER || (isProd ? 'smtp' : 'mock'),
    from: process.env.EMAIL_FROM || 'no-reply@socialconnect.local',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  socketRateLimit: {
    maxMessages: parseInt(process.env.SOCKET_RATE_LIMIT_MAX, 10) || 20,
    windowMs: parseInt(process.env.SOCKET_RATE_LIMIT_WINDOW_MS, 10) || 10000,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'social-connect/posts',
  },
  db: {
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE, 10) || 20,
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE, 10) || 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
};

/**
 * Validates critical environment variables at startup.
 * Enforces fail-fast termination in production if required secrets are missing
 * or configured with insecure fallback defaults.
 */
export const validateEnv = () => {
  const missing = [];

  // In production, MONGODB_URI must be explicitly supplied
  if (config.isProd && !process.env.MONGODB_URI) {
    missing.push('MONGODB_URI');
  }

  if (config.isProd) {
    if (!process.env.JWT_ACCESS_SECRET && !process.env.JWT_SECRET) {
      missing.push('JWT_ACCESS_SECRET');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      missing.push('JWT_REFRESH_SECRET');
    }
    if (!process.env.CLIENT_URL) {
      missing.push('CLIENT_URL');
    }

    // Guard against insecure fallback secrets in production
    if (
      config.jwtAccessSecret.includes('default_fallback') ||
      config.jwtRefreshSecret.includes('default_fallback') ||
      config.jwtSecret.includes('default_fallback')
    ) {
      throw new Error(
        '[Security] FATAL: Production environment cannot use fallback JWT secrets! Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.'
      );
    }

    // Warn if Cloudinary credentials are not provided in production
    if (
      !config.cloudinary.cloudName ||
      !config.cloudinary.apiKey ||
      !config.cloudinary.apiSecret
    ) {
      console.warn(
        '[Config] ⚠️ Warning: Cloudinary media credentials are not fully set in production. Image uploads will be rejected until credentials are provided.'
      );
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[Config] FATAL: Missing required production environment variables: ${missing.join(', ')}`;
    if (config.isProd) {
      throw new Error(errorMsg);
    } else {
      console.warn(`[Config] ⚠️ Warning: ${errorMsg}`);
    }
  }
};

// Validate environment on import
validateEnv();

export default config;
