# Social Connect — REST API Reference Guide

## 1. Overview & Base URL

Social Connect provides a production-grade, secure REST API for social media applications.

### Base URL
- **Local Development**: `http://localhost:5000/api`
- **Interactive Documentation (Swagger UI)**: `http://localhost:5000/api/docs`

---

## 2. Authentication & Session Architecture

Social Connect uses a hardened **Dual-Token Authentication System** that separates authentication claims from persistence:

1. **Access Token (JWT)**:
   - Lifespan: Short-lived (~15 minutes).
   - Expected header: `Authorization: Bearer <access_token>`
   - Contains claims: `userId` (Subject `sub`), `sessionId` (`sid`).
   - Verified statelessly on protected endpoints.
2. **Refresh Token (Opaque Hash)**:
   - Lifespan: Long-lived (~30 days).
   - Stored in a secure `HttpOnly`, `SameSite=Lax` cookie (`refreshToken`), or transmitted via `x-refresh-token` header.
   - The raw token is **never stored in MongoDB**; only its SHA-256 hash is persisted.
   - **Token Rotation**: Every call to `POST /api/auth/refresh` rotates the token and invalidates the previous hash.
   - **Replay Attack Detection**: If an old, already-rotated refresh token is presented, the system immediately revokes the entire `tokenFamily` and emits a high-severity `REFRESH_TOKEN_REUSED` audit log.

---

## 3. Standard Envelope & Error Format

All API responses strictly conform to standard JSON envelopes.

### Success Envelope
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### Error Envelope
```json
{
  "success": false,
  "message": "Human-readable explanation of error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable explanation of error"
  }
}
```

### Common HTTP Status Codes
| Status | Code | Meaning |
|---|---|---|
| `200` | `OK` | Request succeeded |
| `201` | `CREATED` | Resource successfully created |
| `400` | `BAD_REQUEST` | Validation failed or malformed request |
| `401` | `UNAUTHORIZED` | Token missing, invalid, or expired |
| `403` | `FORBIDDEN` | Access denied (insufficient role, blocked, or suspended) |
| `404` | `NOT_FOUND` | Resource does not exist |
| `409` | `CONFLICT` | Unique constraint conflict (duplicate email, duplicate follow) |
| `429` | `RATE_LIMIT_EXCEEDED`| Rate limit exceeded |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server error (sanitized in production) |

---

## 4. Pagination Strategies

### A. Offset/Page Pagination (Standard Collections)
Used for users, notifications, saved posts, and comments:
- Query parameters: `page` (integer, default 1), `limit` (integer, default 20, max 50).
- Response metadata:
  ```json
  "pagination": {
    "total": 85,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
  ```

### B. Compound Cursor Pagination (High-Frequency Streams)
Used for Home Feed (`/api/feed`) and Direct Messages (`/api/conversations/:id/messages`):
- Query parameters: `limit` (default 20, max 50), `cursor` (base64url string encoding `createdAt` + `_id`).
- Response metadata:
  ```json
  "pagination": {
    "limit": 20,
    "nextCursor": "eyJjIjoiMjAyNi0wOS0yMFQwOToxMzo1Ny4xMzFaIiwiaSI6IjZhYWZhM2Q5NzlmMzAzMWEzNjI5ZjJhYSJ9"
  }
  ```
- Guaranteed zero duplicate entries and zero skipped records even during concurrent writes.

---

## 5. Authentication & Account APIs

### 5.1 Register Account
`POST /api/auth/register` (Public, Rate Limited)
- **Request Body**:
  ```json
  {
    "username": "alex_chen",
    "email": "alex@example.com",
    "password": "SecretPassword123!",
    "fullName": "Alex Chen",
    "bio": "Software engineer"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully. Please verify your email.",
    "data": {
      "user": {
        "_id": "6aafa0c649feee7e44756037",
        "username": "alex_chen",
        "email": "alex@example.com",
        "fullName": "Alex Chen",
        "emailVerified": false
      }
    }
  }
  ```

### 5.2 Login
`POST /api/auth/login` (Public, Rate Limited)
- **Request Body**:
  ```json
  {
    "email": "alex@example.com",
    "password": "SecretPassword123!"
  }
  ```
- **Response (200 OK)**:
  Sets `refreshToken` cookie.
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "user": {
        "_id": "6aafa0c649feee7e44756037",
        "username": "alex_chen",
        "email": "alex@example.com",
        "fullName": "Alex Chen"
      }
    }
  }
  ```

### 5.3 Refresh Access Token
`POST /api/auth/refresh` (Public / Cookie)
- Consumes `refreshToken` cookie (or `x-refresh-token` header).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Access token refreshed successfully",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1Ni..."
    }
  }
  ```

### 5.4 Logout
`POST /api/auth/logout` (Authenticated)
- Revokes active session and clears cookie.

### 5.5 Logout All Devices
`POST /api/auth/logout-all` (Authenticated)
- Revokes all sessions belonging to the user.

### 5.6 List Active Sessions
`GET /api/auth/sessions` (Authenticated)
- Lists devices and IP addresses with active sessions.

### 5.7 Revoke Specific Session
`DELETE /api/auth/sessions/:sessionId` (Authenticated)

### 5.8 Change Password
`PATCH /api/auth/change-password` (Authenticated)
- **Request Body**:
  ```json
  {
    "currentPassword": "SecretPassword123!",
    "newPassword": "NewSecretPassword456!"
  }
  ```

### 5.9 Forgot Password
`POST /api/auth/forgot-password` (Public, Rate Limited)
- Sends password reset email.

### 5.10 Reset Password
`POST /api/auth/reset-password` (Public, Rate Limited)
- **Request Body**:
  ```json
  {
    "token": "raw-hex-token-from-email",
    "newPassword": "NewSecretPassword456!"
  }
  ```

### 5.11 Verify Email
`POST /api/auth/verify-email` (Public)
- **Request Body**:
  ```json
  {
    "token": "raw-verification-token"
  }
  ```

### 5.12 Current Identity
`GET /api/auth/me` (Authenticated)

---

## 6. User Profile & Social Graph APIs

### 6.1 Search Users
`GET /api/users/search?q=alex&page=1&limit=20` (Authenticated, Rate Limited)
- Searches by `username` and `fullName`. Excludes suspended accounts.

### 6.2 Get Own Profile
`GET /api/users/me` (Authenticated)

### 6.3 Update Own Profile
`PATCH /api/users/me` (Authenticated)
- **Request Body**:
  ```json
  {
    "fullName": "Alexander Chen",
    "bio": "Updated bio text",
    "avatar": "https://res.cloudinary.com/..."
  }
  ```

### 6.4 Get User Profile by Username
`GET /api/users/:username` (Public / Optional Auth)
- Returns public user profile including followers and following counts.
- Respects blocks (returns 403 if blocked).

### 6.5 User Profile Posts Grid
`GET /api/users/:username/posts?page=1&limit=20` (Public / Optional Auth)

### 6.6 Block / Unblock User
- `POST /api/users/:username/block` (Authenticated) — Blocks user; severs follow ties in both directions.
- `DELETE /api/users/:username/block` (Authenticated) — Unblocks user.
- `GET /api/users/:username/block-status` (Authenticated) — Checks block relationship.
- `GET /api/users/me/blocked` (Authenticated) — Lists all blocked users.

### 6.7 Follow / Unfollow User
- `POST /api/users/:username/follow` (Authenticated) — Follow user.
- `DELETE /api/users/:username/follow` (Authenticated) — Unfollow user.
- `GET /api/users/:username/follow-status` (Authenticated) — Relationship status.
- `GET /api/users/:username/followers?page=1&limit=20` (Public) — Followers list.
- `GET /api/users/:username/following?page=1&limit=20` (Public) — Following list.

---

## 7. Posts, Likes & Bookmarks APIs

### 7.1 Create Post
`POST /api/posts` (Authenticated, Active Account Only, Rate Limited)
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `caption`: string (max 2200 chars)
  - `location`: string (max 100 chars)
  - `media`: 1 to 10 image files (JPEG, PNG, WebP). Validated via in-memory magic bytes inspection.

### 7.2 Public Posts Listing
`GET /api/posts?page=1&limit=20` (Public)

### 7.3 Get Post by ID
`GET /api/posts/:id` (Public / Optional Auth)
- Populates author. Filters out moderated (`HIDDEN` or `REMOVED`) posts.

### 7.4 Update Own Post
`PATCH /api/posts/:id` (Authenticated, Owner Only)
- **Request Body**:
  ```json
  {
    "caption": "Updated caption",
    "location": "San Francisco, CA"
  }
  ```

### 7.5 Delete Own Post
`DELETE /api/posts/:id` (Authenticated, Owner Only)

### 7.6 Like / Unlike Post
`POST /api/posts/:id/like` (Authenticated)
- Atomically toggles like state and increments/decrements `likesCount` with guarded non-negative bounds.

### 7.7 Save / Unsave Post
- `POST /api/posts/:postId/save` (Authenticated) — Saves post to bookmarks.
- `DELETE /api/posts/:postId/save` (Authenticated) — Removes from bookmarks.
- `GET /api/posts/:postId/save-status` (Authenticated) — Returns `{ isSaved: boolean }`.
- `GET /api/users/me/saved-posts?page=1&limit=20` (Authenticated) — Lists user's saved posts.

---

## 8. Comments & Replies APIs

### 8.1 Create Comment
`POST /api/posts/:postId/comments` (Authenticated, Active Account Only)
- **Request Body**:
  ```json
  {
    "content": "Awesome shot!"
  }
  ```

### 8.2 List Comments
`GET /api/posts/:postId/comments?page=1&limit=20` (Public)

### 8.3 Reply to Comment
`POST /api/comments/:commentId/replies` (Authenticated, Active Account Only)
- Single-tier threading (`parentComment` reference).

### 8.4 List Replies
`GET /api/comments/:commentId/replies?page=1&limit=20` (Public)

### 8.5 Edit Comment
`PATCH /api/comments/:commentId` (Authenticated, Author Only)

### 8.6 Delete Comment
`DELETE /api/comments/:commentId` (Authenticated, Author OR Post Owner)

---

## 9. Home Feed API

### 9.1 Chronological Home Feed
`GET /api/feed?limit=20&cursor=...` (Authenticated)
- Retrieves posts by followed users and self.
- Early filters out blocked authors and non-`ACTIVE` moderation states.
- Bulk decorates `isLiked` and `isSaved` without N+1 query overhead.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "posts": [
        {
          "_id": "6aafa0cc49feee7e447560d1",
          "caption": "Golden hour in Tokyo",
          "media": [{ "url": "https://...", "format": "jpg", "width": 1080, "height": 1080 }],
          "location": "Tokyo, Japan",
          "likesCount": 142,
          "commentsCount": 12,
          "isLiked": true,
          "isSaved": false,
          "author": {
            "_id": "6aafa0c649feee7e44756037",
            "username": "alex_chen",
            "fullName": "Alex Chen",
            "profilePicture": "https://...",
            "isVerified": true
          },
          "createdAt": "2026-09-20T12:00:00.000Z"
        }
      ],
      "pagination": {
        "limit": 20,
        "nextCursor": "eyJjIjoiMjAyNi0wOS0yMFQwOToxMzo1Ny4xMzFaIiwiaSI6IjZhYWZhM2Q5NzlmMzAzMWEzNjI5ZjJhYSJ9"
      }
    }
  }
  ```

---

## 10. Notifications APIs

- `GET /api/notifications?page=1&limit=20` (Authenticated) — List alerts.
- `GET /api/notifications/unread-count` (Authenticated) — Get unread badge count.
- `PATCH /api/notifications/:notificationId/read` (Authenticated) — Mark single notification read.
- `PATCH /api/notifications/read-all` (Authenticated) — Mark all read.

---

## 11. Ephemeral Stories APIs

- `POST /api/stories` (Authenticated, Active Account Only, Rate Limited) — Multipart image upload; automatically expires in 24 hours.
- `GET /api/stories` (Authenticated) — Active stories from followed accounts and self.
- `GET /api/stories/:storyId` (Authenticated) — Story detail.
- `DELETE /api/stories/:storyId` (Authenticated, Owner Only) — Delete story.

---

## 12. Direct Messaging REST APIs

- `POST /api/conversations` (Authenticated, Active Account Only) — Initiates 1:1 conversation with `recipientId`.
- `GET /api/conversations?page=1&limit=20` (Authenticated) — Lists conversations.
- `GET /api/conversations/:conversationId` (Authenticated, Participant Only) — Conversation details.
- `PATCH /api/conversations/:conversationId/read` (Authenticated, Participant Only) — Mark read.
- `POST /api/conversations/:conversationId/messages` (Authenticated, Active Account Only, Rate Limited) — Send message.
- `GET /api/conversations/:conversationId/messages?limit=50&cursor=...` (Authenticated, Participant Only) — Message history with cursor pagination.

---

## 13. Reports API

### 13.1 Submit Violation Report
`POST /api/reports` (Authenticated, Rate Limited)
- **Request Body**:
  ```json
  {
    "targetType": "POST",
    "targetId": "6aafa0cc49feee7e447560d1",
    "reason": "SPAM",
    "details": "Unsolicited commercial advertisements"
  }
  ```

---

## 14. Admin & Moderation APIs

*Requires `role === 'ADMIN'` on authenticated account. Standard users receive `403 Forbidden`.*

- `GET /api/admin/reports?status=OPEN&targetType=POST` — Moderation queue.
- `GET /api/admin/reports/:reportId` — Report detail with resolved target document.
- `PATCH /api/admin/reports/:reportId/status` — State machine transition (`REVIEWING`, `RESOLVED`, `DISMISSED`).
- `GET /api/admin/users?q=alex&accountStatus=ACTIVE` — User administration list.
- `PATCH /api/admin/users/:userId/status` — Suspend or reactivate user account.
- `PATCH /api/admin/posts/:postId/moderation` — Moderate post (`ACTIVE`, `HIDDEN`, `REMOVED`).
- `PATCH /api/admin/comments/:commentId/moderation` — Moderate comment (`ACTIVE`, `HIDDEN`, `REMOVED`).
- `PATCH /api/admin/stories/:storyId/moderation` — Moderate story (`ACTIVE`, `HIDDEN`, `REMOVED`).

---

## 15. Admin Audit Log APIs

*Requires `role === 'ADMIN'`. Immutable append-only ledger; no modification or deletion endpoints exist.*

- `GET /api/admin/audit-logs` — Query audit logs with filters: `actorId`, `action`, `targetType`, `targetId`, `from`, `to`, `page`, `limit` (max 100).
- `GET /api/admin/audit-logs/:auditLogId` — Single audit log detail with actor population.
- `GET /api/admin/audit-logs/users/:userId/summary` — Aggregate metrics and action breakdown for investigated user.
