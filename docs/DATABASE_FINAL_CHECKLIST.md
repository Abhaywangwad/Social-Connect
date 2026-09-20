# Final Database Architecture Checklist

## Audit Scope
Deep architectural verification of all 16 MongoDB Mongoose models, schemas, database indexes, uniqueness constraints, denormalized counters, transactions, cascading deletions, and query execution plans in Social Connect.

---

## 1. Database Model & Schema Verification

| # | Model Name | Collection | Key Fields Reviewed | Unique Constraints | TTL Index | Cascade Behaviors | Reviewed? |
| :-: | :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| 1 | **User** | `users` | `username`, `email`, `password` (`select:false`), `followersCount`, `followingCount`, `accountStatus` | `username: 1`, `email: 1` | No | Sessions revoked on suspension; follow cleanup on block | [x] |
| 2 | **Follow** | `follows` | `follower`, `following` | `{ follower: 1, following: 1 }` | No | Decrements `User` counters on removal | [x] |
| 3 | **Post** | `posts` | `author`, `caption`, `media` (max 10), `location`, `likesCount`, `commentsCount`, `moderationStatus` | None | No | Cascade deletes `Comment`, `Like`, `Save`, `Notification`, and Cloudinary media | [x] |
| 4 | **Comment** | `comments` | `author`, `post`, `content`, `parentComment`, `repliesCount`, `moderationStatus` | None | No | Deleting top-level comment cascade-deletes direct replies and decrements `Post.commentsCount` | [x] |
| 5 | **Like** | `likes` | `user`, `post` | `{ user: 1, post: 1 }` | No | Decrements `Post.likesCount` on removal | [x] |
| 6 | **Save** | `saves` | `user`, `post` | `{ user: 1, post: 1 }` | No | Removed when parent post is deleted | [x] |
| 7 | **Block** | `blocks` | `blocker`, `blocked` | `{ blocker: 1, blocked: 1 }` | No | Removes bilateral `Follow` relationships and updates counters atomically | [x] |
| 8 | **Conversation** | `conversations` | `participants` (len 2), `conversationKey`, `lastMessage`, `lastMessageAt`, `participantStates` | `conversationKey: 1` | No | Retained for participants; unread state dynamic | [x] |
| 9 | **Message** | `messages` | `conversation`, `sender`, `content`, `clientMessageId` | `{ sender: 1, clientMessageId: 1 }` (partial) | No | Scoped to conversation; pagination via cursor | [x] |
| 10 | **Story** | `stories` | `author`, `media`, `caption`, `expiresAt`, `moderationStatus` | None | `{ expiresAt: 1 }` | Asynchronously swept by TTL monitor; immediate Cloudinary cleanup on manual delete | [x] |
| 11 | **Notification** | `notifications` | `recipient`, `actor`, `type`, `post`, `comment`, `follow`, `isRead` | None | No | Cascade-deleted when associated Post or Comment is removed | [x] |
| 12 | **Session** | `sessions` | `user`, `refreshTokenHash`, `previousTokenHashes`, `tokenFamily`, `expiresAt`, `revokedAt` | None | `{ expiresAt: 1 }` | Auto-purged upon expiration; revoked on password reset or suspension | [x] |
| 13 | **Report** | `reports` | `reporter`, `targetType`, `targetId`, `reason`, `status`, `moderationNote`, `resolvedBy` | `{ reporter: 1, targetType: 1, targetId: 1 }` (status: OPEN) | No | Retained permanently for moderation audit history | [x] |
| 14 | **AuditLog** | `auditlogs` | `actor`, `action`, `targetType`, `targetId`, `metadata`, `ipAddress`, `requestId`, `createdAt` | None | No | Append-only immutable security ledger | [x] |
| 15 | **PasswordResetToken** | `passwordresettokens` | `user`, `tokenHash`, `expiresAt`, `usedAt` | `tokenHash: 1` | `{ expiresAt: 1 }` | Single-use token; auto-purged via TTL | [x] |
| 16 | **EmailVerificationToken** | `emailverificationtokens` | `user`, `tokenHash`, `expiresAt`, `usedAt` | `tokenHash: 1` | `{ expiresAt: 1 }` | Single-use token; auto-purged via TTL | [x] |

---

## 2. Core Checklist Verification

* [x] **Every model reviewed**: All 16 schemas reviewed for field types, validators, defaults, and JSON serialization masks.
* [x] **Required fields reviewed**: Mandatory entity references (`author`, `user`, `recipient`, `conversation`) enforce database-level non-null requirements.
* [x] **Unique constraints reviewed**:
  - Logical 1-to-1 relationships (`Follow`, `Like`, `Save`, `Block`) use compound unique indexes.
  - 1-to-1 conversation pairs use deterministic `conversationKey` compound index.
  - Client message retry idempotency uses `{ sender: 1, clientMessageId: 1 }` partial index.
  - Active report anti-spam uses `{ reporter: 1, targetType: 1, targetId: 1 }` partial index (`status: OPEN`).
* [x] **Indexes reviewed**:
  - Feed queries covered by `{ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }`.
  - Message history covered by `{ conversation: 1, createdAt: -1, _id: -1 }`.
  - Notifications covered by `{ recipient: 1, createdAt: -1 }` and `{ recipient: 1, isRead: 1 }`.
* [x] **Redundant indexes investigated & removed**:
  - Verified and eliminated 5 redundant single-field indexes (`Story.author`, `Report.reporter`, `AuditLog.actor`, `AuditLog.action`, `AuditLog.targetType`) that duplicated prefixes of compound indexes.
* [x] **Counters reviewed**:
  - `followersCount`, `followingCount`, `likesCount`, `commentsCount`, `repliesCount` update atomically via `$inc` operations with safety guards (`{ count: { $gt: 0 } }`).
  - Source collections remain authoritative source of truth.
  - `scripts/reconcile-counters.js` provided for scheduled auditing and repair.
* [x] **Transactions reviewed**:
  - Multi-document transactions used in `blockService.blockUser` when connected to replica set (`ReplicaSetWithPrimary` or `Sharded`).
  - Graceful fallback for standalone test/dev environments without crashing.
* [x] **Race conditions reviewed & resolved**:
  - `toggleLikePost` catches MongoDB error `11000` to prevent unhandled 500 exceptions under concurrent like toggles.
  - `savePost` catches `11000` and returns clean 409 Conflict.
  - `createOrGetConversation` catches `11000` and recovers the existing conversation atomically.
* [x] **Cascade behavior reviewed**:
  - Post deletion cleans up `Comment`, `Like`, `Save`, and `Notification` collections, and purges Cloudinary media assets.
  - Comment deletion cascade-purges direct replies and updates `Post.commentsCount`.
* [x] **Pagination queries reviewed**:
  - Critical paths (Feed, Messages, Stories) use deterministic compound cursor pagination (`createdAt: -1, _id: -1`).
  - Non-critical paths use bounded offset pagination with maximum page sizes ($Limit \le 50$).
* [x] **Feed query reviewed**:
  - Fan-out-on-read with early relationship filtering (followed minus blocked).
  - Covered index scan ensures 0 in-memory sorting.
  - Interaction states bulk-resolved via 2 batched `$in` queries (no N+1).
* [x] **Message query reviewed**:
  - Backward cursor pagination for chat history.
  - Batch unread count aggregation across all conversations prevents N+1 queries.
* [x] **Notification query reviewed**:
  - Recipient-indexed retrieval with actor population.
  - Bulk read receipts via `updateMany`.
* [x] **Audit-log growth reviewed**:
  - Controlled action enums prevent unvalidated log spam.
  - Metadata sanitized against passwords, tokens, and credentials.
* [x] **Backup compatibility reviewed**:
  - Compatible with `mongodump` / `mongorestore` shell tools validated in `scripts/backup-mongodb.sh`.
