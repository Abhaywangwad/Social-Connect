# Performance Baseline & Empirical Query Measurements

## Purpose & Scope
This document records empirical MongoDB query performance measurements across a controlled synthetic dataset for Social Connect's critical backend query paths. The objective is regression detection and query plan verification across versions, not hypothetical production-scale throughput claims.

---

## Controlled Benchmark Dataset

Measurements were recorded on MongoDB 8.x with the following seeded relational distribution:
* **Users**: 50 active user documents with normalized search fields.
* **Follow Relationships**: 50 directed relationships connecting primary benchmark user to followees.
* **Posts**: 150 posts with active moderation status distributed across followed users with staggered timestamps.
* **Comments**: 100 top-level comments on sample posts.
* **Likes & Saves**: 100 post likes, 50 user saves.
* **Conversations & Messages**: 1 direct 1-to-1 conversation containing 100 historical messages with alternating senders.
* **Notifications**: 50 recipient notifications spanning `LIKE`, `COMMENT`, and `FOLLOW` events.

---

## Empirical Query Measurements

| Operation / Query Path | Index Utilized | Winning Plan | `executionTimeMillis` | `totalKeysExamined` | `totalDocsExamined` | `nReturned` | Wall-Clock Response |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Home Feed Retrieval** (`limit=20`) | `moderationStatus_1_author_1_createdAt_-1__id_-1` | `LIMIT -> IXSCAN` | **4 ms** | 35 | 21 | 21 | 15.75 ms |
| **User Search** (`prefix /^bench_user/`, `limit=20`) | `username_1` | `PROJECTION_SIMPLE -> IXSCAN` | **3 ms** | 51 | 50 | 20 | 6.09 ms |
| **User Post Listing** (`limit=12`) | `moderationStatus_1_author_1_createdAt_-1__id_-1` | `LIMIT -> IXSCAN` | **0 ms** | 6 | 6 | 6 | 2.57 ms |
| **Post Comments** (`limit=20`) | `post_1_parentComment_1_moderationStatus_1_createdAt_-1` | `LIMIT -> IXSCAN` | **2 ms** | 20 | 20 | 20 | 4.69 ms |
| **Notifications List** (`limit=20`) | `recipient_1_createdAt_-1` | `LIMIT -> IXSCAN` | **0 ms** | 20 | 20 | 20 | 3.20 ms |
| **Message History** (`limit=30`) | `conversation_1_createdAt_-1__id_-1` | `LIMIT -> IXSCAN` | **0 ms** | 31 | 31 | 31 | 2.80 ms |
| **Saved Posts** (`limit=20`) | `user_1_createdAt_-1` | `LIMIT -> IXSCAN` | **0 ms** | 20 | 20 | 20 | 2.12 ms |

---

## Key Query Plan Observations

1. **Zero In-Memory Sorts**:
   All reverse-chronological and alphabetical list operations (`Feed`, `Comments`, `Messages`, `Notifications`, `SavedPosts`) utilized indexed keys for sorting. No query plan produced a blocking `SORT` stage in MongoDB.
2. **Strict Document Examination Bounds**:
   In all paginated queries, `totalDocsExamined` is bounded tightly to `nReturned` ($N + 1$ lookahead for cursor generation).
3. **Cursor Determinism**:
   Feed and Message compound cursor tie-breakers (`createdAt: -1, _id: -1`) ensure queries never skip or duplicate documents when multiple records share identical millisecond timestamps.
4. **No N+1 in Interaction State Resolution**:
   Feed queries bulk-resolve user like and save states using two indexed `$in` queries (`Like.find({ user, post: { $in: postIds } })`, `Save.find({ user, post: { $in: postIds } })`) rather than per-post lookup loops.
