# Social Connect REST API Documentation

Comprehensive guide to the Social Connect backend API, endpoints, authentication model, request validation schemas, security headers, rate limits, and error handling.

---

## 1. Architecture & Security Overview

### Authentication & Token Model
- **Access Tokens**: Short-lived (15 minutes), signed using HMAC-SHA256 (`HS256`). Transmitted in the HTTP header `Authorization: Bearer <access_token>`. Contains claims `sub` (user ID) and `sid` (session ID).
- **Refresh Tokens**: Long-lived (30 days), stored in an `HttpOnly`, `SameSite=Lax` (or `SameSite=None; Secure` in cross-site production) cookie restricted to `Path=/api/auth`. Rotated on every refresh. Reused rotated tokens trigger immediate token family invalidation.
- **Sessions**: Revocable session records stored in MongoDB with SHA-256 token hashes, `expiresAt` (TTL index), and client metadata.

### Security Layers
- **HTTP Security Headers**: Powered by `helmet` with clickjacking protection (`X-Frame-Options: DENY`), MIME type sniffing prevention (`X-Content-Type-Options: nosniff`), and HSTS in production.
- **Request Tracing**: `X-Request-ID` attached to every incoming request and correlated across logs.
- **Validation**: Strict schema validation using `zod`. Rejects unwhitelisted update fields and forbidden internal properties (`_id`, `followersCount`, `isVerified`, etc.).
- **Sanitization & NoSQL Operator Protection**: Strips ASCII control characters and rejects any request containing keys starting with `$` or `.`.
- **Rate Limiting**: Sliding-window rate limiters for authentication, search, reporting, messaging, uploads, and a global API throttle.
- **File Upload Security**: In-memory buffer magic bytes inspection (JPEG, PNG, WebP) and strict multipart limits.
- **Atomic Counter Integrity**: Counter decrements (`likesCount`, `commentsCount`, `followersCount`, `followingCount`) guarded against negative values.

---

## 2. Standard Envelopes

### Success Envelope
```json
{
  "success": true,
  "message": "Resource fetched successfully",
  "data": { ... }
}
```

### Error Envelope
```json
{
  "success": false,
  "message": "Human readable error summary",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error summary",
    "details": [
      {
        "field": "username",
        "message": "Username must be between 3 and 30 characters"
      }
    ]
  }
}
```

---

## 3. Endpoints Reference

### System & Health Checks
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Liveness probe returning Express uptime status |
| `GET` | `/api/health/ready` | Public | Readiness probe checking MongoDB connectivity (200 Ready, 503 Unready) |

### Authentication & Recovery (`/api/auth`)
| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | 10 / hr | Register new account & dispatch email verification |
| `POST` | `/api/auth/login` | Public | 5 / 15 min | Authenticate user & issue access token + refresh cookie |
| `POST` | `/api/auth/refresh` | Cookie | 30 / 15 min | Rotate refresh token and issue new access token |
| `POST` | `/api/auth/logout` | Bearer | None | Revoke current session & clear cookie |
| `POST` | `/api/auth/logout-all`| Bearer | None | Revoke all active sessions for authenticated user |
| `GET` | `/api/auth/sessions` | Bearer | None | List all active sessions with safe client metadata |
| `DELETE`| `/api/auth/sessions/:sessionId` | Bearer | None | Revoke an individual user-owned session |
| `PATCH`| `/api/auth/change-password` | Bearer | None | Verify old password, set new password, revoke other sessions |
| `POST` | `/api/auth/forgot-password` | Public | 5 / hr | Anti-enumeration password recovery token dispatch |
| `POST` | `/api/auth/reset-password` | Public | 10 / hr | Reset password with single-use hashed token |
| `POST` | `/api/auth/verify-email` | Public | None | Verify account email address with single-use token |
| `POST` | `/api/auth/resend-verification` | Bearer | 3 / hr | Resend email verification link |
| `GET` | `/api/auth/me` | Bearer | None | Retrieve current authenticated user identity |

### Users & Social Graph (`/api/users`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/search` | Bearer | Search users by username prefix & full name (Rate limit: 30/min) |
| `GET` | `/api/users/me` | Bearer | Retrieve full private profile of authenticated user |
| `PATCH`| `/api/users/me` | Bearer | Whitelist update (`username`, `fullName`, `bio`, `profilePicture`) |
| `GET` | `/api/users/me/blocked` | Bearer | List blocked users (paginated) |
| `GET` | `/api/users/:username` | Optional | Retrieve public user profile (excluding private fields) |
| `GET` | `/api/users/:username/posts` | Optional | Retrieve paginated grid posts by user |
| `POST` | `/api/users/:username/follow` | Bearer | Follow target user |
| `DELETE`| `/api/users/:username/follow` | Bearer | Unfollow target user |
| `GET` | `/api/users/:username/follow-status`| Bearer | Check bilateral follow status |
| `GET` | `/api/users/:username/followers` | Public | List user's followers |
| `GET` | `/api/users/:username/following` | Public | List user's following |
| `POST` | `/api/users/:username/block` | Bearer | Block target user (removes mutual follows) |
| `DELETE`| `/api/users/:username/block` | Bearer | Unblock target user |
| `GET` | `/api/users/:username/block-status`| Bearer | Check bilateral block status |

### Posts & Interactions (`/api/posts`, `/api/feed`, `/api/saved-posts`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/posts` | Bearer | Create post with up to 10 verified images (Multipart) |
| `GET` | `/api/posts` | Public | Paginated reverse-chronological public post feed |
| `GET` | `/api/posts/:id` | Optional | Retrieve single post by ID |
| `PATCH`| `/api/posts/:id` | Bearer (Owner) | Update post caption and/or location |
| `DELETE`| `/api/posts/:id` | Bearer (Owner) | Delete post and cascade media cleanup |
| `POST` | `/api/posts/:id/like` | Bearer | Toggle like/unlike on post with atomic count protection |
| `GET` | `/api/feed` | Bearer | Home feed of followed users (cursor paginated) |
| `POST` | `/api/posts/:postId/save` | Bearer | Save/bookmark post |
| `DELETE`| `/api/posts/:postId/save` | Bearer | Remove post from bookmarks |
| `GET` | `/api/users/me/saved-posts` | Bearer | Paginated list of saved posts |

### Comments (`/api/posts/:postId/comments`, `/api/comments/:commentId`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/posts/:postId/comments` | Bearer | Add top-level comment to post |
| `GET` | `/api/posts/:postId/comments` | Public | Paginated top-level comments for a post |
| `POST` | `/api/comments/:commentId/replies` | Bearer | Reply to an existing comment |
| `GET` | `/api/comments/:commentId/replies` | Public | Paginated replies to a comment |
| `PATCH`| `/api/comments/:commentId` | Bearer (Author) | Edit comment content |
| `DELETE`| `/api/comments/:commentId` | Bearer (Author/Post Owner)| Delete comment & cascade reply cleanup |

### Stories (`/api/stories`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/stories` | Bearer | Create a 24-hour temporary story with image upload |
| `GET` | `/api/stories` | Bearer | Get unexpired stories from self and followed accounts |
| `GET` | `/api/stories/:storyId` | Bearer | View an individual story |
| `DELETE`| `/api/stories/:storyId` | Bearer (Author) | Delete story |

### Notifications (`/api/notifications`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | Bearer | Paginated list of notifications |
| `GET` | `/api/notifications/unread-count` | Bearer | Count of unread notifications |
| `PATCH`| `/api/notifications/:notificationId/read` | Bearer | Mark single notification as read |
| `PATCH`| `/api/notifications/read-all` | Bearer | Mark all notifications as read |

### Direct Messaging (`/api/conversations`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/conversations` | Bearer | Start or fetch 1-on-1 conversation with target user |
| `GET` | `/api/conversations` | Bearer | Paginated conversations list with last message preview |
| `GET` | `/api/conversations/:conversationId` | Bearer (Participant) | Get conversation metadata |
| `PATCH`| `/api/conversations/:conversationId/read`| Bearer (Participant)| Mark conversation as read |
| `POST` | `/api/conversations/:conversationId/messages`| Bearer (Participant)| Send message via REST (Rate limit: 60/min) |
| `GET` | `/api/conversations/:conversationId/messages`| Bearer (Participant)| Cursor-paginated message history |

### Reports (`/api/reports`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reports` | Bearer | Submit moderation report against user, post, comment, or story (Rate limit: 10/hr) |
