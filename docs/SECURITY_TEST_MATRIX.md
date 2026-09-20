# Social Connect — Security Test Matrix
**Phase 33 | All tests executed September 2026**

All results are from actual test execution in `server/tests/security/security.test.js`.  
**Total: 57 tests, 57 PASS, 0 FAIL, 0 SKIP**

---

## Authentication Bypass (SEC-01)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 1 | Auth required on protected routes | No Authorization header | 401 | 401 | ✅ PASS |
| 2 | Bearer scheme enforced | `Authorization: Basic ...` | 401 | 401 | ✅ PASS |
| 3 | Token must be non-empty | `Authorization: Bearer ` (empty) | 401 | 401 | ✅ PASS |
| 4 | Token must be valid JWT | `Authorization: Bearer not.a.jwt` | 401 | 401 | ✅ PASS |
| 5 | JWT secret must match | Token signed with wrong secret | 401 | 401 | ✅ PASS |

## IDOR — Post Resources (SEC-02)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 6 | Owner can update own post | UserA updates own post | 200 | 200 | ✅ PASS |
| 7 | IDOR: Post update blocked | UserB updates UserA's post | 403 | 403 | ✅ PASS |
| 8 | IDOR: Post delete blocked | UserB deletes UserA's post | 403 | 403 | ✅ PASS |
| 9 | Auth required for delete | Unauthenticated delete attempt | 401 | 401 | ✅ PASS |

## IDOR — Conversations (SEC-03)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 10 | Conversation participant required | UserC reads UserA+UserB conversation | 403/404 | 403/404 | ✅ PASS |
| 11 | Auth required for conversations | Unauthenticated read attempt | 401 | 401 | ✅ PASS |
| 12 | Participants can access own conversation | UserA reads A+B conversation | 200 | 200 | ✅ PASS |

## Mass Assignment (SEC-04)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 13 | Role field rejected in profile update | `{ role: "ADMIN" }` in PATCH /api/users/me | 400 or role unchanged | 400 | ✅ PASS |
| 14 | accountStatus field rejected in profile update | `{ accountStatus: "ACTIVE" }` by suspended user | accountStatus unchanged | SUSPENDED in DB | ✅ PASS |
| 15 | isVerified field rejected in profile update | `{ isVerified: true }` by unverified user | isVerified unchanged | false in DB | ✅ PASS |
| 16 | moderationStatus field rejected in post update | `{ moderationStatus: "APPROVED" }` | moderationStatus unchanged | ACTIVE in DB | ✅ PASS |

## NoSQL Injection — Login (SEC-05)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 17 | Zod type coercion blocks objects in email | `{ email: { $gt: "" } }` | 400 | 400 | ✅ PASS |
| 18 | Zod type coercion blocks objects in password | `{ password: { $gt: "" } }` | 400 | 400 | ✅ PASS |
| 19 | $where operator rejected | `{ email: { $where: "..." } }` | 400 | 400 | ✅ PASS |

## NoSQL Injection — Search (SEC-06)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 20 | Regex operator in search query | `q={ $gt: "" }` | 200 with 0 results or 400 | 200/0 | ✅ PASS |
| 21 | Regex special chars escaped | `q=.*injected.*` | Safe response | 200 | ✅ PASS |

## JWT Algorithm Confusion (SEC-07)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 22 | Algorithm pinned to HS256 | Token signed with HS384 | 401 | 401 | ✅ PASS |
| 23 | Signature verified on payload | Modified payload, original signature | 401 | 401 | ✅ PASS |

## Admin Authorization (SEC-08)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 24 | Admin role required for admin routes | Normal user accesses /api/admin/users | 403 | 403 | ✅ PASS |
| 25 | Auth required for admin routes | Unauthenticated access to /api/admin/users | 401 | 401 | ✅ PASS |
| 26 | Admin access works for actual admins | Admin user accesses /api/admin/users | 200 | 200 | ✅ PASS |
| 27 | DB role checked per request | Admin token used after DB demotion | 403 | 403 | ✅ PASS |

## Suspended User Writes (SEC-09)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 28 | Suspended user blocked from posts | POST /api/posts by suspended user | 403 | 403 | ✅ PASS |
| 29 | Suspended user blocked from stories | POST /api/stories by suspended user | 403 | 403 | ✅ PASS |
| 30 | Suspended user blocked from conversations | POST /api/conversations by suspended user | 403 | 403 | ✅ PASS |

## Block List Enforcement (SEC-10)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 31 | Blocked user cannot view blocker profile | Blockee accesses blocker profile | 404 | 404 | ✅ PASS |
| 32 | Blocked user cannot view blocker posts | Blockee accesses blocker post list | 404 | 404 | ✅ PASS |

## Moderated Content (SEC-11 — F-03 regression)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 33 | HIDDEN post not in public feed | GET /api/posts returns HIDDEN post | Not in results | Not in results | ✅ PASS |
| 34 | REMOVED post not in public feed | GET /api/posts returns REMOVED post | Not in results | Not in results | ✅ PASS |
| 35 | ACTIVE posts still in feed | GET /api/posts returns ACTIVE post | In results | In results | ✅ PASS |
| 36 | HIDDEN post not accessible by direct ID | GET /api/posts/:id for HIDDEN post | 404 | 404 | ✅ PASS |

## Rate Limit Bypass (SEC-12 — F-01 regression)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 37 | Bypass header works in test env | x-skip-rate-limit in NODE_ENV=test | Not 429 | 401 | ✅ PASS |

## Sensitive Data Exposure (SEC-13)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 38 | Email not in public profile | GET /api/users/:username | No email field | Not present | ✅ PASS |
| 39 | Password not in auth/me | GET /api/auth/me | No password field | Not present | ✅ PASS |
| 40 | Password not in login response | POST /api/auth/login | No password field | Not present | ✅ PASS |
| 41 | Password not in register response | POST /api/auth/register | No password field | Not present | ✅ PASS |
| 42 | Author password/email not in post response | GET /api/posts/:id | No password/email | Not present | ✅ PASS |

## profilePicture URL Scheme (SEC-14 — F-02 regression)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 43 | javascript: scheme blocked | `profilePicture: "javascript:alert(1)"` | 400 | 400 | ✅ PASS |
| 44 | data: URI blocked | `profilePicture: "data:text/html,..."` | 400 | 400 | ✅ PASS |
| 45 | http: scheme blocked | `profilePicture: "http://..."` | 400 | 400 | ✅ PASS |
| 46 | https: scheme accepted | `profilePicture: "https://..."` | 200 | 200 | ✅ PASS |
| 47 | Empty string accepted | `profilePicture: ""` | 200 | 200 | ✅ PASS |

## Request Body Size (SEC-15)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 48 | Body size limit enforced | 120 KB JSON body | 413 | 413 | ✅ PASS |

## Unknown Routes (SEC-16)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 49 | Unknown routes return 404 | GET /api/nonexistent/route | 404 | 404 | ✅ PASS |
| 50 | No internal paths in error | GET /api/doesnotexist | No node_modules paths | Absent | ✅ PASS |
| 51 | Standard error envelope | GET /completely/missing | { success, error: { code } } | Correct | ✅ PASS |

## Expired Token (SEC-17)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 52 | Expired token rejected | Access token with -1s expiry | 401 | 401 | ✅ PASS |

## Session Revocation (SEC-18)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 53 | Revoked session token rejected | Refresh with revoked session | 401 | 401 | ✅ PASS |

## Password in Search (SEC-19)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 54 | Search results have no password/email | GET /api/users/search | No password, no email | Not present | ✅ PASS |

## File Upload (SEC-20)

| # | Security Control | Attack Scenario | Expected | Actual | Status |
|---|-----------------|-----------------|----------|--------|--------|
| 55 | HTML content rejected despite JPEG MIME label | HTML bytes as image/jpeg | 400/415/422 | 400 | ✅ PASS |
| 56 | .php extension rejected despite JPEG MIME | JPEG-like buffer as shell.php | 400/415/422 | 400 | ✅ PASS |
| 57 | Empty/null buffer rejected | Zero-byte buffer as image | 400/415/422 | 400 | ✅ PASS |

---

## Summary

| Category | Tests | Passed | Failed | Skipped |
|----------|-------|--------|--------|---------|
| Authentication bypass | 5 | 5 | 0 | 0 |
| IDOR (posts) | 4 | 4 | 0 | 0 |
| IDOR (conversations) | 3 | 3 | 0 | 0 |
| Mass assignment | 4 | 4 | 0 | 0 |
| NoSQL injection (login) | 3 | 3 | 0 | 0 |
| NoSQL injection (search) | 2 | 2 | 0 | 0 |
| JWT algorithm confusion | 2 | 2 | 0 | 0 |
| Admin authorization | 4 | 4 | 0 | 0 |
| Suspended user writes | 3 | 3 | 0 | 0 |
| Block list enforcement | 2 | 2 | 0 | 0 |
| Moderated content | 4 | 4 | 0 | 0 |
| Rate limit bypass | 1 | 1 | 0 | 0 |
| Sensitive data exposure | 5 | 5 | 0 | 0 |
| profilePicture URL scheme | 5 | 5 | 0 | 0 |
| Body size limit | 1 | 1 | 0 | 0 |
| Unknown routes | 3 | 3 | 0 | 0 |
| Expired token | 1 | 1 | 0 | 0 |
| Session revocation | 1 | 1 | 0 | 0 |
| Password in search | 1 | 1 | 0 | 0 |
| File upload | 3 | 3 | 0 | 0 |
| **TOTAL** | **57** | **57** | **0** | **0** |
