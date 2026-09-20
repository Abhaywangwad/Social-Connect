# Production Security Verification Checklist

This document serves as the operational security checklist for deploying **Social Connect** into a production environment. Every item must be audited and verified prior to production traffic cutover.

---

## 1. Network & Transport Security

- [ ] **Enforce TLS 1.3 / HTTPS**:
  - The reverse proxy (Nginx, Caddy, or Cloudflare) terminates TLS with valid certificates (Let's Encrypt / DigiCert).
  - Cleartext HTTP on port 80 strictly issues a `301 Moved Permanently` redirect to HTTPS on port 443.
- [ ] **HTTP Strict Transport Security (HSTS)**:
  - Header `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` is emitted on all responses via Helmet.
- [ ] **Reverse Proxy IP Trust**:
  - Backend Express app sets `app.set('trust proxy', 1)` so `req.ip` correctly reflects client IP rather than proxy internal IP for rate limiting and audit logging.
- [ ] **WebSocket Transport Security**:
  - Socket.IO clients connect strictly via `wss://` (Secure WebSockets). Cleartext `ws://` connections are blocked at the proxy layer.

---

## 2. Secrets & Credential Management

- [ ] **Zero Hardcoded Secrets in Git**:
  - Repository history audited via `gitleaks` or `git-secrets`.
  - `.env` is listed in `.gitignore` and `.dockerignore`.
  - `.env.example` contains only non-sensitive placeholder templates.
- [ ] **Cryptographic Randomness & Entropy**:
  - `JWT_ACCESS_SECRET` is at least 256 bits (32+ bytes generated via `crypto.randomBytes(32).toString('hex')`).
  - `JWT_REFRESH_SECRET` is distinct from access secret and cryptographically strong.
- [ ] **Production Secret Storage**:
  - Secrets are injected at runtime via container orchestrator environment mechanisms (e.g. AWS Secrets Manager, Doppler, Vault, or encrypted platform env vars), never baked into Docker images.
- [ ] **Third-Party Service Credentials**:
  - Cloudinary API Secret and Mailgun/SMTP credentials are restricted to production-specific accounts with least privilege.

---

## 3. Database Security & Isolation

- [ ] **Private Subnet / Network Isolation**:
  - MongoDB is NOT bound to `0.0.0.0` or exposed to the public internet.
  - Database access is restricted to application VPC/subnet via security group rules or IP allowlists.
- [ ] **Database Authentication & RBAC**:
  - MongoDB administrative user is separated from application user.
  - The application user has only `readWrite` privileges restricted exclusively to the `social_connect` database.
- [ ] **Encrypted Connections**:
  - MongoDB connection string enforces TLS/SSL (`mongodb+srv://...` or `?tls=true&tlsCAFile=...`).
- [ ] **Index Safeguards**:
  - `autoIndex: false` configured for production Mongoose connections to eliminate lock contention during startup.

---

## 4. CORS & Cookie Policies

- [ ] **Strict CORS Origin Allowlist**:
  - `cors` middleware explicitly validates `origin` against trusted domains (e.g., `https://frontend.example.com`).
  - Wildcards (`*`) and `null` origins are strictly prohibited when `credentials: true`.
- [ ] **HttpOnly Refresh Cookies**:
  - Refresh tokens are stored in `HttpOnly` cookies, preventing client-side JavaScript access and mitigating XSS theft.
- [ ] **Secure & SameSite Flags**:
  - Cookie flags set to `secure: true` (transmitted only over HTTPS) and `sameSite: 'strict'` (or `'lax'`).
- [ ] **Path Scoping**:
  - Refresh token cookie is scoped specifically to `path: '/api/auth'` to ensure it is not unnecessarily sent on static or media requests.

---

## 5. Application Hardening & Defenses

- [ ] **Security Headers (Helmet)**:
  - Standard headers configured: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] **Tiered Rate Limiting**:
  - Global API limiter active (100 req/15 min).
  - Strict Auth limiter active for `/api/auth/login`, `/register`, `/forgot-password` (5-10 attempts/15 min).
  - Feed and search rate limiters active to mitigate scraping and DoS.
- [ ] **Payload Limits**:
  - Express body parser capped (`limit: '10mb'`) to prevent memory exhaustion attacks.
- [ ] **File Upload Validation**:
  - File extensions and magic numbers (MIME types) validated against allowlists (JPEG, PNG, WebP, MP4).
  - Executable formats (`.exe`, `.sh`, `.php`, `.svg` with scripts) strictly rejected.
  - File sizes capped before upload to Cloudinary.

---

## 6. Error Handling & Information Disclosure

- [ ] **Production Error Masking**:
  - Error middleware suppresses stack traces, internal database schema details, and file paths when `NODE_ENV === 'production'`.
  - Generic client responses returned (e.g. `Internal Server Error`, `status: 500`).
- [ ] **Correlation Tracking**:
  - Every error response includes `requestId` header/field matching application log entries for debugging without exposing internal details.
- [ ] **No Development Endpoints in Production**:
  - Test seed routes, mock endpoints, and debug tools are disabled or removed from production routers.

---

## 7. Audit Logging & Monitoring

- [ ] **Security Event Capture**:
  - Failed logins, password changes, email verification triggers, and role modifications are captured in `AuditLog`.
- [ ] **Admin Action Accountability**:
  - All moderation actions (user bans, post status changes, report resolution) track admin ID, target ID, action type, IP address, and timestamp.
- [ ] **Structured Log Outputs**:
  - Application logs emit structured JSON to stdout for ingestion by log shippers (Datadog, Grafana Loki, CloudWatch).

---

## 8. Backup & Disaster Recovery

- [ ] **Automated Snapshots**:
  - Daily automated snapshots configured on database cluster with a minimum 30-day retention window.
- [ ] **Point-In-Time Recovery (PITR)**:
  - MongoDB Oplog retention enabled for continuous point-in-time restores.
- [ ] **Restore Testing**:
  - Backup restoration procedure tested and verified quarterly on a staging environment.
