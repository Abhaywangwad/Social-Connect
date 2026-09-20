# Social Connect — Production Security Checklist
**Phase 33 | Last Verified:** September 2026

Use this checklist before every production deployment. Mark each item only after actual verification, not assumption.

---

## Authentication

- [x] Passwords hashed with bcrypt (12 rounds)
- [x] Plaintext passwords never stored
- [x] Plaintext passwords never returned in any API response
- [x] Plaintext passwords never written to logs or audit records
- [x] Password minimum length enforced (8 chars)
- [x] Password maximum length enforced (128 chars) — prevents bcrypt DoS
- [x] Login requires valid email + password
- [x] Generic error on invalid credentials (no account enumeration)
- [x] Forgot-password returns generic response regardless of email existence
- [x] Access tokens expire (15 minutes)
- [x] Refresh tokens have expiration (30 days)
- [x] Refresh tokens rotated on each use
- [x] Revoked sessions cannot refresh tokens
- [x] Password change invalidates all sessions
- [x] Password reset invalidates all sessions
- [x] Account suspension blocks login
- [x] Account suspension blocks token refresh

## Tokens and Sessions

- [x] JWT algorithm pinned to HS256
- [x] JWT secret externalized to environment variable
- [x] JWT access secret is separate from refresh secret
- [x] Token verification rejects wrong algorithm
- [x] Token verification rejects tampered payloads
- [x] Token verification rejects expired tokens
- [x] Admin role fetched from database per request (not from JWT)
- [x] Refresh token stored as SHA-256 hash (not plaintext)
- [x] Session documents track user agent, IP, creation time

## Cookies

- [x] Refresh token cookie is HttpOnly
- [x] Refresh token cookie is Secure in production
- [x] Refresh token cookie uses SameSite=strict
- [x] Refresh token cookie path restricted to /api/auth
- [x] Logout clears the refresh token cookie

## Authorization

- [x] Every protected route has `authenticate` middleware
- [x] Owner checks performed server-side (not client-claimed)
- [x] IDOR tested: users cannot modify/delete each other's posts
- [x] IDOR tested: users cannot access each other's conversations
- [x] IDOR tested: users cannot read each other's sessions
- [x] IDOR tested: users cannot read each other's notifications
- [x] Admin endpoints require DB role verification
- [x] Suspended users blocked from write operations
- [x] Blocked users cannot view each other's profiles or posts

## Input Validation

- [x] All request bodies validated with Zod (strict mode)
- [x] All route params validated with Zod
- [x] All query params validated with Zod
- [x] Schemas use `.strict()` to reject unknown fields
- [x] MongoDB ObjectId format validated before DB queries
- [x] Pagination limits capped (max 50)
- [x] Text field length limits enforced (bio 150, caption 2200, comment 1000, message 5000)
- [x] Search query minimum (2 chars) and maximum (50 chars) enforced

## Mass Assignment Protection

- [x] Profile update only allows: username, fullName, bio, profilePicture
- [x] Role cannot be set via API request
- [x] isVerified cannot be set via API request
- [x] accountStatus cannot be set via API request
- [x] moderationStatus cannot be set via API request
- [x] followersCount/followingCount not directly modifiable

## NoSQL Injection

- [x] Zod strict typing prevents MongoDB operator objects in login
- [x] Regex special characters escaped in search service
- [x] Dynamic regex inputs bounded by query length limits

## SSRF / URL Injection

- [x] profilePicture URL restricted to https:// scheme
- [x] javascript: scheme rejected
- [x] data: URI rejected
- [x] http: scheme rejected (must be https)
- [x] Backend does not fetch user-supplied URLs server-side

## File Uploads

- [x] File size limit enforced (10 MB per file)
- [x] File count limit enforced (10 per post)
- [x] Extension whitelist: .jpg, .jpeg, .png, .webp only
- [x] MIME type whitelist: image/jpeg, image/png, image/webp only
- [x] Magic byte validation performed on file buffer
- [x] Files stored in memory (no temp disk writes)
- [x] Uploaded to Cloudinary server-side (client never gets credentials)
- [x] Orphaned assets cleaned up on partial upload failure

## Rate Limiting

- [x] Login: 5 attempts per 15 minutes (per IP+email)
- [x] Registration: 10 per hour per IP
- [x] Forgot password: 5 per hour per IP
- [x] Password reset: 10 per hour per IP
- [x] Token refresh: 30 per 15 minutes per IP
- [x] Search: 30 per minute
- [x] Messages: 60 per minute
- [x] Uploads: 20 per minute
- [x] Admin: 100 per 15 minutes
- [x] Global: 120 per minute per IP
- [x] Rate limit bypass header restricted to test environment only (F-01 fix)

## API Security

- [x] Request body size limited to 100 KB
- [x] Helmet security headers applied
- [x] CORS restricted to allowlist in production
- [x] X-Powered-By header removed
- [x] HSTS enabled in production (via Helmet)
- [x] Clickjacking protection (X-Frame-Options: DENY)
- [x] MIME sniffing protection (X-Content-Type-Options: nosniff)
- [x] Referrer-Policy: strict-origin-when-cross-origin

## Socket.IO Security

- [x] All connections require valid JWT at handshake
- [x] Missing token rejected
- [x] Invalid token rejected
- [x] Expired token rejected
- [x] User identity derived from verified JWT (never from client payload)
- [x] conversation:join verifies DB participant membership
- [x] message:send verifies conversation membership
- [x] message:send checks account suspension
- [x] Block relationship checked before joining conversation
- [x] typing:start verifies participant membership
- [x] Socket-level rate limiting per socket ID

## Content Moderation

- [x] Hidden/removed posts not returned from public feed
- [x] Hidden/removed posts not returned by direct ID
- [x] Admin moderation actions audited

## Admin Security

- [x] Admin access requires authentication
- [x] Admin role checked against database (not JWT claims)
- [x] Suspended admins lose access immediately
- [x] All admin access denials audit-logged
- [x] Admin first-account created via protected script (not API)

## Logging and Audit

- [x] Passwords never logged
- [x] Authorization tokens redacted from logs
- [x] req.body masked before error tracker capture (F-04 fix)
- [x] Sensitive URL parameters redacted from access logs
- [x] Audit log entries created for sensitive actions
- [x] Audit logs are append-only from application code

## Infrastructure

- [x] Docker container runs as non-root user (node UID=1000)
- [x] Multi-stage Docker build (dependencies + runtime)
- [x] Production-only dependencies in runtime image
- [x] No secrets in Dockerfile
- [x] No secrets in docker-compose committed to Git
- [x] .env files in .gitignore
- [x] .env.example contains only placeholders

## CI/CD

- [x] CI uses read-only `contents: read` permissions
- [x] `npm audit --omit=dev --audit-level=high` runs in CI
- [x] JWT secrets in CI are test-only placeholders
- [x] Production secrets not available to CI builds

## Dependencies

- [x] `npm audit` — 0 vulnerabilities found (September 2026)

## Backup Security

- [x] Backup archives not committed to Git
- [x] Restore requires explicit confirmation flag
- [x] Checksum verification before restore
- [x] Backup script does not contain production credentials

---

## Items Requiring Manual Verification Before Each Production Release

- [ ] Confirm JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are rotated from development values
- [ ] Confirm MONGODB_URI points to production instance with auth enabled
- [ ] Confirm Cloudinary credentials are production keys
- [ ] Confirm NODE_ENV=production is set
- [ ] Confirm reverse proxy terminates TLS before reaching Express
- [ ] Confirm error tracking service is configured for production
- [ ] Confirm backup schedule is active for production database
