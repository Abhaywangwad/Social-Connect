# Database Restore Operational Runbook

This document provides step-by-step instructions for executing database restorations.

> [!CAUTION]
> **CRITICAL RULE**: A normal restore test must **NEVER** target the production database.
> Routine restore verifications must strictly target an isolated test database (e.g. `social_connect_restore_test`).

---

## Part 1: Routine Test Restore (Isolated Environment)

Run this procedure weekly or in CI to prove that backup archives are valid and restorable:

```bash
# 1. Verify archive integrity and SHA-256 checksum
node server/scripts/verify_backup.js backups/social_connect_backup_latest.archive.gz

# 2. Restore into isolated test database (social-connect-restore-test)
node server/scripts/restore.js backups/social_connect_backup_latest.archive.gz --targetDb=social-connect-restore-test

# 3. Verify collections and indexes on the test database
node server/scripts/verify_backup.js backups/social_connect_backup_latest.archive.gz
```

---

## Part 2: Production Emergency Restore Runbook (14 Steps)

Follow these 14 sequential steps when recovering from a verified production data loss incident.

### Step 1: Detect Incident & Classify Severity
* Declare an incident. Document the trigger (e.g. storage corruption, accidental drop, malicious deletion).
* Classify severity: If production service is degraded or offline, mark as **SEV-1 (CRITICAL)**.

### Step 2: Identify Required Recovery Point
* Determine the exact timestamp immediately preceding the corruption.
* Select the latest uncorrupted backup archive from the `/backups/` directory or off-site object storage.

### Step 3: Freeze In-Flight Writes
* Put the application into maintenance mode or stop the backend container to prevent partial updates from colliding with the restore:
  ```bash
  docker compose -f docker-compose.prod.yml stop server
  ```

### Step 4: Prepare Isolated Staging Environment
* Ensure an isolated database exists on the MongoDB instance (e.g. `social_connect_recovery_staging`).

### Step 5: Validate Backup Artifact & SHA-256 Checksum
* Run checksum verification prior to any restore operations:
  ```bash
  ./scripts/verify-backup.sh /backups/social_connect_backup_20260920_020000.archive.gz
  ```
* **Abort immediately if the checksum does not match.**

### Step 6: Restore Backup into Staging Database First
* Always restore into staging first to inspect contents before touching production:
  ```bash
  export TARGET_DB="social_connect_recovery_staging"
  ./scripts/restore-mongodb.sh /backups/social_connect_backup_20260920_020000.archive.gz --confirm
  ```

### Step 7: Validate Collection Inventory & Document Counts
* Verify that all 16 collections exist in staging and contain non-zero documents:
  ```bash
  node -e "
    import('mongoose').then(async (m) => {
      const conn = await m.default.createConnection('mongodb://localhost:27017/social_connect_recovery_staging').asPromise();
      const colls = await conn.db.listCollections().toArray();
      console.log('Restored Collections:', colls.map(c => c.name));
      await conn.close();
    });
  "
  ```

### Step 8: Validate Restored Indexes
* Confirm that unique and compound indexes were preserved during restore:
  - `users`: `{ email: 1 }`, `{ username: 1 }`
  - `follows`: `{ follower: 1, following: 1 }`
  - `posts`: `{ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }`
  - `likes`: `{ user: 1, post: 1 }`

### Step 9: Validate Relational Consistency
* Execute verification queries confirming foreign key integrity:
  - Every `Post.author` exists in `users`.
  - Every `Comment.post` exists in `posts` and `Comment.author` exists in `users`.
  - Every `Like.post` exists in `posts`.
  - Every `Message.conversation` exists in `conversations`.

### Step 10: Validate Application Compatibility
* Confirm that the restored database schema matches the active application version (`v1.0.0`).
* Refer to [`docs/DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md) if migration scripts must be executed.

### Step 11: Execute Production Cutover
* Once staging validation is 100% verified, execute the cutover to production:
  ```bash
  # Execute production restore with explicit confirmation
  export MONGODB_URI="mongodb://localhost:27017/social-connect"
  ./scripts/restore-mongodb.sh /backups/social_connect_backup_20260920_020000.archive.gz --confirm
  ```

### Step 12: Re-Enable Application & Health Probes
* Restart the application server:
  ```bash
  docker compose -f docker-compose.prod.yml up -d server
  ```
* Poll readiness probe until healthy:
  ```bash
  curl -i http://localhost:5000/api/health/ready
  ```

### Step 13: Execute Post-Restore Smoke Tests
* Run the smoke test suite outlined in [ROLLBACK.md](ROLLBACK.md):
  - [ ] User login and token issuance (`POST /api/auth/login`)
  - [ ] Feed generation (`GET /api/feed`)
  - [ ] Post creation (`POST /api/posts`)
  - [ ] Socket.IO handshake (`wss://.../socket.io/`)
  - [ ] Unread notification counters (`GET /api/notifications/unread-count`)

### Step 14: Incident Post-Mortem & Documentation
* Drop the temporary staging database (`social_connect_recovery_staging`).
* Document the incident root cause, downtime duration, data loss delta (RPO), and recovery duration (RTO).
