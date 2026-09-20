# Social Connect — Security Audit Report
**Phase 33 | Final Security Audit + Vulnerability Hardening**  
**Audit Date:** September 2026  
**Scope:** Full-stack (Backend API, Socket.IO, Auth, MongoDB, Docker, CI/CD)  
**Result:** 4 confirmed findings fixed. 3 informational items documented.

---

## Attack Surface Matrix

| Surface | Authentication Required | Auth Type | Rate Limited | Input Validated |
|---------|------------------------|-----------|--------------|-----------------|
| POST /api/auth/register | No | — | Yes (10/hr) | Yes (Zod) |
| POST /api/auth/login | No | — | Yes (5/15min) | Yes (Zod) |
| POST /api/auth/refresh | No | Cookie/Header | Yes (30/15min) | Partial |
| POST /api/auth/forgot-password | No | — | Yes (5/hr) | Yes (Zod) |
| POST /api/auth/reset-password | No | Token | Yes (10/hr) | Yes (Zod) |
| POST /api/auth/verify-email | No | Token | No | Yes (Zod) |
| GET /api/auth/me | Yes | JWT | Global | — |
| PATCH /api/auth/change-password | Yes | JWT | Global | Yes (Zod) |
| DELETE /api/auth/sessions/:id | Yes | JWT | Global | Yes (Zod) |
| GET /api/users/:username | Optional JWT | JWT | Global | Yes (Zod) |
| PATCH /api/users/me | Yes | JWT | Global | Yes (Zod) |
| GET /api/users/search | Yes | JWT | Yes (30/min) | Yes (Zod) |
| POST /api/posts | Yes | JWT | Global | Service layer |
| PATCH /api/posts/:id | Yes | JWT | Global | Service layer |
| DELETE /api/posts/:id | Yes | JWT | Global | Service layer |
| GET /api/posts/:id | Optional JWT | JWT | Global | — |
| GET /api/posts | No | — | Global | Service layer |
| POST /api/conversations | Yes | JWT | Global | Yes (Zod) |
| GET /api/conversations/:id | Yes | JWT | Global | Yes (Zod) |
| POST /api/reports | Yes | JWT | Yes (10/hr) | — |
| GET /api/admin/* | Yes | JWT + DB role | Yes (100/15min) | Per endpoint |
| Socket.IO connection | Yes | JWT handshake | In-memory | In handler |

---

## Findings

### F-01 — Rate Limit Bypass Header Not Restricted to Test Environment
**Severity:** High  
**Status:** ✅ Fixed

**Description:**  
`rateLimiter.js` accepted the `x-skip-rate-limit: true` header in ANY environment, not just `NODE_ENV=test`. This meant any external client could bypass ALL rate limiters (login, register, forgot-password, search, messages, uploads, global) simply by including this header.

**Attack scenario:**  
An attacker performing credential stuffing on `/api/auth/login` could set `x-skip-rate-limit: true` to bypass the 5-attempt/15-minute login limiter entirely.

**Fix:**  
Changed the condition to `process.env.NODE_ENV === 'test' && req.headers['x-skip-rate-limit'] === 'true'`.

**File:** `server/src/middleware/rateLimiter.js` line 27

---

### F-02 — profilePicture Field Accepts Non-HTTPS URLs
**Severity:** Medium  
**Status:** ✅ Fixed

**Description:**  
The `profilePicture` field in `updateProfileSchema` accepted any URL that passed `.url()` validation, including `javascript:`, `data:`, and `http://` schemes.

**Attack scenarios:**
- Stored XSS: If a client renders `<img src={user.profilePicture}>` without sanitization, a `javascript:alert(1)` value could trigger XSS in some browsers.
- Mixed-content: `http://` URLs on an HTTPS page cause browser mixed-content warnings.
- Protocol-relative SSRFs: In server-side rendering contexts, a `file://` URL could read local files.

**Fix:**  
Added `.refine((url) => url === '' || url.startsWith('https://'), ...)` to the Zod schema.

**File:** `server/src/validations/userValidation.js` line 24

---

### F-03 — Public Feed Exposes Moderated Posts
**Severity:** Medium  
**Status:** ✅ Fixed

**Description:**  
`getAllPosts()` called `Post.find()` with no filter, returning ALL posts regardless of `moderationStatus`. Posts marked `HIDDEN` or `REMOVED` by admins were visible in the public feed at `GET /api/posts`.

The individual `getPostById()` correctly checked moderation status; this was an inconsistency.

**Fix:**  
Added `{ moderationStatus: 'ACTIVE' }` filter to both the `find()` and `countDocuments()` calls in `getAllPosts()`.

**File:** `server/src/services/postService.js` lines 390-413

---

### F-04 — Raw Request Body Sent to Error Tracker
**Severity:** Medium  
**Status:** ✅ Fixed

**Description:**  
`errorHandler.js` passed `req.body` directly to `errorTracker.captureException()`. For a failed login request, `req.body` contains `{ email: "...", password: "plaintextpassword" }`. This plaintext password would be captured in the error tracking service (e.g., Sentry).

**Fix:**  
Applied `maskSecrets(req.body)` before passing to error tracker. The `maskSecrets` utility redacts fields with sensitive key names to `[REDACTED]`.  
Also removed the `headers` field entirely since it may contain `Authorization: Bearer ...` or raw cookie values.

**File:** `server/src/middleware/errorHandler.js` lines 128-136

---

### F-05 — x-refresh-token Header Fallback (Informational)
**Severity:** Low  
**Status:** Documented (accepted risk)

**Description:**  
`authController.refresh` accepts the refresh token via an `x-refresh-token` header as a fallback for non-browser clients. This means the refresh token travels in a header rather than a cookie, which can be logged by intermediate infrastructure.

**Accepted risk:**  
The header fallback is intentionally designed for mobile/CLI clients that cannot use cookies. The risk is documented. For production deployments, ensure reverse proxies strip or do not log this header.

---

### F-06 — CORS Allows All Origins in Development/Test (Informational)
**Severity:** Informational  
**Status:** Documented

**Description:**  
`app.js` CORS configuration allows any origin when `config.isDev || config.isTest`. This is intentional for developer workflows but should not be deployed to production without the allowlist being active.

**Production posture:**  
In production, `config.isProd` ensures only `config.clientUrl` and hardcoded origins are allowed.

---

### F-07 — Refresh Cookie SameSite='lax' Instead of 'strict'
**Severity:** Low  
**Status:** ✅ Fixed

**Description:**  
The refresh token cookie used `sameSite: 'lax'`, which allows the cookie to be sent on top-level cross-site navigations (e.g., `<a href>` clicks from an attacker-controlled page). This creates a small CSRF surface on the `/api/auth/refresh` endpoint.

**Fix:**  
Changed to `sameSite: 'strict'` in both `getRefreshCookieOptions()` and `clearRefreshTokenCookie()`.

**File:** `server/src/controllers/authController.js` lines 12-37

---

## Security Controls Verified as Working

The following controls were tested and confirmed to be correctly implemented:

| Control | Verified By |
|---------|-------------|
| JWT algorithm pinned to HS256 | SEC-07 |
| Admin role loaded from DB (not JWT) | SEC-08 — demoted admin cannot access admin routes |
| Suspended user write enforcement | SEC-09 |
| Block list enforced on profile/posts | SEC-10 |
| Password not returned in any response | SEC-13, SEC-19 |
| Email not returned in public profile | SEC-13 |
| Mass assignment (role, isVerified, accountStatus) blocked | SEC-04 |
| Post owner authorization for update/delete | SEC-02 |
| Conversation participant authorization | SEC-03 |
| Session revocation blocks refresh | SEC-18 |
| Expired tokens rejected | SEC-17 |
| Unknown routes return consistent 404 | SEC-16 |
| Request body size enforced (100KB) | SEC-15 |
| File upload extension + MIME validated | SEC-20 |
| File upload magic bytes validated | SEC-20 |
| NoSQL injection via login blocked by Zod strict typing | SEC-05 |
| Regex injection escaped in search | SEC-06 |
| bcrypt salt rounds = 12 | authService.js |
| Password reset tokens are hashed (SHA-256) | authService.js, cryptoUtils.js |
| Refresh tokens rotated on each use | sessionService.js |
| HttpOnly flag on refresh cookie | authController.js |

---

## Dependency Audit

```
npm audit (production dependencies only)
Result: found 0 vulnerabilities
```

---

## Recommendations for Future Hardening

1. **CAPTCHA on login/register** — Rate limiting protects against brute force but CAPTCHA adds a friction layer against automated tooling.
2. **Refresh token family tracking** — If a refresh token is reused (stolen token replayed), revoke the entire family.
3. **Content Security Policy** — Currently `contentSecurityPolicy: false` in Helmet. If a frontend is served from the same origin, enable CSP.
4. **IP allowlisting for admin endpoints** — For production deployments, consider restricting `/api/admin/*` to specific IP ranges.
5. **Account lockout policy** — After N failed login attempts, temporarily lock the account (currently only rate-limited per IP+email).
6. **Cloudinary unsigned upload restriction** — Ensure the Cloudinary API key used is upload-only with no deletion permissions from the frontend.
