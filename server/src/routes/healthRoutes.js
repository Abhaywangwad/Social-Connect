import { Router } from 'express';
import { healthCheck, readinessCheck, metricsCheck } from '../controllers/healthController.js';

const router = Router();

// GET /api/health — Liveness probe
router.get('/health', healthCheck);

// GET /api/health/ready — Readiness probe
router.get('/health/ready', readinessCheck);

// GET /api/health/metrics — Protected operational performance & Socket.IO metrics
router.get('/health/metrics', metricsCheck);

export default router;
