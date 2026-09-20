# Database Backup & Recovery Strategy

This document defines the data inventory, recovery objectives (RPO/RTO), automated backup architecture, retention policies, and monitoring standards for **Social Connect**.

---

## 1. Complete MongoDB Collection Inventory

Social Connect maintains 16 core Mongoose models. Every collection is categorized below by purpose, criticality, relationship dependencies, and production indexes:

| # | Collection Name | Model | Purpose | Criticality | Logical Relationships | Core Production Indexes |
|---|---|---|---|---|---|---|
| 1 | `users` | `User` | User identities, auth credentials, bios, follower/following/post counter aggregates | **CRITICAL** | Root entity referenced by all content and social features | Unique `{ email: 1 }`, Unique `{ username: 1 }`, `{ role: 1 }`, `{ isBanned: 1 }` |
| 2 | `sessions` | `Session` | Refresh-token session persistence & revocation tracking | **CRITICAL** | `user` → `User` | TTL `{ expiresAt: 1 }`, Compound `{ user: 1, tokenHash: 1 }` |
| 3 | `posts` | `Post` | User posts, captions, media links, like/comment counts, moderation status | **CRITICAL** | `author` → `User`, references Cloudinary media | Quad Feed Index `{ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }`, `{ author: 1, createdAt: -1 }`, `{ createdAt: -1 }` |
| 4 | `comments` | `Comment` | Post comments and nested replies | **CRITICAL** | `post` → `Post`, `author` → `User`, `parentComment` → `Comment` | `{ post: 1, createdAt: 1 }`, `{ parentComment: 1 }` |
| 5 | `follows` | `Follow` | Follower-following social graph relationships | **CRITICAL** | `follower` → `User`, `following` → `User` | Unique Compound `{ follower: 1, following: 1 }`, `{ following: 1 }` |
| 6 | `likes` | `Like` | Post likes / reactions | **CRITICAL** | `user` → `User`, `post` → `Post` | Unique Compound `{ user: 1, post: 1 }`, `{ post: 1 }` |
| 7 | `saves` | `Save` | User bookmarked posts | **CRITICAL** | `user` → `User`, `post` → `Post` | Unique Compound `{ user: 1, post: 1 }`, `{ user: 1, createdAt: -1 }` |
| 8 | `stories` | `Story` | 24-hour ephemeral visual stories | **CRITICAL** | `user` → `User`, references Cloudinary media | TTL `{ expiresAt: 1 }`, `{ user: 1, createdAt: -1 }` |
| 9 | `conversations` | `Conversation` | 1-on-1 direct messaging threads | **CRITICAL** | `participants` → `[User]` | `{ participants: 1 }` |
| 10 | `messages` | `Message` | Direct chat message history and read receipts | **CRITICAL** | `conversation` → `Conversation`, `sender` → `User` | `{ conversation: 1, createdAt: -1 }` |
| 11 | `notifications` | `Notification` | In-app user notifications (likes, follows, comments, messages) | **CRITICAL** | `recipient` → `User`, `sender` → `User`, `post` → `Post` | `{ recipient: 1, isRead: 1, createdAt: -1 }` |
| 12 | `blocks` | `Block` | User blocking relationships for feed & message exclusion | **CRITICAL** | `blocker` → `User`, `blocked` → `User` | Unique Compound `{ blocker: 1, blocked: 1 }` |
| 13 | `reports` | `Report` | Content/user moderation reports submitted by users | **CRITICAL** | `reporter` → `User`, `resolvedBy` → `User` | `{ status: 1, createdAt: -1 }` |
| 14 | `auditlogs` | `AuditLog` | Permanent audit log of administrative and security events | **CRITICAL** | `actorId` → `User`, `targetId` → polymorphic | `{ timestamp: -1 }`, `{ targetType: 1, targetId: 1 }` |
| 15 | `passwordresettokens` | `PasswordResetToken` | Time-limited cryptographic password recovery tokens | **CRITICAL** | `user` → `User` | TTL `{ expiresAt: 1 }` |
| 16 | `emailverificationtokens`| `EmailVerificationToken`| Time-limited account activation verification tokens | **CRITICAL** | `user` → `User` | TTL `{ expiresAt: 1 }` |

---

## 2. Data Classification

Data within Social Connect is divided into three tiers:

### 2.1 Critical Data (Must be backed up and restored exactly)
* **Entities**: `User`, `Session`, `Post`, `Comment`, `Follow`, `Like`, `Save`, `Story`, `Conversation`, `Message`, `Notification`, `Block`, `Report`, `AuditLog`.
* **Impact of Loss**: Loss results in permanent corruption of the social graph, lost user messages, inability to authenticate, or violation of security compliance and moderation traceability.

### 2.2 Reconstructable Data (Can be rebuilt from primary records)
* **Entities**: Cached counter aggregations (e.g. `followersCount`, `followingCount`, `postsCount`, `likesCount`), search indexes, cursor feed states.
* **Recovery Mechanism**: If counters drift or are corrupted during an emergency restore, a background aggregation script queries the primary collection (e.g. `Follow.countDocuments({ following: userId })`) and updates the user document.

### 2.3 Temporary / Ephemeral Data (Do NOT backup)
* **Entities**: In-memory Socket.IO connection rooms, active user presence states (`presenceManager`), typing indicators (`typingManager`), in-memory rate-limiter sliding windows.
* **Recovery Mechanism**: Recreated naturally as users reconnect and send messages after a restart or restore.

---

## 3. Recovery Objectives (RPO & RTO)

| Metric | Definition | Social Connect Operational Target |
|---|---|---|
| **Recovery Point Objective (RPO)** | Maximum acceptable data loss period prior to an incident. | **24 Hours** for automated daily logical backups.<br>**1 Hour** when replica set continuous oplog snapshots (PITR) are enabled. |
| **Recovery Time Objective (RTO)** | Maximum acceptable duration to restore database service. | **< 30 Minutes** for standard database recovery.<br>**< 10 Minutes** when restoring to an isolated staging environment for validation. |

*Note: These targets represent realistic operational student-project goals under normal single-instance infrastructure conditions.*

---

## 4. Backup Strategy Architecture

```text
       Production MongoDB Replica Set
                     │
                     ▼ 02:00 UTC Scheduled Job (cron / orchestrator)
          [ Process Lock: flock ] (Prevents overlapping backup jobs)
                     │
                     ▼ mongodump --archive --gzip
          [ Compressed Archive File ] (e.g. backup_20260920_020000.archive.gz)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  [ SHA-256 Checksum ]    [ Metadata JSON ] (backupId, size, timestamp, collections)
         │                       │
         └───────────┬───────────┘
                     │
                     ▼ Staged locally (/backups/)
        [ Retention Policy Enforced ] (Prunes archives older than 7 days)
                     │
                     ▼ Off-site Object Storage (AWS S3 / GCS / Cloudflare R2)
        [ Encrypted at Rest (AES-256) ]
```

### 4.1 Key Architectural Principles
1. **Automation**: Backups run unattended via scheduled jobs without human intervention.
2. **Immutability & Integrity**: Every backup generates a companion `.sha256` checksum file. Any modification or truncation immediately triggers validation failure.
3. **Off-Host Redundancy**: Backups staged on the application host are automatically replicated to isolated off-site object storage (AWS S3, GCP Cloud Storage, or Backblaze B2).
4. **Least Privilege**: The backup service user has strictly read-only (`readAnyDatabase` or `read` on `social-connect`) privileges.

---

## 5. Backup Tooling Reference

Social Connect provides two interchangeable, hardened backup interfaces:

### 5.1 Production Shell Tooling (`scripts/backup-mongodb.sh`)
* Native POSIX script utilizing MongoDB Database Tools (`mongodump`).
* Produces compact, streaming `.archive.gz` files.
* Executes process locking using `flock` on `/tmp/social_connect_mongodb_backup.lock`.
* Usage:
  ```bash
  export MONGODB_URI="mongodb://user:pass@localhost:27017/social-connect?authSource=admin"
  export BACKUP_DIR="./backups"
  export BACKUP_RETENTION_DAYS=7
  ./scripts/backup-mongodb.sh
  ```

### 5.2 Cross-Platform Node.js Tooling (`server/scripts/backup.js`)
* Built directly into the repository using native Mongoose and MongoDB driver streams.
* Runs uniformly across Windows, macOS, Linux, and CI environments without requiring external binary packages.
* Usage:
  ```bash
  cd server
  node scripts/backup.js
  ```

---

## 6. Retention Policy

Backups consume disk and storage resources. The default retention lifecycle is configured via `BACKUP_RETENTION_DAYS`:

| Tier | Frequency | Retention Window | Storage Location |
|---|---|---|---|
| **Daily Backups** | Daily at 02:00 UTC | **7 Days** | Local staging host + Object Storage |
| **Weekly Snapshots** | Sundays at 03:00 UTC | **4 Weeks (30 Days)** | Off-site Object Storage (Glacier / Coldline) |
| **Monthly Archives** | 1st of each month | **12 Months** | Encrypted cold storage vault |

The automated backup script automatically identifies and prunes local files matching `*.archive.gz`, `*.sha256`, and `*.meta.json` older than `BACKUP_RETENTION_DAYS`.

---

## 7. Scheduling & Overlap Prevention

### 7.1 Cron Scheduling
In production Linux environments, the backup job is scheduled via `crontab`:

```bash
# Run Social Connect database backup daily at 02:00 UTC
0 2 * * * /app/scripts/backup-mongodb.sh >> /var/log/mongodb_backup.log 2>&1
```

### 7.2 Overlap Prevention (`flock`)
To guarantee that a slow backup (e.g. during heavy database load) does not collide with a subsequent scheduled execution:
* The script acquires a non-blocking lock (`flock -n 200`).
* If another backup process holds the descriptor, the new invocation logs `[WARN] A backup job is already in progress. Exiting.` and terminates safely with code 0 without corrupting the active archive.

---

## 8. Backup Freshness Monitoring & Alerting

Observability monitors must track backup freshness to answer:
> *When was the last successful backup?*

1. **Metadata Inspection**: Every successful backup generates a `<archive>.meta.json` file containing:
   ```json
   {
     "backupId": "social_connect_backup_20260920_020000",
     "timestamp": "2026-09-20T02:00:00Z",
     "sizeBytes": 1420512,
     "durationSeconds": 4,
     "sha256": "3a8f...",
     "status": "COMPLETED"
   }
   ```
2. **Freshness Alert Rule**: If the timestamp of the latest backup metadata file exceeds **26 hours** (24h schedule + 2h grace period), an alert is dispatched:
   - **Severity**: `WARNING`
   - **Alert**: `MongoDBBackupStale`
   - **Message**: "Last successful MongoDB backup was over 26 hours ago."
