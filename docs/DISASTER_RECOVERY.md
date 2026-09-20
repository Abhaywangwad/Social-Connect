# Disaster Recovery Architecture & Playbooks

This document outlines the disaster recovery (DR) protocols, component recovery paths, and incident response playbooks for **Social Connect**.

---

## 1. Disaster Recovery Architecture

Recovering from a catastrophic incident requires coordinating across five distinct application tiers:

```text
                                 [ Production Incident ]
                                            │
        ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
        ▼                   ▼                               ▼                   ▼
[ Source Code ]    [ Container Image ]             [ MongoDB Database ]  [ External Media ]
• GitHub Repo      • Versioned Digest / SHA        • Archive Backup      • Cloudinary Storage
• Git Tag (v1.0.0) • GitHub Container Registry     • SHA-256 Checksum    • Asset Versioning
        │                   │                               │                   │
        └───────────────────┼───────────────────────────────┴───────────────────┘
                            │
                            ▼
              [ Environment & Secrets ]
              • Cloud Secret Manager / KMS
              • Non-committed Environment
```

| Component | Source of Truth | Disaster Recovery Path |
|---|---|---|
| **Application Source** | GitHub Repository (`main` branch) | `git clone` & checkout tagged release commit |
| **Container Image** | Container Registry (GHCR / ECR) | Pull immutable release tag (e.g. `ghcr.io/org/server:v1.0.0`) |
| **Database Data** | MongoDB Backups (`/backups/`) | Restore verified `.archive.gz` archive |
| **Media Assets** | Cloudinary CDN & Storage | Cloudinary native auto-backup / asset versioning |
| **Secrets & Config** | Cloud Secret Manager / KMS | Re-inject runtime environment variables |

---

## 2. Disaster Scenario Playbooks

### Scenario A: Complete Database Corruption or Primary Disk Failure
* **Root Cause**: Storage volume failure, accidental file system deletion, or unrecoverable hardware fault on the MongoDB node.
* **Incident Objective**: Restore database from the most recent verified backup with minimal downtime.
* **Step-by-Step Response**:
  1. **Halt Application Traffic**: Divert external traffic at the reverse proxy or stop the application container to prevent write conflicts:
     ```bash
     docker compose -f docker-compose.prod.yml stop server
     ```
  2. **Provision Fresh Database Node**: Create a clean MongoDB instance or replica set.
  3. **Select Latest Verified Backup**: Locate the most recent backup artifact in off-site storage and verify its SHA-256 checksum:
     ```bash
     ./scripts/verify-backup.sh /backups/social_connect_backup_20260920_020000.archive.gz
     ```
  4. **Execute Database Restore**:
     ```bash
     export MONGODB_URI="mongodb://admin:pass@fresh-node:27017/social-connect?authSource=admin"
     ./scripts/restore-mongodb.sh /backups/social_connect_backup_20260920_020000.archive.gz --confirm
     ```
  5. **Verify Restored Collections & Indexes**: Confirm all 16 collections and compound indexes exist.
  6. **Restart Application Server**: Start container and monitor readiness health checks:
     ```bash
     docker compose -f docker-compose.prod.yml up -d server
     curl -i http://localhost:5000/api/health/ready
     ```

---

### Scenario B: Accidental Data Deletion or Bad Migration Script
* **Root Cause**: An administrative error, rogue script, or buggy data migration script deletes or corrupts a subset of user documents or posts.
* **Incident Objective**: Recover deleted documents **without** wiping recent legitimate user activity that occurred after the deletion.
* **Step-by-Step Response**:
  1. **DO NOT Overwrite Production Database**: Never restore directly over production during a partial data loss incident.
  2. **Restore Backup to an Isolated Test Database**:
     ```bash
     export TARGET_DB="social_connect_recovery_temp"
     ./scripts/restore-mongodb.sh /backups/latest.archive.gz --confirm
     ```
  3. **Extract & Merge Target Data**:
     Connect to `social_connect_recovery_temp` and export only the affected records (e.g. deleted user accounts or posts):
     ```bash
     # Run targeted Node.js script to query recovery_temp and upsert into social-connect production
     node server/scripts/merge_recovered_records.js --from=social_connect_recovery_temp --collection=posts
     ```
  4. **Verify Integrity**: Verify that recovered posts maintain valid `author` relationships.
  5. **Cleanup Temporary Database**: Drop `social_connect_recovery_temp`.

---

### Scenario C: Application Server Instance Crash
* **Root Cause**: Host virtualization failure, kernel panic, or hardware termination of the compute instance running the Express backend.
* **Incident Objective**: Re-deploy the stateless application container and reconnect to the persistent database.
* **Step-by-Step Response**:
  1. **Database Assessment**: Confirm persistent MongoDB instance is unaffected and reachable.
  2. **Deploy on Replacement Host**:
     Pull the exact immutable release image:
     ```bash
     docker run -d --name social_connect_server \
       --env-file .env.production \
       -p 5000:5000 \
       ghcr.io/org/social-connect-server:v1.0.0
     ```
  3. **Verify Health Probes**:
     Verify liveness and readiness:
     ```bash
     curl -f http://localhost:5000/api/health
     curl -f http://localhost:5000/api/health/ready
     ```
  4. **Update DNS / Proxy**: Point load balancer target group to the new host IP.

---

### Scenario D: Failed Production Deployment
* **Root Cause**: A newly deployed application version introduces runtime exceptions or breaks authentication.
* **Incident Objective**: Instantly rollback application containers to the previous stable release.
* **Step-by-Step Response**:
  1. Follow the procedure in [ROLLBACK.md](ROLLBACK.md).
  2. Revert container image tag to previous release (e.g. `v1.2.9`).
  3. Verify that additive schema changes remain fully backward compatible with the rolled-back code.

---

## 3. External Media (Cloudinary) Recovery & Orphan Detection

MongoDB backups store **references** (`media.url`, `media.publicId`), not the raw binary images.

### 3.1 Cloudinary Backup Architecture
* **Cloudinary Native Backup**: Cloudinary provides automatic asset backup to secondary cloud storage (AWS S3) when enabled in account settings.
* **Asset Versioning**: Cloudinary maintains historical asset versions, allowing recovery if media is accidentally overwritten.

### 3.2 Handling Orphaned Media
Orphaned media occurs when:
- A user uploads an image, but post creation fails before MongoDB persistence.
- A database restore reverts to an earlier backup, omitting recently uploaded posts whose media still exists in Cloudinary.

#### Orphan Reconciliation Strategy
1. **Periodic Audit Script**: A background job compares Cloudinary assets in `social-connect/posts` with all `publicId` values in the MongoDB `posts` collection.
2. **Grace Window**: Assets created within the last 2 hours are ignored to prevent race conditions with in-flight post uploads.
3. **Safe Pruning**: Assets older than 24 hours that have zero database references are logged and queued for deletion via Cloudinary API (`cloudinary.uploader.destroy`).

---

## 4. Point-in-Time Recovery (PITR) Considerations

Logical backups (`mongodump` / `server/scripts/backup.js`) provide point-in-time snapshots at discrete intervals (e.g. daily at 02:00 UTC).

To achieve sub-hour RPO:
* **MongoDB Atlas Continuous Backups**: Atlas retains the replica set oplog, allowing restoration to any minute within the previous 7 days.
* **Self-Hosted Replica Set Oplog Dumps**: On self-hosted clusters, periodic oplog dumps (`mongodump --oplog`) enable rolling forward transaction logs to an exact timestamp before an incident.
