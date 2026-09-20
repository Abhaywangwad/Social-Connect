import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import config from './config/config.js';
import requestIdMiddleware from './middleware/requestId.js';
import slowRequestLogger from './middleware/slowRequestLogger.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import healthRoutes from './routes/healthRoutes.js';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';
import postRoutes from './routes/postRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import feedRoutes from './routes/feedRoutes.js';
import saveRoutes from './routes/saveRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import metrics from './utils/metrics.js';
import { sanitizeUrl } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDocsPath = path.resolve(__dirname, '../../docs/openapi.yaml');
const localDocsPath = path.resolve(__dirname, '../docs/openapi.yaml');
const openApiPath = fs.existsSync(rootDocsPath) ? rootDocsPath : localDocsPath;

const app = express();

// ─── 1. Reverse Proxy Configuration ──────────────────────────────────────────
// Enables accurate client IP detection and req.secure behind load balancers/proxies
app.set('trust proxy', 1);

// ─── 2. HTTP Security Headers (Helmet) ─────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Tuned for API server consumption
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows cross-origin media fetching
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' }, // Prevents clickjacking
    hidePoweredBy: true, // Strips X-Powered-By: Express
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    noSniff: true, // X-Content-Type-Options: nosniff
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ─── 3. Request ID Correlation Middleware ────────────────────────────────────
app.use(requestIdMiddleware);
app.use(slowRequestLogger);

// ─── 4. CORS Allowlist Configuration ──────────────────────────────────────────
const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, curl, or server-to-server tests)
      if (!origin || allowedOrigins.includes(origin) || config.isDev || config.isTest) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS allowlist policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-refresh-token', 'X-Request-ID'],
  })
);

// ─── 5. Cookie Parser ────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── 6. Request Body Size Limits ──────────────────────────────────────────────
// Strict payload size limits to protect against memory exhaustion / DOS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── 7. In-Memory Performance Metrics & HTTP Request Logging ──────────────────
app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    metrics.recordHttpRequest({
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
    });
  });
  next();
});

morgan.token('req-id', (req) => req.id || '-');
morgan.token('sanitized-url', (req) => sanitizeUrl(req.originalUrl || req.url));

const morganFormat = (tokens, req, res) => {
  if (config.isProd) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'HTTP_REQUEST',
      requestId: tokens['req-id'](req, res),
      method: tokens.method(req, res),
      route: tokens['sanitized-url'](req, res),
      statusCode: parseInt(tokens.status(req, res), 10) || 0,
      durationMs: parseFloat(tokens['response-time'](req, res)) || 0,
    });
  }
  return `${tokens.method(req, res)} ${tokens['sanitized-url'](req, res)} ${tokens.status(req, res)} ${tokens['response-time'](req, res)} ms - [${tokens['req-id'](req, res)}]`;
};
app.use(morgan(morganFormat));

// ─── 8. Global Rate Limiter ───────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ─── 9. API Routes ────────────────────────────────────────────────────────────
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', saveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', commentRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

// ─── 10. Swagger UI Interactive API Documentation ─────────────────────────────
// Available in development/test, or explicitly enabled in production via ENABLE_API_DOCS=true
if (!config.isProd || process.env.ENABLE_API_DOCS === 'true') {
  if (fs.existsSync(openApiPath)) {
    try {
      const swaggerDocument = YAML.load(openApiPath);
      app.use(
        '/api/docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument, {
          customSiteTitle: 'Social Connect API Documentation',
        })
      );
      app.get('/docs', (_req, res) => res.redirect('/api/docs'));
    } catch (err) {
      console.error('[Swagger] Failed to load OpenAPI documentation:', err.message);
    }
  }
}

// ─── 11. Centralized Error Handling ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
