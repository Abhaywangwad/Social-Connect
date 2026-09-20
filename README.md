# Social Connect

[![CI](https://github.com/Abhaywangwad/Social-Connect/actions/workflows/ci.yml/badge.svg)](https://github.com/Abhaywangwad/Social-Connect/actions/workflows/ci.yml)

A full-stack social media application inspired by Instagram, built with the **MERN stack**.

---

## Technology Stack

| Layer      | Technology              |
|------------|-------------------------|
| Frontend   | React.js + Vite         |
| Backend    | Node.js + Express.js    |
| Database   | MongoDB + Mongoose      |
| Logging    | Morgan                  |
| Dev runner | Concurrently + Nodemon  |

---

## Project Structure

```text
social-connect/
│
├── client/                        # React frontend (Vite)
│   └── src/
│       ├── App.jsx
│       └── main.jsx
│
├── server/                        # Express backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── config.js          # All env vars in one place
│   │   │   └── db.js              # Mongoose connection
│   │   ├── controllers/
│   │   │   ├── healthController.js
│   │   │   └── userController.js  # Phase 2 — test endpoint
│   │   ├── middleware/
│   │   │   └── errorHandler.js
│   │   ├── models/
│   │   │   └── User.js            # Phase 2 — User schema
│   │   ├── routes/
│   │   │   ├── healthRoutes.js
│   │   │   └── userRoutes.js      # Phase 2 — /api/users/*
│   │   ├── services/              # Business logic (Phase 3+)
│   │   ├── utils/                 # Shared helpers (Phase 3+)
│   │   ├── app.js                 # Express config
│   │   └── server.js              # Startup entry point
│   ├── .env                       # Local secrets (gitignored)
│   ├── .env.example               # Committed template
│   └── package.json
│
├── .gitignore
├── package.json                   # Root — concurrently scripts
└── README.md
```

---

## Database

### Primary Database: MongoDB

MongoDB is used as the primary database. It is a document-oriented NoSQL
database that stores data as BSON documents (similar to JSON). It suits social
media applications well because user profiles and posts are naturally
document-shaped and schema flexibility lets the product evolve fast.

### ODM: Mongoose

Mongoose is used as the Object Document Mapper. It sits between the Express
application and MongoDB and provides:

- Schema definitions with validation
- Automatic `createdAt` / `updatedAt` timestamps
- Pre/post middleware hooks (used in Phase 3 for password hashing)
- Population (joining documents by ObjectId reference)
- Index management

### Request Flow (Layers)

```
HTTP Request
    ↓
Express Middleware  (cors → json → morgan)
    ↓
Router             (routes/userRoutes.js)
    ↓
Controller         (controllers/userController.js)
    ↓
Service            (services/ — added Phase 3+)
    ↓
Model              (models/User.js)
    ↓
MongoDB
    ↓
HTTP Response
```

---

## User Document Structure

```json
{
  "_id":            "ObjectId",
  "username":       "john_doe",
  "email":          "john@example.com",
  "password":       "<bcrypt hash — never returned in responses>",
  "fullName":       "John Doe",
  "bio":            "Software engineer",
  "profilePicture": "https://cdn.example.com/avatars/john.jpg",
  "followers":      ["ObjectId", "ObjectId"],
  "following":      ["ObjectId", "ObjectId"],
  "isPrivate":      false,
  "isVerified":     false,
  "createdAt":      "2026-01-01T00:00:00.000Z",
  "updatedAt":      "2026-01-01T00:00:00.000Z"
}
```

### Field Notes

| Field            | Purpose |
|------------------|---------|
| `username`       | Unique public handle; lowercase-normalized; used for @mentions and profile URLs |
| `email`          | Unique login identifier; lowercase; never shown publicly |
| `password`       | Stored as **bcrypt hash only** — plain text is never persisted or returned |
| `fullName`       | Display name shown on profile |
| `bio`            | Optional short description (max 150 chars) |
| `profilePicture` | URL pointing to image on object storage (S3/Cloudinary); binary not in DB |
| `followers`      | Array of ObjectIds referencing User documents |
| `following`      | Array of ObjectIds referencing User documents |
| `isPrivate`      | Determines if new follow requests require approval |
| `isVerified`     | Blue-check flag, manually granted by admins |
| `createdAt`      | Auto-managed by Mongoose `timestamps: true` |
| `updatedAt`      | Auto-managed by Mongoose `timestamps: true` |

### Why Passwords Are Not Plain Text

Storing plain-text passwords is a critical security vulnerability. If the
database is ever compromised, all user passwords are immediately exposed.

Social Connect uses **bcrypt** (to be wired in Phase 3) which:

1. Applies a one-way cryptographic hash — cannot be reversed
2. Adds a random **salt** per password — prevents rainbow-table attacks
3. Has a configurable **cost factor** — deliberately slow to brute-force

The password field is also marked `select: false` in the Mongoose schema,
meaning it is excluded from every query result by default and must be
explicitly requested only in the authentication service.

---

## Followers / Following Design

Users are connected via arrays of ObjectId references stored on the User document.

```text
User A  { following: [ObjectId(B), ObjectId(C)] }
User B  { followers: [ObjectId(A)] }
```

**Trade-offs:**

| Aspect        | Embedded Array (current) | Separate Follow Collection (future) |
|---------------|--------------------------|--------------------------------------|
| Simplicity    | ✅ Simple                | ❌ Extra collection + joins           |
| Small accounts| ✅ Fast single-doc read  | Overkill                             |
| Large accounts| ❌ 16 MB doc size limit  | ✅ Scales infinitely                  |
| Pagination    | ❌ Slice entire array    | ✅ Natural cursor pagination          |
| Queries       | ❌ $in on large arrays   | ✅ Index-covered queries              |

We will migrate to a dedicated `Follow` collection when the social graph
features are implemented in a later phase.

---

## Database Indexes

| Field      | Type   | Reason |
|------------|--------|--------|
| `username` | Unique | Profile lookups by handle; @mention resolution; login by username |
| `email`    | Unique | Login lookup; registration duplicate check; password reset |

Indexes are intentionally minimal. Adding indexes to every field wastes
write performance and disk space. Indexes will be added to additional fields
(e.g., `posts`, `createdAt`) only when specific query patterns are confirmed.

---

## Getting Started

### 1. Install Dependencies

```bash
# From root — installs concurrently
npm install

# Install server and client dependencies
npm run install:all
```

### 2. Configure Environment Variables

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/social-connect
NODE_ENV=development
```

> ⚠️ Never commit `.env` — it is already in `.gitignore`.

---

## Running the Project

```bash
# Both client + server (from root)
npm run dev

# Server only
cd server && npm run dev

# Client only
cd client && npm run dev
```

---

## API Endpoints

### Health Check

```bash
curl http://localhost:5000/api/health
```

```json
{
  "success": true,
  "message": "Social Connect API is running"
}
```

### User Route Test

```bash
curl http://localhost:5000/api/users/test
```

```json
{
  "success": true,
  "message": "User route is connected"
}
```

### User Registration (Phase 3)

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "abhay",
    "email": "abhay@example.com",
    "password": "Password123!",
    "fullName": "Abhay Wangwad"
  }'
```

### User Login (Phase 4)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "abhay@example.com",
    "password": "Password123!"
  }'
```

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "6aaec091a...",
      "username": "abhay",
      "email": "abhay@example.com",
      "fullName": "Abhay Wangwad",
      "bio": "",
      "profilePicture": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### User Profile Endpoints (Phase 5)

#### 1. Get Current User Profile (Protected)
```bash
curl http://localhost:5000/api/users/me \
  -H "Authorization: Bearer <accessToken>"
```

#### 2. Update Current User Profile (Protected)
```bash
curl -X PATCH http://localhost:5000/api/users/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "fullName": "Abhay W",
    "bio": "Building Social Connect",
    "profilePicture": "https://example.com/profile.jpg"
  }'
```

#### 3. Get Public Profile (Public)
```bash
curl http://localhost:5000/api/users/abhay
```

### Follow System Endpoints (Phase 6)

#### 1. Follow User (Protected)
```bash
curl -X POST http://localhost:5000/api/users/abhay/follow \
  -H "Authorization: Bearer <accessToken>"
```

#### 2. Unfollow User (Protected)
```bash
curl -X DELETE http://localhost:5000/api/users/abhay/follow \
  -H "Authorization: Bearer <accessToken>"
```

#### 3. Get Follow Status (Protected)
```bash
curl http://localhost:5000/api/users/abhay/follow-status \
  -H "Authorization: Bearer <accessToken>"
```

#### 4. Get Followers (Public, Paginated)
```bash
curl "http://localhost:5000/api/users/abhay/followers?page=1&limit=20"
```

#### 5. Get Following (Public, Paginated)
```bash
curl "http://localhost:5000/api/users/abhay/following?page=1&limit=20"
```

---

### Post System Endpoints (Phase 7 & 8)

#### 1. Create Post with Media Uploads (Protected)
```bash
curl -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer <accessToken>" \
  -F "caption=Golden hour in Candolim #sunset #vacation" \
  -F "location=Goa, India" \
  -F "media=@/path/to/sunset.jpg" \
  -F "media=@/path/to/beach.jpg"
```

#### 2. Get Single Post by ID (Public)
```bash
curl http://localhost:5000/api/posts/<postId>
```

#### 3. Get User Posts Grid (Public, Paginated)
```bash
curl "http://localhost:5000/api/users/abhay/posts?page=1&limit=12"
```

#### 4. Get Global Posts Feed (Public, Paginated)
```bash
curl "http://localhost:5000/api/posts?page=1&limit=10"
```

#### 5. Update Post Caption / Location (Protected, Owner Only)
```bash
curl -X PATCH http://localhost:5000/api/posts/<postId> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "caption": "Updated caption description",
    "location": "North Goa"
  }'
```

#### 6. Delete Post + Cloudinary Media Cleanup (Protected, Owner Only)
```bash
curl -X DELETE http://localhost:5000/api/posts/<postId> \
  -H "Authorization: Bearer <accessToken>"
```

---

## Image Upload & Media Architecture (Phase 8)

### Pipeline Architecture

```text
Browser
   │
   │ multipart/form-data
   ▼
Express
   │
   ▼
Multer (memoryStorage)
   │
   ▼
Media Service (upload_stream)
   │
   ▼
Cloudinary
   │
   ├── URL
   ├── publicId
   └── metadata (width, height)
            │
            ▼
         MongoDB
            │
            ▼
           Post
```

### Media Design & Rules
- **Why NOT MongoDB for image binaries**: Storing large binary BLOBs inside MongoDB rapidly exhausts the BSON 16 MB document size limit, pollutes WiredTiger cache memory, degrades database indexing speed, and complicates backups. MongoDB stores only metadata and cloud URLs.
- **Why Cloudinary**: Provides an enterprise media delivery network with edge CDN caching, automatic image format optimization (WebP/AVIF), on-the-fly transformations, and durable asset storage.
- **Role of Multer**: Parses incoming `multipart/form-data` streams and extracts files directly into Node.js in-memory buffers (`multer.memoryStorage()`), preventing temporary files from lingering on the application server disk.
- **Supported Formats**: JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`).
- **File Limits**: Up to 10 MB per image, maximum 10 images per post carousel.
- **Cloudinary Folder Structure**: Assets are organized systematically in `social-connect/posts/`.
- **What `publicId` Is**: The unique cloud identifier assigned by Cloudinary. Used on the server to manage or destroy assets upon post deletion or rollback. It is kept internal to the backend and omitted from client responses.
- **Cleanup & Rollback Resilience**:
  - **Partial Cloudinary Failure**: If image 3 of 5 fails to upload, all previously uploaded images (1 and 2) are automatically destroyed from Cloudinary.
  - **MongoDB Failure**: If the database write fails after successful uploads, newly uploaded Cloudinary assets are automatically rolled back.
  - **Post Deletion**: When an author deletes a post, all linked Cloudinary assets are destroyed via `mediaService.deleteMultipleImages()`.

---

---

### Comment & Reply System Endpoints (Phase 10)

#### 1. Create Top-Level Comment on a Post (Protected)
```bash
curl -X POST http://localhost:5000/api/posts/<postId>/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "content": "This is a great post!"
  }'
```

#### 2. Get Top-Level Comments for a Post (Public, Paginated)
```bash
curl "http://localhost:5000/api/posts/<postId>/comments?page=1&limit=20"
```

#### 3. Reply to a Comment (Protected, 1-Level Depth)
```bash
curl -X POST http://localhost:5000/api/comments/<commentId>/replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "content": "I completely agree with this!"
  }'
```

#### 4. Get Replies for a Comment (Public, Paginated)
```bash
curl "http://localhost:5000/api/comments/<commentId>/replies?page=1&limit=20"
```

#### 5. Edit Own Comment (Protected, Author Only)
```bash
curl -X PATCH http://localhost:5000/api/comments/<commentId> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "content": "Updated comment content"
  }'
```

#### 6. Delete Comment (Protected, Comment Author OR Post Owner)
```bash
curl -X DELETE http://localhost:5000/api/comments/<commentId> \
  -H "Authorization: Bearer <accessToken>"
```

---

### Home Feed Endpoints (Phase 11)

#### 1. Get Authenticated User Home Feed (Protected, Cursor Paginated)
```bash
# First page
curl "http://localhost:5000/api/feed?limit=20" \
  -H "Authorization: Bearer <accessToken>"

# Next page using cursor
curl "http://localhost:5000/api/feed?limit=20&cursor=<nextCursor>" \
  -H "Authorization: Bearer <accessToken>"
```

---

## Home Feed Architecture (Phase 11)

### Pipeline Architecture

```text
                 USER
                  │
                  │ follows
                  ▼
                FOLLOW
                  │
                  │ following IDs
                  ▼
             FEED SERVICE
                  │
                  ▼
                POST
                  │
        ┌─────────┴─────────┐
        │                   │
      AUTHOR             LIKE
        │                   │
        ▼                   ▼
   User details        isLiked state
        │                   │
        └─────────┬─────────┘
                  ▼
              FEED RESPONSE
```

### Feed Design & Key Principles
- **Feed Definition**: Contains posts created by followed users + the authenticated user's own posts.
- **Source of Truth**: The `Follow` collection is queried directly; no stale de-normalized following arrays.
- **Private Account Visibility**: A private account's posts appear in a user's feed only if an active `Follow` record exists.
- **Deterministic Ordering**: Sorted by `createdAt DESC, _id DESC`. The secondary `_id` tie-breaker guarantees that posts created at the exact same millisecond are never skipped or duplicated.
- **Cursor Pagination**: Uses base64url-encoded compound cursors (`{ createdAt, id }`). Eliminates high-offset `$skip` table-scanning penalties.
---

### Saved Posts / Bookmark Endpoints (Phase 12)

#### 1. Save a Post (Protected)
```bash
curl -X POST http://localhost:5000/api/posts/<postId>/save \
  -H "Authorization: Bearer <accessToken>"
```

#### 2. Unsave a Post (Protected)
```bash
curl -X DELETE http://localhost:5000/api/posts/<postId>/save \
  -H "Authorization: Bearer <accessToken>"
```

#### 3. Check Save Status (Protected)
```bash
curl http://localhost:5000/api/posts/<postId>/save-status \
  -H "Authorization: Bearer <accessToken>"
```

#### 4. Get Current User's Saved Posts (Protected, Paginated)
```bash
curl "http://localhost:5000/api/users/me/saved-posts?page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

---

### Notification Endpoints (Phase 13)

#### 1. Get Notifications (Protected, Paginated)
```bash
curl "http://localhost:5000/api/notifications?page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

#### 2. Get Unread Notification Count (Protected)
```bash
curl http://localhost:5000/api/notifications/unread-count \
  -H "Authorization: Bearer <accessToken>"
```

#### 3. Mark Single Notification as Read (Protected)
```bash
curl -X PATCH http://localhost:5000/api/notifications/<notificationId>/read \
  -H "Authorization: Bearer <accessToken>"
```

#### 4. Mark All Notifications as Read (Protected)
```bash
curl -X PATCH http://localhost:5000/api/notifications/read-all \
  -H "Authorization: Bearer <accessToken>"
```

---

## Saved Posts Architecture (Phase 12)

```text
USER
 │
 ├── follows ──► FOLLOW
 │
 ├── creates ──► POST
 │
 ├── likes ────► LIKE
 │
 ├── comments ─► COMMENT
 │
 └── saves ────► SAVE
```

```text
SAVE
 ├── user → User._id
 ├── post → Post._id
 ├── createdAt (determines saved-posts ordering)
 └── updatedAt
```

### Design Principles
- **Dedicated Collection**: Saves are modeled in a dedicated `Save` collection rather than an unbounded array on `User` to prevent document growth issues and memory fragmentation.
- **Database-Level Uniqueness**: Compound unique index `{ user: 1, post: 1 }` prevents race condition duplicate saves.
- **Save-Time Ordering**: `GET /api/users/me/saved-posts` orders posts by `Save.createdAt DESC` (when the user saved the post, rather than when the post was originally created).
- **Private Data Isolation**: Saved posts are completely private to the saving user and never exposed publicly. No public `savesCount` is tracked on the post.
- **Feed `isSaved` Integration**: The home feed computes `isSaved` across all returned posts in a single indexed batch query using `$in` and constant-time `Set` lookups, completely avoiding N+1 queries.
- **Cascade Deletion**: When a post is deleted, all associated `Save` documents are automatically removed via `Save.deleteMany({ post: postId })`.

---

## Notification Architecture (Phase 13)

```text
EVENT TRIGGER
 ├── User A follows User B ─────────► FOLLOW Notification for User B
 ├── User A likes User B's post ────► LIKE Notification for User B
 ├── User A comments on B's post ───► COMMENT Notification for User B
 └── User A replies to B's comment ─► REPLY Notification for User B
```

```text
NOTIFICATION DOCUMENT
 ├── recipient → User._id (target user)
 ├── actor     → User._id (originating user)
 ├── type      → 'FOLLOW' | 'LIKE' | 'COMMENT' | 'REPLY'
 ├── post      → Post._id (optional, populated for LIKE, COMMENT, REPLY)
 ├── comment   → Comment._id (optional, populated for COMMENT, REPLY)
 ├── follow    → Follow._id (optional, populated for FOLLOW)
 ├── isRead    → Boolean (default: false)
 ├── createdAt → Date (indexed DESC)
 └── updatedAt → Date
```

### Design Principles
- **No Self-Notifications**: If a user likes their own post, comments on their own post, or replies to their own comment, the notification service explicitly drops the event before database writes (`recipient.toString() !== actor.toString()`).
- **Compound Database Indexes**:
  - `{ recipient: 1, createdAt: -1 }`: Optimizes reverse-chronological notification list queries with high selectivity.
  - `{ recipient: 1, isRead: 1 }`: Powers constant-time unread count checks (`Notification.countDocuments({ recipient, isRead: false })`).
  - `{ post: 1 }`: Enables fast cascade deletion when a post is removed.
- **Strict Route Order**: `/api/notifications/unread-count` and `/api/notifications/read-all` are registered before `/:notificationId/read` to prevent Express route parameter collisions.
- **Ownership Authorization**: Only the recipient can mark their own notification as read or fetch their notification list. Cross-user attempts return `403 Forbidden`.
- **Cascade Cleanup**:
  - When a post is deleted, all related notifications (`post: postId`) are deleted in `postService.js`.
  - When a comment is deleted, all related notifications (`comment: commentId`) are deleted in `commentService.js`.

---

### User Search Endpoints (Phase 14)

#### 1. Search Users (Protected, Paginated)
```bash
curl "http://localhost:5000/api/users/search?q=abh&page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

---

## User Search Architecture (Phase 14)

```text
GET /api/users/search?q=abh
             │
             ▼
     JWT Authentication (req.user.userId)
             │
             ▼
     Validate & Normalize Query (trim, lowercase, min 2 chars)
             │
             ▼
     MongoDB User Query
       ├── Exclude Current User: _id != req.user.userId
       ├── Username Prefix Match: ^abh (hits { username: 1 } index)
       └── Full Name Match: abh (hits { normalizedFullName: 1 } index)
             │
             ▼
     Pagination (.sort({ username: 1, _id: 1 }).skip().limit())
             │
             ▼
     Select Safe Fields (id, username, fullName, profilePicture, bio, etc.)
             │
             ▼
     Collect Target User IDs [id1, id2, ... id20]
             │
             ▼
     ONE Batch Follow Query:
       Follow.find({ follower: currentUserId, following: { $in: targetUserIds } })
             │
             ▼
     Build Set of Followed IDs & Map isFollowing
             │
             ▼
     Return Standardized JSON Response
```

### Design Principles
- **Normalized Stored Fields**: `username` is stored lowercase with a unique index. `normalizedFullName` is maintained automatically via pre-save hooks and profile update routines with a dedicated index `{ normalizedFullName: 1 }`.
- **Anchored Prefix Scanning**: Username prefix matching `/^query/` allows MongoDB's B-tree index to perform index range scanning `['abh', 'abi')` rather than scanning all documents.
- **Current User Exclusion**: Excluded at the database query level (`_id: { $ne: currentUserId }`), avoiding wasteful transmission and in-memory filtering.
- **Single-Query Follow Resolution**: Collects all search result user IDs and performs one `$in` lookup against the `Follow` collection, achieving $O(1)$ set membership lookups and completely eliminating N+1 database queries.
- **Route Precedence**: `/api/users/search` is declared before `/:username` to prevent Express route parameter collisions.
- **Safe Public Projection**: Strips `password`, `email`, and internal database versioning. Private accounts are discoverable with their public metadata (`isPrivate: true`), but private content is never exposed.

---

### Stories Endpoints (Phase 15)

#### 1. Create a Story (Protected, Multipart)
```bash
curl -X POST http://localhost:5000/api/stories \
  -H "Authorization: Bearer <accessToken>" \
  -F "media=@story-image.jpg" \
  -F "caption=Good evening!"
```

#### 2. Get Active Stories (Protected, Cursor Paginated)
```bash
curl "http://localhost:5000/api/stories?limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

#### 3. Get Single Story Detail (Protected)
```bash
curl http://localhost:5000/api/stories/<storyId> \
  -H "Authorization: Bearer <accessToken>"
```

#### 4. Delete Own Story (Protected)
```bash
curl -X DELETE http://localhost:5000/api/stories/<storyId> \
  -H "Authorization: Bearer <accessToken>"
```

---

## Stories Architecture (Phase 15)

```text
POST /api/stories (Multipart: media + caption)
       │
       ▼
JWT Authentication (req.user.userId)
       │
       ▼
Multer (MemoryStorage, max 10MB, JPEG/PNG/WebP)
       │
       ▼
Upload to Cloudinary (folder: 'social-connect/stories')
       │
       ▼
Set Server-Enforced Expiration (expiresAt = now + 24 hours)
       │
       ▼
Persist Story to MongoDB (with Cloudinary rollback on DB failure)
       │
       ▼
TTL Index ({ expiresAt: 1 }, expireAfterSeconds: 0)
       │
       ▼
Automatic Eventual Physical Document Deletion by MongoDB
```

```text
GET /api/stories (Active Feed)
       │
       ▼
JWT Authentication (currentUserId)
       │
       ▼
Find Followed Users (Follow.find({ follower: currentUserId }))
       │
       ▼
Construct Visible Authors (currentUserId + followed user IDs)
       │
       ▼
Active Stories Query:
  Story.find({ author: { $in: visibleAuthorIds }, expiresAt: { $gt: now } })
       │
       ▼
Cursor Pagination & Stable Ordering (.sort({ createdAt: -1, _id: -1 }))
       │
       ▼
Populate Safe Author Fields (username, fullName, profilePicture, isVerified)
       │
       ▼
Return JSON with nextCursor
```

### Design Principles & Expiration Lifecycle
- **Server-Controlled 24-Hour Expiration**: `expiresAt` is strictly computed by the server (`Date.now() + 24 * 60 * 60 * 1000`). Clients cannot forge or manipulate the expiration timestamp.
- **MongoDB TTL Index**: Story documents feature a TTL index on `expiresAt` with `expireAfterSeconds: 0`. MongoDB's background thread periodically removes expired documents without custom cron jobs.
- **Immediate Application Active Filtering**: Because MongoDB's background TTL thread runs asynchronously (typically once every 60 seconds), all API queries explicitly enforce `expiresAt: { $gt: new Date() }`. Expired stories are immediately unavailable and return `404 Not Found`.
- **Cloudinary Cleanup Limitation**: MongoDB TTL removes documents from MongoDB, but cannot execute external HTTP calls to Cloudinary. For manual deletions (`DELETE /api/stories/:storyId`), the backend explicitly deletes the Cloudinary asset. For automatic TTL expirations, orphaned media can be garbage-collected via periodic cloud backup policies or scheduled worker sweeps.
- **Follow & Private Account Privacy**: The active story feed only includes stories from followed users and the authenticated user. For individual story lookups (`GET /api/stories/:storyId`), private user stories return `404 Not Found` if the viewer does not follow the author.
- **Bounded Pagination**: Cursor-based pagination (`nextCursor`) ensures constant-time pagination without offset degradation. Limit is capped at 50 to prevent unbounded queries.

---

### Direct Messaging Endpoints (Phase 16)

#### 1. Create or Get One-to-One Conversation (Protected)
```bash
curl -X POST http://localhost:5000/api/conversations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "<targetUserId>"}'
```

#### 2. Get User Conversations List (Protected, Paginated)
```bash
curl "http://localhost:5000/api/conversations?page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"
```

#### 3. Get Single Conversation Details (Protected)
```bash
curl http://localhost:5000/api/conversations/<conversationId> \
  -H "Authorization: Bearer <accessToken>"
```

#### 4. Send Message (Protected)
```bash
curl -X POST http://localhost:5000/api/conversations/<conversationId>/messages \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello!"}'
```

#### 5. Get Conversation Messages History (Protected, Cursor Paginated)
```bash
curl "http://localhost:5000/api/conversations/<conversationId>/messages?limit=30&before=<cursor>" \
  -H "Authorization: Bearer <accessToken>"
```

#### 6. Mark Conversation as Read (Protected)
```bash
curl -X PATCH http://localhost:5000/api/conversations/<conversationId>/read \
  -H "Authorization: Bearer <accessToken>"
```

---

## Direct Messaging Architecture (Phase 16)

```text
POST /api/conversations/:conversationId/messages
                 │
                 ▼
         JWT Authentication (currentUserId)
                 │
                 ▼
         Verify Conversation Membership (currentUserId ∈ participants)
                 │
                 ▼
         Validate Content (1 - 5000 characters)
                 │
                 ▼
         Create Message Document in MongoDB
                 │
                 ▼
         Atomically Update Conversation:
           ├── lastMessage: { content, sender, createdAt }
           ├── lastMessageAt: now
           └── participantStates[currentUserId].lastReadAt = now
                 │
                 ▼
         Return Message with Safe Sender Profile
```

```text
CONVERSATION DOCUMENT
 ├── participants: [UserA._id, UserB._id]
 ├── conversationKey: "minId:maxId" (UNIQUE INDEX)
 ├── lastMessage: { content, sender, createdAt }
 ├── lastMessageAt: Date (INDEXED DESC)
 └── participantStates: [
       { user: UserA._id, lastReadAt: Date },
       { user: UserB._id, lastReadAt: Date }
     ]

MESSAGE DOCUMENT
 ├── conversation → Conversation._id (INDEXED)
 ├── sender       → User._id
 ├── content      → String (1 - 5000 chars)
 ├── createdAt    → Date (INDEXED DESC)
 └── updatedAt    → Date
```

### Design Principles
- **Race-Condition Duplicate Prevention**: One-to-one conversations generate a deterministic `conversationKey` from sorted participant IDs (`min(idA, idB) + ":" + max(idA, idB)`), backed by a unique index `{ conversationKey: 1 }`. Concurrent creation requests between the same users are guaranteed to resolve into the exact same conversation document without duplicates.
- **Participant-Specific Unread Tracking**: Rather than updating an `isRead: boolean` flag across thousands of individual messages, the `Conversation` model stores each participant's `lastReadAt` timestamp. Unread messages are computed as messages where `conversation = id AND sender != currentUserId AND createdAt > currentUser.lastReadAt`. Marking a conversation as read requires updating only one timestamp in $O(1)$ time.
- **N+1 Query Prevention**: When returning the conversation list (`GET /api/conversations`), unread counts for all 20 returned conversations are computed in a single `$match + $group` aggregation query across the Message collection, completely avoiding per-conversation database lookups.
- **Chat History Cursor Pagination**: The message history endpoint queries messages sorted by `{ createdAt: -1, _id: -1 }` with an encoded `before` cursor, then returns them in chronological order (`createdAt ASC`) with a `nextCursor` for loading older messages on scroll-up.
- **Strict Membership Authorization**: A user cannot read, send messages, or view conversation details unless their verified JWT user ID exists in `conversation.participants`. Unauthorized attempts return `403 Forbidden`.

---

---

## Real-Time Messaging with Socket.IO (Phase 17)

### Socket Connection & Handshake Authentication
Clients initiate a real-time connection to the shared HTTP server using Socket.IO:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: '<accessToken>',
  },
  transports: ['websocket'],
});
```

### Real-Time Event Specifications

| Event                  | Direction       | Authentication       | Purpose & Description                                         |
| ---------------------- | --------------- | -------------------- | ------------------------------------------------------------- |
| `conversation:join`    | Client → Server | Required (JWT)       | Join authorized conversation room (`conversation:<id>`)        |
| `conversation:leave`   | Client → Server | Required (JWT)       | Leave conversation room                                       |
| `message:send`         | Client → Server | Required (JWT)       | Persist message to MongoDB first, then deliver real-time      |
| `message:new`          | Server → Client | Authenticated socket | Real-time delivery to other conversation room participants    |
| `conversation:updated` | Server → Client | Authenticated socket | Conversation preview update emitted to participant user rooms |
| `presence:online`      | Server → Client | Authenticated socket | Emitted when a user connects their first active socket        |
| `presence:offline`     | Server → Client | Authenticated socket | Emitted when a user disconnects their last active socket      |

---

## Real-Time Messaging Architecture (Phase 17)

```text
                    CLIENT
                       │
             ┌─────────┴─────────┐
             │                   │
           REST                SOCKET
             │                   │
             ▼                   ▼
        Express API         Socket.IO Server
             │                   │
             │              JWT Auth
             │                   │
             └──────────┬────────┘
                        ▼
                  Message Service
                        │
                        ▼
                    MongoDB
                        │
              ┌─────────┴─────────┐
              │                   │
         Conversation           Message
              │                   │
              └─────────┬─────────┘
                        ▼
                 Socket Delivery
```

### Flow of `message:send`

```text
Client A (Sender)
   │
   │  socket.emit("message:send", { conversationId, content, clientMessageId })
   ▼
Socket.IO Server
   ├── Rate Limit Check (20 msgs / 10s sliding window)
   ├── Validate Conversation ID & Content
   │
   ▼
Message Service (server/src/services/messageService.js)
   ├── Validate Conversation & Participant Authorization (A ∈ participants)
   ├── Idempotency Check (sender + clientMessageId)
   ├── Create Message Document in MongoDB
   ├── Update Conversation.lastMessage & lastMessageAt
   └── Update Conversation.participantStates[UserA].lastReadAt = now
   │
   ▼
Persistence Succeeded in MongoDB (Single Source of Truth)
   │
   ├──────────────► Authoritative Sender Ack: { success: true, message }
   │
   ├──────────────► socket.to("conversation:<id>").emit("message:new", message)
   │                 (Recipient receives real-time event without sender duplication)
   │
   └──────────────► io.to("user:<id>").emit("conversation:updated", { lastMessage, ... })
                     (Updates chat inbox preview for all participants)
```

### Key Technical Decisions
1. **Persistence-First Guarantee**: Socket.IO is a delivery transport, NOT the source of truth. Messages are never emitted before MongoDB persistence succeeds. If MongoDB write fails, the client receives an error acknowledgement and no phantom messages are delivered.
2. **Strict Handshake Authentication**: Sockets are authenticated in `socketAuth.js` middleware before the connection is established. Handshakes without a token, with an invalid token, or with an expired token are rejected with code `AUTHENTICATION_FAILED`.
3. **Room Membership Authorization**: Sockets cannot join arbitrary conversation rooms. Upon `conversation:join`, the backend verifies that `socket.user.userId` belongs to `conversation.participants`. Unauthorized joins are rejected with `CONVERSATION_ACCESS_DENIED`.
4. **Duplicate Delivery Prevention**: When User A sends a message, User A receives the authoritative persisted message in the Socket.IO acknowledgement callback. `message:new` is broadcast using `socket.to(room).emit(...)`, which reaches all *other* participants in the room, cleanly preventing User A from receiving duplicate messages.
5. **Idempotency with `clientMessageId`**: An optional client-generated key is protected by a compound partial unique index `{ sender: 1, clientMessageId: 1 }` (`partialFilterExpression: { clientMessageId: { $type: 'string' } }`). Network retries return the already persisted message without duplicate records.
6. **In-Memory Multi-Tab Presence**: `presenceManager` tracks `userSocketCounts = new Map<string, number>()`. Opening multiple tabs increments the count. Closing one tab keeps the user online. `presence:offline` is emitted only when the user's last socket disconnects.
7. **Single-Server Limitation & Scaling**: In-memory presence and sliding-window rate limiting are scoped to a single server process. For multi-server clusters, an external pub/sub store (such as Redis with `@socket.io/redis-adapter`) would be introduced in a future scaling phase.
8. **Independent Unread State**: Real-time delivery does NOT update the recipient's `lastReadAt`. Unread counts reflect all messages after `lastReadAt` until the recipient explicitly reads the conversation via `PATCH /api/conversations/:id/read`.

---

---

## Read Receipts + Typing Indicators (Phase 18)

### Architectural Separation
```text
READ RECEIPTS (Persistent State)
Conversation
 └── participantStates[]
       ├── user
       └── lastReadAt
             ↓
          MongoDB

TYPING INDICATORS (Ephemeral State)
Socket.IO
   ↓
Typing Manager
   ↓
in-memory state
   ↓
other participant
```

### Event Specifications

| Event               | Direction       | Authentication       | Purpose & Description                                         |
| ------------------- | --------------- | -------------------- | ------------------------------------------------------------- |
| `conversation:read` | Client → Server | Required (JWT)       | Persist current user's read state to MongoDB & emit to other  |
| `message:read`      | Server → Client | Authenticated socket | Notify other participant that messages up to readAt were read |
| `typing:start`      | Client → Server | Required (JWT)       | Begin temporary typing state with 3s auto-expiration          |
| `typing:stop`       | Client → Server | Required (JWT)       | End temporary typing state                                    |

---

### Read Receipts Flow

```text
User B opens conversation
        ↓
conversation:read
        ↓
Socket authentication (JWT)
        ↓
Conversation membership check (User B ∈ participants)
        ↓
Conversation Service (messageService.markConversationAsRead)
        ↓
Update B.lastReadAt = new Date() (Server-controlled timestamp)
        ↓
MongoDB Persistence Succeeded
        ↓
Sender Acknowledgement: { success: true, conversationId, readAt }
        ↓
message:read emitted to user:<UserA._id>
```

**REST Fallback:**
```text
PATCH /api/conversations/:id/read
        ↓
Conversation Service
        ↓
MongoDB
        ↓
Emit message:read via Socket.IO
```

### Meaning of `lastReadAt` & Dynamic `isRead` Computation
- **No `Message.isRead` Boolean in MongoDB**: For one-to-one messaging, storing `isRead` permanently on every Message document is wasteful and requires bulk writes. Instead, `Conversation.participantStates.lastReadAt` stores each participant's read watermark.
- **Dynamic Derivation**: In `GET /api/conversations/:id/messages`, `isRead` is computed dynamically in $O(1)$ memory without extra database queries:
  - For messages sent by the viewer: `isRead = message.createdAt <= recipient.lastReadAt`
  - For messages received by the viewer: `isRead = message.createdAt <= viewer.lastReadAt`
- **Server Timestamp Authority**: Clients cannot submit arbitrary `lastReadAt` values. The server strictly uses `new Date()`.

---

### Typing Indicators Architecture & Lifecycle

```text
User A starts typing
        ↓
typing:start
        ↓
JWT verification & Membership check
        ↓
Typing Manager (server/src/socket/typingManager.js)
        ↓
Temporary in-memory registration & 3s timer
        ↓
User B receives typing:start (User A never receives their own event)
```

**Stopping Transitions:**
1. **Explicit Stop**: User A emits `typing:stop` -> timer cancelled -> User B receives `typing:stop`.
2. **Auto-Timeout**: If no typing activity occurs for 3 seconds -> timer fires -> state cleared -> User B receives `typing:stop`.
3. **Message Send**: When User A sends `message:send` -> typing state automatically terminates -> User B receives `typing:stop`.
4. **Socket Disconnect**: When User A disconnects -> `typingManager.handleDisconnect` cleans up active typing state -> User B receives `typing:stop`.
5. **Anti-Spam**: Repeated `typing:start` emissions while already typing refresh the 3s timeout without broadcasting redundant events over the network.

---

## Development Phases

| Phase | Focus                                                 | Status   |
|-------|-------------------------------------------------------|----------|
| 1     | Project foundation & health API                       | ✅ Done   |
| 2     | MongoDB + User model                                  | ✅ Done   |
| 3     | User Registration (bcrypt + auth)                     | ✅ Done   |
| 4     | Login, JWT & Auth Middleware                          | ✅ Done   |
| 5     | User Profile System                                   | ✅ Done   |
| 6     | Follow & Social Graph System                          | ✅ Done   |
| 7     | Post System (CRUD, Pagination, Authorization)         | ✅ Done   |
| 8     | Image Upload & Media Storage (Cloudinary + Multer)    | ✅ Done   |
| 9     | Likes System                                          | ✅ Done   |
| 10    | Comments + 1-Level Replies System                     | ✅ Done   |
| 11    | Home Feed (Cursor Pagination & N+1 Prevention)       | ✅ Done   |
| 12    | Saved Posts / Bookmark System                         | ✅ Done   |
| 13    | Notification System (Follow, Like, Comment, Reply)    | ✅ Done   |
| 14    | User Search / Discovery System                        | ✅ Done   |
| 15    | Stories System (24h TTL, Ephemeral Media, Privacy)    | ✅ Done   |
| 16    | Direct Messaging (1-to-1, Unread Tracking, History)   | ✅ Done   |
| 17    | Real-Time Messaging (Socket.IO, Rooms, Presence, Ack) | ✅ Done   |
| 18    | Read Receipts + Typing Indicators (lastReadAt, Memory)| ✅ Done   |
| 19    | User Blocking + Reporting + Access Control            | ✅ Done   |
| 20    | Authentication Hardening + Account Recovery           | ✅ Done   |

---

## Phase 19: User Blocking + Reporting + Backend Access Control

### Architecture Overview

Phase 19 provides safety, user control, and content moderation boundaries:

```text
User Blocking (Directional Document with Bilateral Enforcement)
    ├── Models: Block (blocker, blocked, compound unique index)
    ├── Follow Cleanup: Bidirectional follow removal & atomic counter decrement
    ├── Relationship Rule: Unblocking does NOT restore prior follow relationships
    └── Bilateral Enforcement:
         ├── Follow: Neither user can follow the other (403)
         ├── Feed: Neither user sees the other's posts in Home Feed
         ├── Search: Symmetrically excluded from search discovery results
         ├── Profile: Returns 404 Not Found (privacy-safe, no existence leakage)
         ├── Stories: Symmetrically hidden from active stories and single lookups
         ├── Direct Messaging: Cannot initiate conversations or send messages (403)
         ├── Socket.IO: Blocked users rejected from joining conversation or sending typing indicators
         ├── Likes & Comments: Rejected with 403 Forbidden
         └── Notifications: Suppressed in real-time and excluded from notification queries

User Reporting (Auditable Content Moderation Intake)
    ├── Models: Report (reporter, targetType, targetId, reason, details, status)
    ├── Enums: targetType (USER, POST, COMMENT, STORY), reason (SPAM, HARASSMENT, SCAM, INAPPROPRIATE_CONTENT, IMPERSONATION, OTHER)
    ├── Target Existence: Enforced across all 4 resource types before report persistence
    ├── Anti-Spam: Partial unique compound index on { reporter, targetType, targetId } where status == 'OPEN'
    ├── Privacy Rule: Reports are write-only for standard users (no public report viewing endpoints)
    └── Independence Rule: Reporting does NOT automatically block the target user
```

### Endpoints Implemented

| Method | Endpoint                          | Auth | Description                                         |
|--------|-----------------------------------|------|-----------------------------------------------------|
| POST   | `/api/users/:username/block`      | Yes  | Block user, clean up mutual follows & counters      |
| DELETE | `/api/users/:username/block`      | Yes  | Unblock user (does not restore follows)             |
| GET    | `/api/users/:username/block-status`| Yes | Check bilateral block flags (`isBlocked`, `isBlockedByTarget`) |
| GET    | `/api/users/me/blocked`           | Yes  | Paginated list of users blocked by authenticated user|
| POST   | `/api/reports`                    | Yes  | Submit moderation report for User, Post, Comment, Story |

---

## Phase 20: Authentication Hardening + Account Recovery

### Architecture Overview

```text
                    LOGIN
                      │
                      ▼
              Verify password
                      │
                      ▼
                Create Session
                      │
             ┌────────┴────────┐
             ▼                 ▼
       Access Token       Refresh Token
        short-lived       HttpOnly cookie
        (sub, sid)         (SHA-256 hash)
             │                 │
             ▼                 ▼
       Protected APIs       /refresh
                               │
                               ▼
                       Rotate refresh token
                               │
                               ▼
                        New access token
```

### Security Principles & Workflows

1. **Access Token + Refresh Token**:
   - Access token: short-lived (15 minutes), passed as Bearer JWT, encoded with standard `sub` (userId) and `sid` (sessionId) claims, signed using enforced `HS256` algorithm.
   - Refresh token: long-lived (30 days), stored in an HttpOnly, Secure, SameSite=Lax cookie with Path `/api/auth`.
2. **Stateful Session Model (`Session.js`)**:
   - Stores SHA-256 hash of the refresh token. Raw refresh tokens are never persisted in the database.
   - Maintains a `tokenFamily` UUID. During refresh rotation, the old token's hash is archived in `previousTokenHashes`.
   - **Reuse Detection**: If an attacker presents a previously rotated token, the entire `tokenFamily` is revoked immediately with 401 Unauthorized.
3. **Session Revocation & Logout**:
   - `POST /api/auth/logout`: Revokes the current session and clears the refresh cookie.
   - `POST /api/auth/logout-all`: Atomically revokes all active sessions for the user using `updateMany()`.
   - `GET /api/auth/sessions`: Lists active sessions with safe metadata (no hashes or sensitive IPs).
   - `DELETE /api/auth/sessions/:sessionId`: Allows a user to revoke an individual session (verifies ownership).
4. **Password Change & Reset**:
   - `PATCH /api/auth/change-password`: Verifies current password, enforces complexity rules, updates hash, and immediately revokes all active sessions.
   - `POST /api/auth/forgot-password`: Anti-enumeration protection (returns generic response for both existing and non-existing accounts). Dispatches 15-minute single-use hashed reset token.
   - `POST /api/auth/reset-password`: Validates unconsumed, unexpired token, updates password, marks token used, and revokes all active sessions.
5. **Email Verification**:
   - `User.emailVerified` (default `false`) and `User.emailVerifiedAt` (default `null`).
   - Dispatches 24-hour single-use hashed verification token on registration.
   - `POST /api/auth/verify-email`: Marks user verified and consumes token.
   - `POST /api/auth/resend-verification`: Rate-limited endpoint that generates and dispatches a fresh token.
6. **Rate Limiting**:
   - Independent sliding-window rate limiters for `/login`, `/register`, `/forgot-password`, `/resend-verification`, `/reset-password`, and `/refresh`.

### Endpoints Implemented

| Method | Endpoint                        | Auth           | Purpose                    |
| ------ | ------------------------------- | -------------- | -------------------------- |
| POST   | `/api/auth/register`            | Public (Limiter)| Create account + dispatch verification |
| POST   | `/api/auth/login`               | Public (Limiter)| Login + create session + HttpOnly cookie |
| POST   | `/api/auth/refresh`             | Cookie (Limiter)| Refresh access token + token rotation |
| POST   | `/api/auth/logout`              | Required       | Revoke current session     |
| POST   | `/api/auth/logout-all`          | Required       | Revoke all sessions        |
| GET    | `/api/auth/me`                  | Required       | Current authenticated user |
| GET    | `/api/auth/sessions`            | Required       | List active sessions       |
| DELETE | `/api/auth/sessions/:sessionId` | Required       | Revoke one session         |
| PATCH  | `/api/auth/change-password`     | Required       | Change password + revoke sessions |
| POST   | `/api/auth/forgot-password`     | Public (Limiter)| Request password reset (anti-enumeration) |
| POST   | `/api/auth/reset-password`      | Public (Limiter)| Reset password + revoke sessions |
| POST   | `/api/auth/verify-email`        | Public         | Verify email address       |
| POST   | `/api/auth/resend-verification` | Required(Limiter)| Resend verification email  |

---

# Phase 21: Comprehensive Backend Hardening & Security Architecture

Social Connect implements enterprise-grade backend security and reliability standards across all layers of the application:

```text
Incoming Request
      │
      ▼
[Helmet Security Headers] ── (nosniff, deny frameguard, HSTS, cross-origin)
      │
      ▼
[Request ID Middleware] ── (X-Request-ID propagation & correlation)
      │
      ▼
[CORS Allowlist] ── (Strict origin check based on CLIENT_URL, credentials: true)
      │
      ▼
[Body Size Limits] ── (100kb JSON & urlencoded limits)
      │
      ▼
[Sliding-Window Rate Limiters] ── (Global, Auth, Search, Messaging, Reports, Uploads)
      │
      ▼
[NoSQL Sanitizer & Zod Validation] ── (Rejects $ operators, strips internal fields, whitelists keys)
      │
      ▼
[File Upload Hardening] ── (Magic bytes check for JPEG/PNG/WebP, 10MB limits, memoryStorage)
      │
      ▼
[Authentication & Authorization] ── (HS256 JWT, IDOR checks, ownership & participant verification)
      │
      ▼
[Database & Atomic Counters] ── (Guarded decrements prevent counters < 0, pool management)
      │
      ▼
[Standardized Response Envelope] ── ({ success: true, message, data } or { success: false, error })
      │
      ▼
[Centralized Error Handler] ── (Sanitizes 500s in prod, maps Zod/Mongoose/JWT/Multer errors)
```

### Security Architecture Details

1. **Request Validation (`zod`)**:
   - Every external endpoint parses parameters, query strings, and body payloads with Zod schemas.
   - Strict whitelisting prevents unintended property assignments.
   - Prohibited internal properties (`_id`, `followersCount`, `isVerified`, `emailVerified`, `createdAt`, `tokenFamily`, etc.) are actively blocked with `FORBIDDEN_INTERNAL_FIELD`.
2. **Sanitization & NoSQL Operator Protection**:
   - Plain text inputs are sanitized by removing non-printable control characters and null bytes (`\0`) while preserving valid characters for native client rendering (avoiding double HTML-entity encoding).
   - Deep inspection rejects incoming payload objects containing keys with `$` or `.`.
3. **HTTP Security Headers (`helmet`)**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY` (clickjacking prevention)
   - `Strict-Transport-Security` (HSTS enabled in production)
   - Cross-origin resource policy tuned for cross-origin media delivery.
4. **CORS Allowlist**:
   - Rejects wildcard `*` with credentials. Origins are strictly checked against `CLIENT_URL` allowlist.
5. **Cookie Security & CSRF Mitigation**:
   - Refresh tokens are stored strictly in `HttpOnly`, `SameSite=Lax` (or `SameSite=None; Secure` in cross-site production) cookies scoped to `Path=/api/auth`.
   - Core API endpoints require custom `Authorization: Bearer <access_token>` headers, which browsers do not automatically send in cross-site requests, immunizing core state changes against CSRF attacks.
6. **Rate Limiting Hardening**:
   - Sliding-window in-memory stores for Global (120/min), Search (30/min), Reports (10/hr), Messaging (60/min), Uploads (20/min), and Auth.
7. **File Upload Hardening**:
   - In-memory buffer inspection of authentic image magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF...WEBP`). Rejects spoofed MIME types/extensions with `INVALID_FILE_SIGNATURE` before any Cloudinary network calls.
8. **Authorization & IDOR Audit**:
   - Every protected route enforces explicit ownership or conversation participant verification. Knowing a target resource ObjectId never grants access.
9. **Atomic Counter Integrity**:
   - Decrement operations on `likesCount`, `commentsCount`, `repliesCount`, `followersCount`, and `followingCount` are guarded by query conditions (`{ counter: { $gt: 0 } }`) or `$max` pipelines ensuring counts never drop below 0.
10. **Structured Logging & Traceability**:
    - `X-Request-ID` is assigned or propagated for every request.
    - Sensitive fields (`password`, `token`, `authorization`, `cookie`, `secret`) are automatically redacted from logs.
11. **Connection Lifecycle & Graceful Shutdown**:
    - Mongoose pool configuration: `minPoolSize=5`, `maxPoolSize=20`, `serverSelectionTimeoutMS=5000`.
    - Handles `SIGINT` and `SIGTERM` by cleanly closing the HTTP server, Socket.IO connections, and Mongoose connection.
12. **Health Probes**:
    - `GET /api/health`: Lightweight liveness probe.
    - `GET /api/health/ready`: Dependency readiness probe checking active MongoDB connectivity (200 Ready, 503 Unready).

---

## Phase 24: Audit Logging & Security Event Tracking

### Overview
Phase 24 establishes an enterprise-grade, immutable audit log subsystem across Social Connect. The design focuses on **Traceability, Accountability, and Security Forensics** without degrading business transaction reliability or leaking sensitive credentials.

### Audit Request Pipeline Architecture

```text
[ Incoming HTTP Client Request ]
             │ (Contains IP, User-Agent, X-Request-ID)
             ▼
[ Request ID Middleware ] ── Generates / propagates UUID correlation ID
             │
             ▼
[ Authentication / Admin Middleware ]
    ├── Normal Route: Sets req.user
    └── Admin Route: Asserts req.user.role === 'ADMIN'
             │ (If rejected: logs ADMIN_ACCESS_DENIED with actor/IP/UA)
             ▼
[ Controller Execution ]
    ├── Extracts context: { requestId, ipAddress, userAgent }
    └── Invokes Service Layer
             │
             ▼
[ Service Business Logic ] ── (Executes transactional write in MongoDB)
             │
             ├──► [ Core DB State Updated ] (User, Post, Comment, Session, Report)
             │
             └──► [ auditService.createAuditLog(...) ]
                         │
                         ├── Validates controlled action & targetType enums
                         ├── Sanitizes metadata (strips passwords, tokens, JWTs, secrets)
                         ├── Attaches actor, target, IP, User-Agent, requestId, createdAt
                         └── Non-blocking write to `AuditLog` collection
                                 │
                                 └── (Failure isolated: never crashes main business flow)
```

### Audit Event Taxonomy

| Category | Action Name | Trigger Description | Target Type |
|---|---|---|---|
| **Authentication** | `USER_REGISTERED` | User registers an account | `USER` |
| | `USER_LOGIN` | User successfully authenticates | `USER` |
| | `USER_LOGIN_FAILED` | Failed authentication attempt (invalid pass/email) | `USER` |
| | `USER_LOGOUT` | User logs out of active session | `USER` |
| | `USER_LOGOUT_ALL` | User revokes all active sessions | `USER` |
| | `PASSWORD_CHANGED` | User updates password from authenticated profile | `USER` |
| | `PASSWORD_RESET` | User completes forgot-password reset flow | `USER` |
| | `EMAIL_VERIFIED` | User successfully verifies email address | `USER` |
| **Sessions & Tokens** | `SESSION_CREATED` | New refresh token session initiated | `SESSION` |
| | `SESSION_REVOKED` | Session explicitly terminated | `SESSION` |
| | `REFRESH_TOKEN_REUSED`| Replay attack detected on rotated refresh token | `SESSION` |
| **Social** | `FOLLOW_CREATED` | User follows another user | `USER` |
| | `FOLLOW_REMOVED` | User unfollows another user | `USER` |
| | `USER_BLOCKED` | User blocks another user | `USER` |
| | `USER_UNBLOCKED` | User unblocks a user | `USER` |
| **Content** | `POST_CREATED` | User authors a new post | `POST` |
| | `POST_UPDATED` | User edits their existing post | `POST` |
| | `POST_DELETED` | User deletes their own post | `POST` |
| | `COMMENT_CREATED` | User creates a comment on a post | `COMMENT` |
| | `COMMENT_UPDATED` | User edits their own comment | `COMMENT` |
| | `COMMENT_DELETED` | User or post author deletes a comment | `COMMENT` |
| **Moderation** | `REPORT_CREATED` | Confidential report submitted by user | `REPORT` |
| | `REPORT_STATUS_CHANGED`| Admin transitions report status | `REPORT` |
| | `POST_MODERATED` | Admin hides, removes, or restores a post | `POST` |
| | `COMMENT_MODERATED` | Admin hides or removes a comment | `COMMENT` |
| | `STORY_MODERATED` | Admin hides or removes a story | `STORY` |
| | `USER_SUSPENDED` | Admin suspends a user account | `USER` |
| | `USER_REACTIVATED` | Admin restores a suspended user account | `USER` |
| **Security** | `ADMIN_ACCESS_DENIED` | Non-admin attempts to access `/api/admin/*` | `USER` |

### Administrative Audit Log Endpoints

All audit log endpoints are strictly protected under `authenticate` and `requireAdmin` (`role === 'ADMIN'`). Standard users receive `403 Forbidden`.

| Method | Endpoint | Description | Query / Path Parameters |
|---|---|---|---|
| `GET` | `/api/admin/audit-logs` | Query and filter audit logs | `actorId`, `action`, `targetType`, `targetId`, `from`, `to`, `page` (default 1), `limit` (default 20, max 100) |
| `GET` | `/api/admin/audit-logs/:auditLogId` | Fetch full detail of a single audit log | `auditLogId` (24-hex ObjectId) |
| `GET` | `/api/admin/audit-logs/users/:userId/summary` | Aggregate user activity metrics | `userId` (24-hex ObjectId) |

### Key Guarantees & Safeguards
1. **Append-Only Immutability**: The system exposes no `PATCH`, `PUT`, or `DELETE` endpoints for `AuditLog`. Logs cannot be modified or deleted via the API.
2. **Credential Sanitization**: The recursive `sanitizeAuditMetadata` function strips passwords, raw tokens, hashes, JWTs, cookies, and authorization headers from `metadata` prior to persistence.
3. **Traceability**: All log records capture `requestId`, client `ipAddress`, and `userAgent` alongside `actor` and `targetId`.
4. **Resilience**: Audit logging runs in safe wrappers; any unexpected failure in logging is safely caught and logged to Winston/logger, never interrupting the underlying business transaction.
5. **Compound Query Indexing**:
   - `{ createdAt: -1, _id: -1 }` (default timeline sorting)
   - `{ actor: 1, createdAt: -1 }` (actor activity queries)
   - `{ action: 1, createdAt: -1 }` (security event tracking)
   - `{ targetType: 1, targetId: 1, createdAt: -1 }` (entity history investigations)

---

## Phase 25: Advanced Feed Architecture & Large-Scale Database Design

### 1. Feed Architecture Comparison

#### Current Architecture: Optimized Fan-Out-on-Read

```text
Current User (JWT)
       │
       ▼
[ Feed Controller & Validation ] ── (Zod: limit 1-50, valid base64url cursor)
       │
       ▼
[ Feed Service ] ──► [ Follow Lookup ] ── (Follow.find({ follower: userId }).select('following'))
       │
       ├──────────► [ Block Lookup ]  ── (Block.find({ blocker / blocked: userId }))
       │
       ▼
[ Early Author Filtering ] ── (Followed IDs minus Blocked IDs + Current User ID)
       │
       ▼
[ Candidate Post Retrieval ] ── (Post.find({ moderationStatus: 'ACTIVE', author: { $in: authorIds } })
       │                         .sort({ createdAt: -1, _id: -1 })
       │                         .limit(limit + 1))
       │                         [Uses: { moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }]
       ▼
[ Bulk Enrichment ] ──► Author User Lookup (populate username, fullName, avatar)
       │
       ├──────────────► Bulk Like Lookup (Like.find({ user: userId, post: { $in: postIds } }))
       │
       └──────────────► Bulk Save Lookup (Save.find({ user: userId, post: { $in: postIds } }))
       │
       ▼
[ Feed API Response ] ── ({ success: true, data: { posts, pagination: { limit, nextCursor } } })
```

#### Future Hybrid Architecture (Design Blueprint)

```text
                             Authenticated User
                                     │
                             Follow Graph Query
                                     │
                  ┌──────────────────┴──────────────────┐
                  ▼                                     ▼
        Normal Followed Users                 Celebrity Followed Users
        (< 100,000 followers)                 (>= 100,000 followers)
                  │                                     │
                  ▼                                     ▼
        [ Fan-Out-on-Write ]                   [ Fan-Out-on-Read ]
       FeedEntry Collection                   Dynamic Post Query
     (pre-materialized feed)              (Post.find({ author: celebId }))
                  │                                     │
                  └──────────────────┬──────────────────┘
                                     ▼
                        [ Merge & Deduplicate ]
                       (Sort by createdAt DESC)
                                     ▼
                        [ Bulk Like / Save State ]
                                     ▼
                                Client Feed
```

### 2. Empirical Benchmark Results

Measured on active MongoDB instance under varying user follow sizes:

| Followed Accounts | Latency (ms) | Engine Time (ms) | Keys Examined | Docs Examined | Query Plan |
|---|---|---|---|---|---|
| **10 follows** | 6.44 ms | 1 ms | 8 | 6 | `IXSCAN` (Index Sort) |
| **100 follows** | 20.41 ms | 5 ms | 13 | 11 | `IXSCAN` (Index Sort) |
| **1,000 follows** | 22.16 ms | 8 ms | 103 | 21 | `IXSCAN` (Index Sort) |

### 3. Fan-Out-on-Write Simulation & Write Amplification

| Follower Count | Write Amplification | Estimated Insert Time | Storage Footprint per Post |
|---|---|---|---|
| **10 followers** | 1 : 10 | ~19.9 ms | 1.3 KB |
| **1,000 followers** | 1 : 1,000 | ~31.2 ms | 125 KB |
| **10,000 followers** | 1 : 10,000 | ~389.4 ms | 1.22 MB |
| **100,000 followers** | 1 : 100,000 | ~3,893.8 ms (~3.9 sec) | 12.21 MB |

### 4. Technical Summary & Final Decisions
- **Current Strategy**: Fan-Out-on-Read with early block/moderation filtering and bulk N+1 prevention for interaction state.
- **Index Support**: Quad compound index `{ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }` on `Post` eliminates all in-memory sorting, delivering sub-25ms response times even when following 1,000+ accounts.
- **Intentionally Deferred**:
  - Redis / in-memory cache layers (current database query times are sub-25ms; premature caching introduces cache invalidation complexity without measurable necessity at current scale).
  - Materialized `FeedEntry` collection (write amplification of 1:N on high-follower accounts introduces severe write latency without justifying read gains).
  - Kafka / distributed queue fan-out workers.
  - Microservices, sharding, and ML ranking algorithms.

---

## Phase 26 — Comprehensive API Documentation + OpenAPI/Swagger

Phase 26 delivers an enterprise-grade, comprehensive API documentation suite for Social Connect without modifying existing business logic or routes.

### 1. Interactive Swagger UI

- **Interactive URL**: `http://localhost:5000/api/docs`
- **Root Alias**: `http://localhost:5000/docs` (redirects to `/api/docs`)
- **Access Policy**:
  - Automatically available in development and test environments (`NODE_ENV !== 'production'`).
  - Available in production only when `ENABLE_API_DOCS=true` is set.
- **Specification**: OpenAPI 3.0.3 standard parsed from `docs/openapi.yaml`.

### 2. Documentation Architecture & Artifacts

| Document | Format | Location | Purpose |
|---|---|---|---|
| **OpenAPI 3.0.3 Specification** | YAML | [`docs/openapi.yaml`](docs/openapi.yaml) | Machine-readable spec covering all 73 operations across 59 paths, components, schemas, responses, parameters, security schemes, and realistic examples. |
| **REST API Reference Manual** | Markdown | [`docs/API.md`](docs/API.md) | Human-readable developer guide with curl snippets, payload schemas, query parameters, offset & cursor pagination guides, and status code tables for all 15 resource sections. |
| **Real-Time Socket.IO Reference** | Markdown | [`docs/SOCKET_API.md`](docs/SOCKET_API.md) | Dedicated real-time protocol reference covering connection/auth handshake, room architecture, client/server events, rate limits, suspension enforcement, and error taxonomy. |
| **Route Coverage Matrix** | Markdown | [`docs/API_COVERAGE.md`](docs/API_COVERAGE.md) | Comprehensive audit matrix mapping every Express endpoint to controller, validation schema, auth requirements, and documentation status (100% verified coverage). |

### 3. API Summary Statistics

- **Total Documented REST Endpoints**: 56 unique route patterns (73 HTTP operations).
- **Total Real-Time Socket.IO Events**: 14 events (7 client-to-server, 7 server-to-client).
- **Documented Resource Domains**: Health, Auth & Sessions, Users & Profiles, Follows, Blocks, Posts, Likes, Saves, Comments & Replies, Feed, Notifications, Stories, Conversations & Messages, Reports, Admin Moderation, Admin Audit Logs.
- **Authentication Schemes Supported**: Dual JWT Bearer Token (`Authorization: Bearer <token>`) and HttpOnly Refresh Cookie (`cookieAuth`).

### 4. Running Automated Documentation Validation

```bash
# Run OpenAPI syntax, $ref resolution, and live Swagger UI HTTP test
node server/test_docs_validation.js
```

---

## Phase 27 — Comprehensive Automated Backend Testing

Phase 27 establishes a comprehensive, automated testing harness built specifically for the Social Connect backend. Built with native ESM test runner **Vitest**, **Supertest**, and **`socket.io-client`**, it exercises all layers of the application—from database schemas and unique indexes to REST controllers, services, security middleware, and real-time WebSockets—against a dedicated, isolated test database with zero external network dependencies.

### 1. Test Architecture & Runner

- **Runner**: Vitest v5 with native ECMAScript Modules (ESM) support.
- **HTTP Integration**: Supertest for full HTTP lifecycle and header assertions.
- **WebSocket Testing**: `socket.io-client` against ephemeral test HTTP/Socket servers.
- **Coverage Engine**: `@vitest/coverage-v8` with statement, branch, function, and line metrics.
- **Environment Isolation**:
  - Automatically loads dedicated configuration from `server/.env.test` when `NODE_ENV=test`.
  - Targets dedicated test database: `mongodb://localhost:27017/social-connect-test`.
  - Sequential file execution (`fileParallelism: false`) prevents cross-file MongoDB collection race conditions.
  - Test lifecycle hooks (`beforeEach` / `afterEach`) automatically wipe all collections (`clearDatabase()`), reset in-memory sliding-window rate limiters, drain the email queue, and reset Cloudinary media mocks.

### 2. Test Suite Breakdown (102 Tests Across 23 Suites)

| Category | Suite File | Tests | Description |
|---|---|---|---|
| **Unit** | `tests/unit/models.test.js` | 9 | Schema validations, duplicate unique key collisions (Follow, Like, Block, Save), password hashing hooks, and helper methods. |
| **Unit** | `tests/unit/jwt.test.js` | 5 | Access/refresh token generation, cryptographic signature verification, expiration enforcement, and tampering detection. |
| **Unit** | `tests/unit/emailService.test.js` | 3 | Deterministic verification/reset email queuing, payload integrity, and mock delivery tracking. |
| **Unit** | `tests/unit/mediaService.test.js` | 4 | MIME type filtering, magic-byte binary header validation, Cloudinary mock adapters, and buffer handling. |
| **Integration (Auth)** | `tests/integration/auth.test.js` | 11 | Registration, login, duplicate email/username 409s, refresh token rotation, replay attack detection, and session management. |
| **Integration (Auth)** | `tests/integration/passwordAndEmail.test.js` | 6 | Password reset flows, hash-token invalidation, change-password with old password verification, and email verification. |
| **Integration (Users)** | `tests/integration/users.test.js` | 7 | Current user profile, profile updates, forbidden internal field protection, user search, and bilateral blocking. |
| **Integration (Social)** | `tests/integration/follows.test.js` | 3 | Follow/unfollow lifecycles, atomic counter increments/decrements, duplicate follow 409, and self-follow rejection. |
| **Integration (Posts)** | `tests/integration/posts.test.js` | 4 | Multipart image upload and post creation, post detail retrieval, owner update permissions, and delete cascade cleanup. |
| **Integration (Social)** | `tests/integration/likesAndSaves.test.js` | 2 | Like/unlike toggle idempotence, non-negative likes counter protection, and save/unsave bookmarks. |
| **Integration (Social)** | `tests/integration/comments.test.js` | 4 | Top-level comment creation, nested replies, update/delete authorization, and comment counter updates. |
| **Integration (Feed)** | `tests/integration/feed.test.js` | 4 | Fan-out-on-read feed aggregation, follower filtering, cursor-based pagination, and personalized like/save states. |
| **Integration (Stories)**| `tests/integration/stories.test.js` | 3 | Ephemeral story creation, 24-hour expiration filtering, and owner deletion authorization. |
| **Integration (Chat)** | `tests/integration/conversations.test.js` | 3 | 1:1 conversation initialization, REST message sending, conversation access control, and read receipts. |
| **Integration (Social)** | `tests/integration/notifications.test.js` | 2 | Real-time social notifications, self-action notification suppression, unread counts, and mark-read batching. |
| **Integration (Admin)** | `tests/integration/reportsAndAdmin.test.js` | 3 | User reports queue, admin moderation (hide/remove), account suspension with session revocation, and audit logging. |
| **Security** | `tests/security/authSecurity.test.js` | 8 | Bearer token format validation, malformed JWT rejection, IDOR mutation blocking, role-escalation defense, and revoked sessions. |
| **Security** | `tests/security/injectionSecurity.test.js` | 3 | Body and query NoSQL operator injection defenses (`$gt`, `$ne`) triggering 400 Bad Request. |
| **Security** | `tests/security/rateLimiting.test.js` | 1 | Sliding-window IP rate limiting triggering HTTP 429 Too Many Requests. |
| **Security** | `tests/security/errorHandling.test.js` | 2 | Unknown route 404 envelope format and production stack trace masking. |
| **Socket.IO** | `tests/sockets/socketAuth.test.js` | 5 | Handshake authentication with `auth.token` and `Authorization` header, rejection of missing/expired/malformed tokens. |
| **Socket.IO** | `tests/sockets/socketMessaging.test.js` | 7 | `conversation:join` (authorized vs IDOR vs blocked), `conversation:leave`, `message:send` with MongoDB persistence, and suspended user disconnect. |
| **Socket.IO** | `tests/sockets/socketPresenceAndTyping.test.js` | 3 | `presence:online` and `presence:offline` lifecycle tracking, and ephemeral in-memory `typing:start`/`typing:stop` delivery without DB writes. |

### 3. Execution Commands

From the repository root or the `server/` directory:

```bash
# Run the entire test suite once
npm test

# Run tests in interactive watch mode for TDD
npm run test:watch

# Run tests and generate code coverage report
npm run test:coverage
```

### 4. Zero External Network Dependencies

The testing harness executes entirely deterministically without third-party network access:
1. **Cloudinary**: Mocked using internal mock handlers (`_setCustomMediaHandlers`) in `mediaService.js`.
2. **Email Provider**: Uses in-memory FIFO inspection queue (`emailService.emailQueue`) without sending SMTP/API requests.
3. **MongoDB**: Connects to local isolated test database (`social-connect-test`), pre-building all 16 model unique indexes during setup.

---

## Phase 28 — Dockerization + Production-Ready Configuration

Phase 28 establishes containerization, environment separation, and deployment readiness for Social Connect as a modular monolithic MERN application with real-time Socket.IO communication.

### 1. Architecture & Container Overview

```text
                     ┌────────────────────────┐
                     │     Social Connect     │
                     │    Client (Vite SPA)   │
                     └───────────┬────────────┘
                                 │ HTTP / WebSocket
                                 ▼
                     ┌────────────────────────┐
                     │    Node.js Backend     │
                     │   (Express + Socket)   │
                     │    Port 5000 / PID 1   │
                     └───────────┬────────────┘
                                 │ Mongoose (27017)
                                 ▼
                     ┌────────────────────────┐
                     │   MongoDB 7.0 Server   │
                     │  Persistent Named Vol  │
                     └────────────────────────┘
```

- **Backend Dockerfile** ([`server/Dockerfile`](server/Dockerfile)):
  - Multi-stage build with `node:20-alpine` reducing production image footprint.
  - Non-root user execution (`USER node`, UID/GID 1000).
  - Production dependency isolation via `npm ci --omit=dev --ignore-scripts`.
  - Native container health check against `GET /api/health`.
  - Exec-form entry point (`CMD ["node", "src/server.js"]`) ensuring Node runs as PID 1 to capture `SIGTERM`/`SIGINT` signals for graceful shutdown.
- **Docker Compose (Local Development)** ([`docker-compose.yml`](docker-compose.yml)):
  - Manages `backend` and `mongo` containers on bridge network `social-connect-net`.
  - Persists database data across restarts using named volume `mongo_data:/data/db`.
  - Service dependency health checking (`condition: service_healthy`).
- **Docker Compose (Production)** ([`docker-compose.prod.yml`](docker-compose.prod.yml)):
  - Database port `27017` is unexposed to the host network (internal communication only).
  - Explicit resource limits (CPUs, memory limits, and reservations).
  - Production container log rotation (`json-file`, max 20MB per file, 5 rotated backups).
  - Zero hardcoded secrets; parameters populated via container environment.

### 2. Environment Strategy & Fail-Fast Validation

- **`development`**: Permissive configuration with local fallbacks and mock email delivery.
- **`test`**: Automatically targets isolated test database (`social-connect-test`) via `server/.env.test`.
- **`production`**: Strict validation in `config.js` immediately halts startup if critical secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI`, `CLIENT_URL`) are missing or use fallback placeholders.

### 3. Quickstart Commands

```bash
# 1. Local Development without Docker
npm run dev

# 2. Local Development with Docker Compose
docker compose up --build

# 3. Production Deployment with Docker Compose
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 4. Stop Containers and Preserve Database Volume
docker compose down

# 5. Full Documentation
# See docs/DEPLOYMENT.md for detailed operations, secrets, and health check guides
```

---

## Phase 29 — CI/CD + GitHub Actions

Phase 29 establishes an automated Continuous Integration pipeline using **GitHub Actions** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) to validate that pull requests and branch commits maintain strict code quality, security, and contract integrity.

### 1. CI Pipeline Architecture

```text
                             Git Push / Pull Request
                                       │
                                       ▼
                             GitHub Actions Runner
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   [ Backend Tests ]           [ Frontend Build ]         [ OpenAPI Docs ]
   • MongoDB 7.0 Service       • Node 20 LTS              • Node 20 LTS
   • npm ci                    • npm ci                   • npm ci
   • npm audit                 • npm audit                • test_docs_validation.js
   • npm run test:coverage     • npm run lint (oxlint)    • 73 REST Operations
   • Coverage Artifact         • npm run build (Vite)     • 187 $ref Pointers
            │                          │                          │
            └──────────────────────────┼──────────────────────────┘
                                       │ (all 3 pass)
                                       ▼
                           [ Docker Image Build ]
                           • Docker Buildx
                           • server/Dockerfile
                           • Multi-stage OCI Image
                                       │
                                       ▼
                                 CI Status: PASS
```

### 2. Jobs Executed on Every PR/Push
- **`backend-test`**: Boots an ephemeral MongoDB 7.0 service container, performs immutable `npm ci`, runs dependency security audits (`npm audit --omit=dev --audit-level=high`), executes all 102 automated tests, and uploads a 14-day coverage artifact.
- **`frontend-build`**: Performs immutable `npm ci`, runs dependency security audits, lints JSX/JS using `oxlint`, and compiles the production Vite bundle.
- **`api-docs-validation`**: Validates OpenAPI 3.0.3 YAML syntax, verifies unique operationIds and descriptions across 73 REST operations, resolves 187 internal schema `$ref` pointers, and tests live Swagger UI mounting.
- **`docker-build`**: Validates that `server/Dockerfile` compiles cleanly via Docker Buildx.

### 3. Local Reproduction Commands
```bash
# Test backend & coverage
cd server && npm run test:coverage

# Validate OpenAPI documentation
cd server && npm run validate:docs

# Lint & build frontend
cd client && npm run lint && npm run build

# See docs/CI.md for complete operations and failure troubleshooting guide
```

---

## Phase 30 — Production Deployment Architecture

Phase 30 establishes the complete operational deployment architecture, database migration protocols, production security verification, and rollback runbooks for the **Social Connect** platform.

### 1. Architectural Topology

```text
                                Internet (Clients / Browsers / Mobile)
                                                   │
                                                   ▼ HTTPS (Port 443) / WSS
                                 [ Reverse Proxy / TLS Termination ]
                                 (Nginx / Caddy / Cloudflare / ALB)
                                                   │
                                ┌──────────────────┴──────────────────┐
                                │                                     │
                        /api/* and /socket.io/*                   /* (Static)
                                │                                     │
                                ▼                                     ▼
                [ Social Connect Node.js Server ]             [ Frontend SPA ]
                • Express REST API (73 endpoints)             (Vite React Build / CDN)
                • Socket.IO WebSocket Server
                • In-memory Presence & Typing
                • HttpOnly SameSite=Strict Cookies
                                │
                                ▼ TLS / VPC Peered
                     [ MongoDB Replica Set ]
                     • 16 Mongoose Collections
                     • Isolated Private Subnet
                     • Quad Compound Feed Index
                     • autoIndex: false (Production)
```

### 2. Operational Documentation Suite

- **[Deployment Architecture Guide](docs/DEPLOYMENT_ARCHITECTURE.md)**: Full production topology, container separation rationale, persistent MongoDB requirements, reverse proxy TLS/HSTS setup, CORS/cookie configuration, Socket.IO WebSocket upgrade and horizontal scaling roadmaps, deployment strategies, multi-stage health probes, and graceful shutdown.
- **[Docker Deployment Guide](docs/DEPLOYMENT.md)**: Container build configurations, multi-stage Dockerfiles, Docker Compose local and production setups, and environment variable references.
- **[Database Migrations & Indexing](docs/DATABASE_MIGRATIONS.md)**: Additive schema evolution, 3-phase field deprecation, production index inventory across all 16 models, rolling index creation on replica sets, and idempotent migration script patterns.
- **[Production Security Checklist](docs/PRODUCTION_SECURITY_CHECKLIST.md)**: Pre-flight security audit covering network isolation, secret management, database RBAC, strict CORS allowlists, secure cookies, rate limiting, request-size limits, upload validation, error masking, and audit logging.
- **[Rollback Runbook & Smoke-Test Verification](docs/ROLLBACK.md)**: Incident decision matrix, container image rollbacks using immutable tags, database rollback constraints, PITR procedures, and post-release verification checklist.

---

## Phase 31 — Production Monitoring + Structured Logging + Error Tracking

Phase 31 implements production observability, structured machine-readable logging, request correlation, centralized error classification, and real-time Socket.IO metrics for **Social Connect**.

### 1. Observability Architecture

```text
                                Social Connect Application
                                             │
      ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
      ▼                  ▼                   ▼                   ▼                  ▼
[Health Probes]    [JSON Logger]      [Error Tracker]       [Metrics]         [Audit Logs]
/api/health        stdout/stderr      Sentry / DSN          In-Memory         MongoDB
/api/health/ready  Request ID trace   Sanitized context     Latency p95       Security &
/api/health/metrics Secret redaction   Credential scrubbing Sockets & HTTP    Admin Actions
```

### 2. Operational Documentation & Standards

- **[Observability & Monitoring Guide](docs/OBSERVABILITY.md)**: Comprehensive guide covering structured JSON log formats, automated secret scrubbing (`maskSecrets`), URL query parameter sanitization (`sanitizeUrl`), multi-stage health probes, request correlation via `X-Request-ID`, error classification, Socket.IO disconnect reason taxonomy, in-memory performance metrics (`/api/health/metrics`), alerting rules, and incident troubleshooting playbooks.

---

## Phase 32 — MongoDB Backup + Disaster Recovery + Recovery Testing

Phase 32 establishes the database backup lifecycle, disaster recovery playbooks, automated verification tooling, and restore runbooks for **Social Connect**.

### 1. Disaster Recovery Topology

```text
                                [ Production Incident ]
                                           │
       ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
       ▼                   ▼                               ▼                   ▼
[ Source Code ]    [ Container Image ]             [ MongoDB Database ]  [ External Media ]
• GitHub Repo      • Versioned Digest / SHA        • Archive Backup      • Cloudinary Storage
• Tagged Releases  • Container Registry            • SHA-256 Checksum    • Asset Versioning
```

### 2. Operational Documentation Suite

- **[Database Backup Strategy](docs/DATABASE_BACKUP.md)**: Complete 16-collection inventory, data criticality tiers, RPO (24h/1h) and RTO (<30m) targets, automated scheduling, GZIP archive compression, SHA-256 checksums, retention policies, process locking (`flock`), and freshness monitoring.
- **[Disaster Recovery Architecture](docs/DISASTER_RECOVERY.md)**: Incident response playbooks for database corruption, accidental deletion, host crashes, and deployment failures; Cloudinary media recovery & orphan detection; application image and secret recovery protocols.
- **[Database Restore Runbook](docs/DATABASE_RESTORE_RUNBOOK.md)**: 14-step operational runbook separating routine test database restoration from emergency production cutovers with confirmation guardrails.

---

## Phase 35 — Frontend Integration + End-to-End Integration + Final Project Polish

Phase 35 establishes the complete end-to-end integration between the React 19 + Vite frontend and the hardened Express + MongoDB backend, verifying the full application lifecycle.

### 1. Architectural Highlights

- **Frontend Service Layer (`client/src/services/`)**: Centralized `api.js` HTTP client with 401 retry queue and token rotation, along with dedicated service modules covering Authentication, Users, Posts, Comments, Saves, Stories, Direct Messages, Notifications, Abuse Reports, and Admin Moderation.
- **Zero-Vulnerability Rendering**: Zero use of `dangerouslySetInnerHTML`. All user-generated text is rendered exclusively via native React string escaping.
- **Pure CSS Modern Design System (`client/src/index.css`)**: High-performance vanilla CSS dark theme with responsive grid layouts, glassmorphism headers, interactive micro-animations, and zero CSS runtime overhead.
- **Real-Time WebSockets (`client/src/socket/`)**: Resilient `SocketManager` singleton managing automatic authenticated handshakes, online/offline presence tracking, live typing indicators, and room synchronization.
- **End-to-End Verification (`scripts/verify-e2e.js`)**: 37 automated checks verifying health probes, dual-token JWT sessions, social follow graphs, post creation, engagements (likes, comments, saves), notifications, real-time messaging, safety blocking, and admin report moderation.

### 2. Running Quality Gates

```bash
# 1. Build client production bundle
cd client && npm run build

# 2. Run backend test suite (27 test files, 182 tests)
cd server && npm test

# 3. Validate OpenAPI documentation & Swagger UI (73 operations, 187 refs)
cd server && npm run validate:docs

# 4. Execute End-to-End Integration Test Suite (37 scenarios)
node scripts/verify-e2e.js
```

### 3. Key Phase 35 Documentation

- **[Frontend API Integration Guide](docs/FRONTEND_API_INTEGRATION.md)**: Complete request/response mapping table for every UI component, REST endpoint, and Socket.IO event.
- **[Final Project Architecture](docs/FINAL_PROJECT_ARCHITECTURE.md)**: High-level system topology, data flow, isolation boundaries, and query optimizations.
- **[Feature Matrix](docs/FEATURE_MATRIX.md)**: Detailed feature-by-feature matrix mapping UI components to backend endpoints and real-time events.
- **[Known Limitations](docs/KNOWN_LIMITATIONS.md)**: Architectural edge cases, single-node socket constraints, and future scalability roadmap.
- **[Release Checklist](docs/RELEASE_CHECKLIST.md)**: Pre-flight operational and security verification gates for production deployment.








