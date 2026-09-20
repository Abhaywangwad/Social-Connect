# Production Release Checklist — Social Connect

This release checklist details the mandatory operational and security gates required before promoting a Social Connect build to production.

---

## 1. Automated Verification Gates

- [x] **Client Build**: `cd client && npm run build` completes with 0 errors and optimal bundle size.
- [x] **Server Test Suite**: `cd server && npm test` passes 100% across all 27 test files (182 integration/unit tests).
- [x] **API Specification Integrity**: `cd server && npm run validate:docs` validates 73/73 REST operations and 187/187 OpenAPI `$ref` pointers.
- [x] **End-to-End Integration**: `node scripts/verify-e2e.js` executes all 37 critical path user journeys (Auth, Follows, Posts, Comments, Likes, Saves, Stories, Notifications, Real-Time Socket.IO, Abuse Reporting, Content Moderation, Blocking Boundaries, Token Rotation, Logout) with 0 failures.

---

## 2. Environment & Secrets Management

- [ ] **No Secret Leaks**: Verify `.env`, `.env.test`, and `.env.development` are excluded by `.gitignore` and not tracked in git history.
- [ ] **Production Environment Variables Configured**:
  - `NODE_ENV=production`
  - `PORT=5000` (or container port)
  - `MONGODB_URI` (authenticated MongoDB Atlas replica set with TLS/SSL)
  - `JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (256-bit cryptographically secure random keys)
  - `CLIENT_URL` (Exact production frontend domain)
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `METRICS_SECRET` (for `/api/health/metrics` protected scraping)
  - `ADMIN_PROMOTE_SECRET` (for server-side admin provisioning script)

---

## 3. Database & Migration Readiness

- [ ] MongoDB replica set initialized with `readPreference=primaryPreferred` and `retryWrites=true`.
- [ ] Unique and compound indexes verified on all collections (`users`, `posts`, `comments`, `likes`, `follows`, `blocks`, `stories`, `conversations`, `messages`, `notifications`, `reports`, `audit_logs`).
- [ ] Run counter reconciliation script if restoring or seeding data: `npm run reconcile:counters`.
- [ ] Automated backup schedule active (`scripts/backup-mongodb.sh` or Atlas automated snapshots).

---

## 4. Frontend Deployment & Assets

- [ ] Production build generated via `npm run build` in `client/`.
- [ ] Static assets served via CDN / reverse proxy (Nginx / Cloudflare) with gzip / Brotli compression.
- [ ] Browser caching headers: 1 year cache for hashed static assets (`dist/assets/*`), `no-cache` for `index.html`.
- [ ] Verify CORS headers match the production frontend origin (`Access-Control-Allow-Origin: https://yourdomain.com`).

---

## 5. Security & Network Hardening

- [ ] Reverse proxy (Nginx, Caddy, Cloudflare) enforces HTTPS/TLS 1.3 only.
- [ ] `trust proxy` enabled in Express (`app.set('trust proxy', 1)`).
- [ ] Helmet security headers active: Strict-Transport-Security, X-Content-Type-Options: nosniff, Frameguard deny.
- [ ] Cookie attributes verified: `HttpOnly=true`, `Secure=true`, `SameSite=Strict`, `Path=/api/auth`.
- [ ] Rate limiters active on all authentication and write endpoints.

---

## 6. Observability & Monitoring

- [ ] `/api/health` and `/api/health/ready` hooked into orchestrator liveness and readiness probes.
- [ ] `/api/health/metrics` integrated with Prometheus / Grafana.
- [ ] Structured JSON logging active (`LOG_FORMAT=json` in production).
- [ ] Slow query and slow request alerts configured (>500ms threshold).
- [ ] On-call rotation and incident escalation runbooks documented (`docs/SECURITY_INCIDENT_RESPONSE.md`).
