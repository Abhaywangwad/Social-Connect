# Production Observability, Structured Logging, and Error Tracking

This document outlines the operational observability architecture, logging standards, metrics tracking, error classification, and incident diagnostics for the **Social Connect** platform.

---

## 1. Observability Layers

Social Connect decouples monitoring into five distinct, specialized operational layers:

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                           Social Connect Application                           │
└──────┬────────────────┬─────────────────┬────────────────┬────────────────────┘
       │                │                 │                │                    │
       ▼                ▼                 ▼                ▼                    ▼
[Health Checks]   [App Logs]       [Error Tracker]    [Metrics]          [Audit Logs]
• Liveness        • JSON stdout    • Exception DSN    • In-memory        • MongoDB
• Readiness       • Request IDs    • Sanitized ctx    • P95 Latency      • User actions
• Dependencies    • Log levels     • App version      • Sockets & HTTP   • Admin events
```

| Layer | Primary Question Answered | Storage / Delivery | Retention / Lifecycle |
|---|---|---|---|
| **Health Monitoring** | Is the service process alive and ready to accept traffic? | HTTP Probes (`/api/health`, `/api/health/ready`) | Real-time (orchestrator polled) |
| **Application Logs** | What did the system do, when, and with what correlation ID? | Standard Output (`stdout`/`stderr`), JSON in prod | Shipped to Log Aggregator (Datadog, Loki) |
| **Error Tracking** | What unexpected application exceptions occurred and why? | Exception Client (`errorTracker`), Sentry/DSN | Issue tracking & release correlation |
| **Performance Metrics** | How quickly and reliably is the system processing requests? | In-Memory Registry (`/api/health/metrics`) | Real-time scrapers (Prometheus / CloudWatch) |
| **Audit Logs** | Who performed high-stakes security, admin, or moderation actions? | Persistent MongoDB (`AuditLog` collection) | Permanent compliance record |

---

## 2. Sensitive Data Policy & Redaction Rules

> [!CAUTION]
> **Strict Prohibition**: Under no circumstances may plaintext passwords, password hashes, JWT access tokens, refresh token cookies, password reset tokens, email verification tokens, session secrets, or private chat message contents be emitted to application logs, metrics, or external error trackers.

### 2.1 Automated Credential Scrubbing (`maskSecrets`)
All logging calls and error contexts pass through recursive data sanitizers that redact matching keys:
* Forbidden Keys: `password`, `token`, `refreshtoken`, `accesstoken`, `authorization`, `cookie`, `secret`, `apikey`, `apisecret`, `tokenhash`, `refreshtokenhash`, `resettoken`, `verificationtoken`, `signature`, `smtppassword`, `clientsecret`, `bearer`, `code`.
* Any matched field is automatically masked as `[REDACTED]`.

### 2.2 URL Query Parameter Sanitization (`sanitizeUrl`)
URLs can inadvertently leak tokens when users click email links (e.g. `/api/auth/verify?token=xyz123`). The logger and HTTP Morgan middleware automatically scrub matching query parameters:
* **Raw Incoming URL**: `/api/auth/verify-email?token=abcdef123456&email=user@example.com`
* **Sanitized Logged URL**: `/api/auth/verify-email?token=[REDACTED]&email=user@example.com`

### 2.3 Route Payload Suppression
Request bodies for sensitive authentication routes (`/api/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/refresh`, `/change-password`) are **completely omitted** (`[AUTH_BODY_OMITTED]`) from error tracking and logs.

---

## 3. Request Correlation (`requestId`)

Every incoming HTTP request is assigned a unique identifier via `requestIdMiddleware` ([`server/src/middleware/requestId.js`](file:///c:/Users/Lenovo/Documents/Projects/Project/Social-Connect/server/src/middleware/requestId.js)).

1. **Client Header Propagation**: If the client sends `X-Request-ID`, it is validated and preserved. Otherwise, a cryptographically secure UUID is generated.
2. **Response Header**: The server returns `X-Request-ID: <uuid>` on every HTTP response.
3. **Log & Error Attachment**: The ID is attached to `req.id` and automatically bound to:
   - Morgan HTTP request logs
   - Slow request warnings
   - Centralized error handler responses (`error.requestId`)
   - AuditLog records for admin and security events

---

## 4. Structured Logging Specification

In production (`NODE_ENV=production`), logs are emitted as single-line, machine-readable JSON:

### 4.1 Standard HTTP Request Log
```json
{
  "timestamp": "2026-09-20T10:30:15.120Z",
  "level": "info",
  "message": "HTTP_REQUEST",
  "requestId": "e1f0e4b8-2a8a-45ef-89a1-7789a9cd8912",
  "method": "POST",
  "route": "/api/posts",
  "statusCode": 201,
  "durationMs": 42.5
}
```

### 4.2 Slow Request Warning Log
```json
{
  "timestamp": "2026-09-20T10:30:18.441Z",
  "level": "warn",
  "message": "[SLOW_REQUEST] GET /api/feed took 612.40ms",
  "requestId": "f8a912b4-78ef-4123-99ab-8812cdef9012",
  "method": "GET",
  "route": "/api/feed?limit=20",
  "status": 200,
  "durationMs": 612,
  "thresholdMs": 500
}
```

### 4.3 Unhandled Server Exception Log
```json
{
  "timestamp": "2026-09-20T10:30:22.019Z",
  "level": "error",
  "message": "[UnhandledError] Connection pool exhausted",
  "requestId": "a0bb412c-55dd-43aa-bf01-112233445566",
  "route": "/api/posts",
  "method": "POST",
  "statusCode": 500,
  "errorCode": "INTERNAL_ERROR",
  "stack": "Error: Connection pool exhausted\n    at Pool.acquire (...)"
}
```

---

## 5. Health Probes & Metrics API

### 5.1 Liveness Probe (`GET /api/health`)
* **Purpose**: Verifies that the Node.js event loop is responsive.
* **Database Dependency**: None (returns 200 even if database is transiently reconnecting).
* **Sample Response**:
  ```json
  {
    "success": true,
    "status": "healthy",
    "message": "Social Connect API is running",
    "version": "1.0.0",
    "timestamp": "2026-09-20T10:30:00.000Z",
    "environment": "production"
  }
  ```

### 5.2 Readiness Probe (`GET /api/health/ready`)
* **Purpose**: Verifies that critical backing services (MongoDB) are connected and accepting queries.
* **Responses**:
  - **Healthy (200 OK)**:
    ```json
    {
      "success": true,
      "status": "ready",
      "database": "connected",
      "version": "1.0.0",
      "timestamp": "2026-09-20T10:30:00.000Z",
      "environment": "production"
    }
    ```
  - **Degraded (503 Service Unavailable)**:
    ```json
    {
      "success": false,
      "status": "unready",
      "database": "disconnected",
      "version": "1.0.0",
      "timestamp": "2026-09-20T10:30:00.000Z",
      "environment": "production"
    }
    ```

### 5.3 Operational Metrics (`GET /api/health/metrics`)
* **Purpose**: In-memory operational performance counters and Socket.IO connection metrics.
* **Security**: Protected in production; requires header `x-metrics-key: <METRICS_SECRET>` or loopback access (`127.0.0.1`).
* **Sample Response**:
  ```json
  {
    "success": true,
    "version": "1.0.0",
    "environment": "production",
    "metrics": {
      "timestamp": "2026-09-20T10:30:00.000Z",
      "uptimeSeconds": 86400,
      "http": {
        "totalRequests": 14205,
        "status2xx": 13800,
        "status3xx": 50,
        "status4xx": 340,
        "status5xx": 15,
        "errorRatePercent": 2.50,
        "avgLatencyMs": 38.4,
        "p95LatencyMs": 145.2,
        "byMethod": { "GET": 10500, "POST": 3100, "PATCH": 500, "DELETE": 105 }
      },
      "socket": {
        "activeConnections": 420,
        "totalConnections": 3150,
        "totalDisconnections": 2730,
        "authFailures": 12,
        "messageFailures": 2,
        "byDisconnectReason": {
          "client namespace disconnect": 1900,
          "transport close": 750,
          "ping timeout": 80
        }
      },
      "database": {
        "status": "connected",
        "readyState": 1,
        "disconnectCount": 0,
        "reconnectCount": 0,
        "errorCount": 0
      },
      "system": {
        "rssMb": 85.4,
        "heapUsedMb": 48.2,
        "heapTotalMb": 64.0
      }
    }
  }
  ```

---

## 6. Centralized Error Classification & Tracking

Social Connect centralizes all application and system errors in [`server/src/middleware/errorHandler.js`](file:///c:/Users/Lenovo/Documents/Projects/Project/Social-Connect/server/src/middleware/errorHandler.js), translating low-level exceptions into safe, machine-readable contracts:

| Exception Type | HTTP Status | Error Code | Client Description | Logged Details |
|---|---|---|---|---|
| **Zod Schema Error** | 400 | `VALIDATION_ERROR` | Field-specific validation failures | Field names & messages |
| **Mongoose Validation** | 400 | `VALIDATION_ERROR` | Schema attribute failures | Field paths & error strings |
| **CastError** | 400 | `INVALID_IDENTIFIER` | Invalid MongoDB ObjectId format | Resource identifier key |
| **Duplicate Key (11000)** | 409 | `RESOURCE_CONFLICT` | Field (e.g. username/email) already taken | Colliding index key name |
| **Mongo Network/Timeout**| 503 | `DATABASE_UNAVAILABLE`| Database service temporarily unavailable | Exception message & retry status |
| **Token Expired** | 401 | `TOKEN_EXPIRED` | Authentication token expired | Omitted token |
| **Invalid JWT** | 401 | `INVALID_TOKEN` | Authentication token invalid/malformed | Token verification error type |
| **Multer Upload Error** | 400 | `FILE_TOO_LARGE` / `TOO_MANY_FILES` | Upload limit violations | Capped limits and field name |
| **SyntaxError (JSON)** | 400 | `MALFORMED_JSON` | Invalid JSON in request body | Payload parsing failure |
| **Unhandled Exception** | 500 | `INTERNAL_ERROR` | Generic unexpected error (prod-masked) | Full stack trace + request context |

### Error Tracker Client (`server/src/utils/errorTracker.js`)
When an unexpected 500-level error occurs:
1. Context is scrubbed (removing cookies, authorization headers, and passwords).
2. The sanitized payload is forwarded to `errorTracker.captureException(err, context)`.
3. In production, if `ERROR_TRACKING_ENABLED=true`, the error is dispatched to the configured tracking DSN (Sentry, Datadog, or custom webhook).

---

## 7. Socket.IO Real-Time Observability

Socket.IO real-time activity is instrumented in [`server/src/socket/`](file:///c:/Users/Lenovo/Documents/Projects/Project/Social-Connect/server/src/socket/):
1. **Connection Lifecycle**:
   - `connection` records an active socket counter increment and logs `[Socket.IO] Client connected` with `userId` and transport type (`websocket` vs `polling`).
2. **Disconnection Reason Taxonomy**:
   - `disconnect` captures the native Socket.IO disconnect reason (e.g. `client namespace disconnect`, `transport close`, `ping timeout`, `transport error`) to diagnose client network drops vs server restarts.
3. **Authentication Rejection**:
   - Handshake rejections are logged as `[Socket.IO] Authentication handshake rejected` without printing tokens or headers.
4. **Message Delivery Failures**:
   - Delivery errors increment `messageFailures` and log the error reason, conversation ID, and sender ID. **Zero message text is logged.**

---

## 8. Alerting Recommendations & Severity Thresholds

| Severity | Alert Rule | Trigger Condition | Recommended Response |
|---|---|---|---|
| **CRITICAL** | `ServiceUnavailable` | Readiness probe `/api/health/ready` returns 503 for > 60 seconds | Check MongoDB replica set status, VPC peering, and connection pool exhaustion. |
| **CRITICAL** | `Elevated5xxRate` | HTTP 5xx responses exceed 2% of total traffic over 5 minutes | Inspect unhandled error logs for the latest deployment release. |
| **CRITICAL** | `ContainerCrashLoop` | Container restarts > 3 times within 15 minutes | Check unhandled rejections or out-of-memory (OOM) kills. |
| **WARNING** | `HighP95Latency` | P95 latency exceeds 1000ms over 10 minutes | Check slow request logs (`[SLOW_REQUEST]`); check missing MongoDB indexes on feed/search queries. |
| **WARNING** | `AuthFailureSpike` | Socket or HTTP auth failures exceed 50 per minute | Investigate credential-stuffing attacks or expired client refresh token bug. |
| **WARNING** | `DatabaseReconnectSpike` | Database disconnect count > 2 in 10 minutes | Inspect network stability between application cluster and managed database. |
| **INFO** | `ApplicationStartup` | API server successfully booted and bound to port | Confirm deployment release version matches expected git tag. |

---

## 9. Production Troubleshooting Playbook

### Scenario A: High 5xx Error Rate Reported
1. Filter application logs for `"level": "error"`.
2. Extract the `requestId` from the failing error entry.
3. Search for all log entries sharing that `requestId` to view the exact sequence of events:
   ```bash
   docker logs social_connect_server | grep "a0bb412c-55dd-43aa-bf01-112233445566"
   ```
4. Verify whether the failure is database connectivity (`DATABASE_UNAVAILABLE`), third-party timeout (Cloudinary), or application logic (`INTERNAL_ERROR`).

### Scenario B: API Latency Spikes
1. Filter logs for `[SLOW_REQUEST]`.
2. Identify the slow endpoints (typically `/api/feed` or `/api/users/search`).
3. Check `durationMs` versus `thresholdMs`.
4. Run `explain('executionStats')` on the underlying MongoDB query to confirm index coverage (see [`docs/DATABASE_MIGRATIONS.md`](DATABASE_MIGRATIONS.md)).

### Scenario C: Socket.IO Connection Drops
1. Query `/api/health/metrics` and check `metrics.socket.byDisconnectReason`.
2. If `ping timeout` is elevated: Clients are experiencing high packet loss or mobile background suspension.
3. If `transport close` is elevated: Reverse proxy or load balancer may have an aggressive idle timeout (increase proxy `proxy_read_timeout` to 3600s).
4. If `server namespace disconnect` is elevated: Sockets were forcibly closed by server shutdown or user suspension.
