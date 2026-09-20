# Production Rollback Runbook & Smoke-Test Verification

This document provides step-by-step operational procedures for rolling back deployments and performing post-release verification for **Social Connect**.

---

## 1. Rollback Decision Framework

A rollback should be triggered immediately if any of the following conditions occur post-deployment:

| Trigger Indicator | Threshold / Condition | Action Required |
|---|---|---|
| **Health Check Failure** | `/api/health` or `/api/health/ready` returns non-200 for > 60 seconds | Immediate container rollback |
| **Elevated HTTP 5xx Rate** | 5xx error rate exceeds 1% of total requests over a 5-minute window | Immediate container rollback |
| **Crash Loop BackOff** | Container restarts repeatedly due to unhandled exceptions or OOM | Immediate container rollback |
| **Broken Core User Flow** | Authentication, feed loading, or post creation fails for users | Rollback and investigate in staging |
| **High Latency Spike** | P95 latency exceeds 2000ms sustained across critical API routes | Investigate DB locks / Rollback |

---

## 2. Container Image Rollback Procedure

### 2.1 Principle of Immutable Tags
All production deployments must use **immutable version tags** or **git commit SHAs** (e.g. `v1.2.4` or `sha-a8f2c3d`), **never** mutable tags like `:latest`. This ensures you can deterministically pull and deploy the exact previous stable build.

### 2.2 Execution Steps (Docker / Docker Compose)

1. **Identify Previous Stable Version Tag**:
   Query deployment history or CI/CD releases:
   ```bash
   # Example: current failing tag is v1.3.0, previous stable is v1.2.9
   export PREVIOUS_TAG="v1.2.9"
   ```

2. **Update Environment / Compose Configuration**:
   Update your production deployment configuration file (or `.env`):
   ```bash
   sed -i 's/SERVER_IMAGE_TAG=.*/SERVER_IMAGE_TAG='$PREVIOUS_TAG'/g' .env.prod
   ```

3. **Deploy Previous Image**:
   Pull the verified previous image and recreate containers:
   ```bash
   docker compose -f docker-compose.prod.yml pull server
   docker compose -f docker-compose.prod.yml up -d --no-deps --remove-orphans server
   ```

4. **Verify Container Status**:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   docker compose -f docker-compose.prod.yml logs --tail=100 server
   ```

5. **Verify Health Probes**:
   ```bash
   curl -i http://localhost:5000/api/health
   curl -i http://localhost:5000/api/health/ready
   ```

---

## 3. Database Rollback Constraints & Procedures

> [!WARNING]
> **Rolling back an application container does NOT roll back database changes.**
> Never attempt to drop collections or delete data during an incident without a complete verified backup.

### 3.1 When Database Changes Were Additive
If database changes followed the **Additive Migration Rules** in [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md):
- Newly added fields and optional schema properties **do not** break the older application version (`v1.2.9`).
- **No database rollback is necessary.** The older application code will simply ignore the new attributes.

### 3.2 When a Data Migration Script Corrupted State
If an automated migration script corrupted document values:
1. **Freeze Writes**: Put the application into maintenance mode or block write endpoints at the reverse proxy if necessary.
2. **Execute Down-Migration**:
   If a tested down-migration script exists (e.g. reverting backfilled fields):
   ```bash
   node server/scripts/migrations/20260920_revert_bad_migration.js
   ```
3. **Point-In-Time Restore (Disaster Recovery)**:
   If data corruption cannot be safely scripted, initiate a Point-In-Time Recovery (PITR) via MongoDB Atlas / replica set oplog to the exact timestamp immediately preceding the deployment:
   ```bash
   # Restore target timestamp: 2026-09-20T14:30:00Z
   mongorestore --uri="$MONGODB_URI" --oplogReplay --oplogLimit=1758378600:1 /backups/pre_deploy/
   ```

---

## 4. Environment & Secret Rollbacks

If deployment failure was caused by invalid configuration (e.g. bad JWT secret, invalid Cloudinary credentials, malformed CORS origin):

1. **Revert Configuration File**:
   Restore the last known good environment configuration from your secret manager or backup.
2. **Graceful Restart**:
   Trigger a rolling restart of the backend instances to ingest the restored environment:
   ```bash
   docker compose -f docker-compose.prod.yml restart server
   ```

---

## 5. Production Smoke-Test Checklist

Perform this verification suite immediately following any deployment or rollback:

### 5.1 Automated Health Probes
- [ ] **Liveness Probe**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://api.example.com/api/health
  # Expected output: 200
  ```
- [ ] **Readiness Probe**:
  ```bash
  curl -s https://api.example.com/api/health/ready | jq .
  # Expected: status "ready", database connected, uptime > 0
  ```

### 5.2 Core User Journey Validation
- [ ] **Authentication & Cookies**:
  - Log in using a pre-configured automated smoke-test user:
    ```bash
    curl -i -X POST https://api.example.com/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"smoke_tester@example.com","password":"ValidSecurePassword123!"}'
    ```
  - Verify HTTP 200 response with valid `accessToken` in body.
  - Verify `Set-Cookie` header is present with `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`.
- [ ] **Feed Retrieval**:
  - Request feed with access token:
    ```bash
    curl -i -H "Authorization: Bearer <ACCESS_TOKEN>" https://api.example.com/api/feed
    ```
  - Verify HTTP 200 and valid JSON array of posts.
- [ ] **Post Creation**:
  - Create a lightweight test post. Verify database insertion and timeline update.
- [ ] **Real-Time WebSockets (Socket.IO)**:
  - Establish a WebSocket connection over `wss://api.example.com/socket.io/?EIO=4&transport=websocket`.
  - Confirm `connect` handshake completes within 2000ms.
- [ ] **Admin & Moderation**:
  - Verify admin user can query `/api/admin/reports` with HTTP 200.
  - Verify `/api/admin/audit-logs` returns recent activity logs.

### 5.3 Infrastructure Health
- [ ] **Log Stream Health**: Confirm logs show no unhandled rejections or unhandled exceptions.
- [ ] **Database Connection Pool**: Confirm connection pool count is within nominal range (10-50 connections).
- [ ] **System Resources**: CPU utilization < 70%, Memory utilization < 80%.
