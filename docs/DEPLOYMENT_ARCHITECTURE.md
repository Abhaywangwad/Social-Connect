# Social Connect — Production Deployment Architecture

This document defines the production deployment architecture for the **Social Connect** application. It establishes the infrastructure topology, network boundaries, database persistence guarantees, real-time WebSocket mechanics, security controls, and future scaling pathways for a modular monolithic MERN stack.

---

## 1. High-Level Architecture & Topology

Social Connect separates concerns across five distinct infrastructure components:

```text
                                  User Browser
                                       │
                                       ▼
                                   [ HTTPS ]
                                       │
                     ┌─────────────────┴─────────────────┐
                     │                                   │
                     ▼                                   ▼
          ┌─────────────────────┐             ┌─────────────────────┐
          │   Frontend Client   │             │   Backend Server    │
          │   (Vite React SPA)  │             │  (Node/Express API  │
          │                     │             │    + Socket.IO)     │
          │                     │             │   Port 5000 / PID 1 │
          └─────────────────────┘             └──────────┬──────────┘
                                                         │
                                    ┌────────────────────┼────────────────────┐
                                    ▼                    ▼                    ▼
                           ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
                           │ Managed MongoDB │  │   Cloudinary    │  │  Email Provider │
                           │ 7.0 Persistent  │  │  Media Storage  │  │ (SMTP / Mailgun)│
                           │   TLS Replica   │  │ (Images & Videos│  │ (Auth & Resets) │
                           └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 2. Separation of Application and Database Responsibilities

In production, the application runtime and the database engine **must never share the same ephemeral container or local filesystem**:

```text
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│       Application Runtime       │           │       Database Layer            │
├─────────────────────────────────┤           ├─────────────────────────────────┤
│ • Stateless container / process │           │ • Stateful, persistent storage  │
│ • Easily replaced / restarted   │   ─────▶  │ • Automated snapshot backups    │
│ • Ephemeral local filesystem    │  Mongoose │ • Point-in-time recovery        │
│ • Scales horizontally           │           │ • Independent maintenance       │
└─────────────────────────────────┘           └─────────────────────────────────┘
```

### Key Architectural Reasons:
1. **Container Ephemerality**: Application containers are continuously stopped, destroyed, and recreated during deployments, auto-scaling events, and node maintenance. Storing database files inside an application container guarantees catastrophic data loss.
2. **Independent Lifecycle & Backups**: Database snapshots, automated point-in-time recovery, and cluster maintenance must operate independently from application deployments.
3. **Connection Pooling**: The Node.js application maintains a Mongoose connection pool (`minPoolSize=5`, `maxPoolSize=20`) to the persistent MongoDB cluster rather than hosting the storage engine.

---

## 3. Persistent Database Requirements

Production MongoDB must satisfy the following infrastructure requirements:

- **Persistent Block Storage**: Minimum SSD storage backed by durable persistent volumes with automated volume expansion.
- **Authentication & Authorization**: Internal database authentication enabled with dedicated application user credentials (`readWrite` role scoped strictly to the `social-connect` database).
- **Network Isolation**: MongoDB must **never be publicly exposed** to the open internet. Access is strictly restricted to:
  - Private VPC peering, or
  - IP allowlisting restricted to the application server/container subnets.
- **TLS/SSL Encryption in Transit**: Mandatory TLS 1.3/1.2 for all client-to-database connections (`tls=true` in `MONGODB_URI`).
- **Automated Backups**: Continuous daily automated snapshots with at least 7-day retention and point-in-time restore capability.
- **Environment Isolation**: Completely independent database instances for `development`, `test`, and `production`.

---

## 4. Production Networking & Mandatory HTTPS

```text
Client Browser ──[ HTTPS (443) / WSS ]──▶ Reverse Proxy / ALB ──[ HTTP (5000) ]──▶ Node.js (PID 1)
```

- **Mandatory HTTPS**: All production traffic must be served over TLS/HTTPS. Plain HTTP (port 80) must immediately issue an HTTP 301 Permanent Redirect to HTTPS.
- **HTTP Strict Transport Security (HSTS)**: Configured in `server/src/app.js` via Helmet with `maxAge: 31536000` (1 year), `includeSubDomains: true`, and `preload: true` when `NODE_ENV=production`.
- **Reverse Proxy Header Propagation**:
  - Express is configured with `app.set('trust proxy', 1)`.
  - The reverse proxy (Nginx, Cloudflare, or AWS ALB) terminates TLS and forwards headers:
    - `X-Forwarded-For`: Preserves real client IP for rate limiting and audit logging.
    - `X-Forwarded-Proto`: Indicates whether the original client request used `https`.
    - `X-Request-ID`: Propagates correlation IDs across application and audit logs.

---

## 5. Domain Configuration & Frontend/Backend Separation

Production typically separates the frontend static assets from the backend API:

| Component | Example Production Domain | Purpose |
|---|---|---|
| **Frontend Client** | `https://frontend.example.com` | React SPA static bundle served via CDN / static host (e.g. Vercel, Netlify, Cloudflare Pages, S3 + CloudFront). |
| **Backend API & Sockets**| `https://api.example.com` | Express REST API and Socket.IO server hosted on container/PaaS (e.g. Railway, Render, AWS ECS, Fly.io). |

### Environment Variables:
```env
# Backend environment (server/.env.production)
CLIENT_URL=https://frontend.example.com
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.example.mongodb.net/social-connect?retryWrites=true&w=majority

# Frontend environment (client/.env.production)
VITE_API_URL=https://api.example.com/api
VITE_SOCKET_URL=https://api.example.com
```

---

## 6. Production CORS & Cookie Configuration

### CORS Policy
In `server/src/app.js`, CORS is restricted to explicit allowlists:
- Allows `config.clientUrl` (`https://frontend.example.com`).
- Explicitly rejects unauthorized third-party origins (`Blocked by CORS allowlist policy`).
- Enables `credentials: true` to support credentialed cross-origin requests.
- Wildcard `origin: "*"` is **strictly prohibited** in production.

### Refresh Token Cookie Strategy
In `server/src/controllers/authController.js`:
```javascript
const getRefreshCookieOptions = (maxAgeMs = 30 * 24 * 60 * 60 * 1000) => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax', // or 'none' if frontend and backend use completely different root domains
  path: '/api/auth',
  maxAge: maxAgeMs,
});
```
- **`httpOnly: true`**: Completely inaccessible to JavaScript, neutralizing Cross-Site Scripting (XSS) token theft.
- **`secure: true`**: Enforced in production, ensuring the cookie is transmitted exclusively over encrypted HTTPS connections.
- **`sameSite` Selection**:
  - If frontend and backend share the same parent domain (e.g. `app.example.com` and `api.example.com`), `sameSite: 'lax'` is recommended.
  - If frontend and backend use completely different top-level domains (e.g. `my-app.vercel.app` and `my-api.railway.app`), `sameSite: 'none'` with `secure: true` must be configured to permit cross-site cookie transmission.
- **`path: '/api/auth'`**: Cookie is restricted to authentication refresh/logout endpoints, minimizing unnecessary cookie transmission on public feed queries.

---

## 7. Real-Time Socket.IO Deployment Architecture

Social Connect embeds Socket.IO directly inside the Express HTTP server process (`server/src/server.js`), sharing the single listening port `5000`.

### Real-Time Flow:
1. **Handshake**: Client initiates connection to `https://api.example.com/socket.io/`.
2. **WebSocket Upgrade**: Reverse proxy must support the HTTP `Upgrade: websocket` and `Connection: Upgrade` headers.
3. **Authentication**: Client passes JWT access token in `auth.token`. Handshake middleware (`socketAuth.js`) verifies cryptographic signature before accepting connection.
4. **Rooms & Broadcasts**:
   - `user:<userId>`: Personal room for notifications, presence, and direct messages.
   - `conversation:<conversationId>`: Room for real-time conversation messages.

### Current Single-Instance Design:
The application is currently designed to run as a **single backend instance** in production.
- Presence tracking (`presenceManager`) and typing indicator state (`typingManager`) operate completely in-memory.
- Single-node architecture avoids distributed race conditions and eliminates external Redis overhead at this stage.

---

## 8. Future Horizontal Scaling Considerations

When scaling the backend beyond **1 instance** to **2+ instances** behind a load balancer, two architectural adjustments are required:

```text
                               Load Balancer
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       [ Backend Instance A ]                  [ Backend Instance B ]
       • Local Socket Connections              • Local Socket Connections
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     ▼
                        [ Redis Pub/Sub Adapter ]
                        • Broadcasts across instances
                        • Centralized presence state
```

1. **Socket.IO Redis Adapter**:
   - In a multi-node cluster, Socket A on Instance 1 cannot directly emit events to Socket B on Instance 2.
   - Requires `@socket.io/redis-adapter` to distribute room broadcasts across nodes via Redis pub/sub.
2. **Sticky Sessions**:
   - If HTTP long-polling fallback is enabled, the load balancer must enable cookie-based session affinity (sticky sessions) so sequential handshake requests reach the same node.
   - Alternatively, force WebSocket transport exclusively (`transports: ['websocket']`).

---

## 9. Deployment Strategies

| Strategy | Description | Downtime | Complexity | Suitability for Social Connect |
|---|---|---|---|---|
| **Recreate** | Stops existing container, pulls new image, and starts new container. | Brief gap (~10-20s) | Lowest | **Recommended for initial deployment** on platforms like Render, Railway, or simple VPS. Simple, zero state synchronization issues. |
| **Rolling Deployment** | Starts new container, verifies health check (`/api/health`), switches traffic, then terminates old container. | Zero downtime | Medium | Ideal when running behind AWS ALB or Kubernetes with health checks. |
| **Blue/Green** | Provisions identical standby environment ("Green"), verifies smoke tests, switches router, preserves old ("Blue") for instant rollback. | Zero downtime | High | Used in mature enterprise environments requiring instant rollback. |

---

## 10. Health Checking & Zero-Downtime Rollout Gates

Deployments must use multi-stage health checking:

```text
1. Container Launch ──▶ 2. Liveness Check (GET /api/health) ──▶ 3. Readiness Check (GET /api/health/ready) ──▶ 4. Route Traffic
```

- **Liveness (`GET /api/health`)**: Verifies Express event loop is responding.
- **Readiness (`GET /api/health/ready`)**: Verifies MongoDB connection pool is active (`mongoose.connection.readyState === 1`).
- If readiness returns HTTP 503, the deployment platform must halt the rollout, keep the previous version active, and notify maintainers.

---

## 11. Graceful Shutdown

Deployments continuously terminate old instances. Social Connect handles this cleanly in `server/src/server.js`:

1. Traps `SIGTERM` and `SIGINT`.
2. Closes Socket.IO connections and notifies connected clients.
3. Stops accepting new HTTP requests (`httpServer.close()`).
4. Flushes and closes Mongoose database connection pool.
5. Guards entire sequence with a 10-second watchdog timer.

---

## 12. Logging & Request Tracing

- **Standard Output**: All logs are emitted to `stdout` (info/debug) and `stderr` (errors) as JSON/structured streams for platform ingestion (Datadog, CloudWatch, Papertrail).
- **Request Correlation ID**: Every request is assigned a UUID via `requestIdMiddleware` (`X-Request-ID`), linking HTTP access logs, operational application logs, error traces, and database `AuditLog` records.
- **Audit Logging vs Operational Logging**:
  - `AuditLog` collection: Permanent, compliance-grade business records (logins, password changes, admin moderation).
  - Platform logs: Ephemeral operational diagnostics and performance metrics.

---

## 13. Hosting Provider Compatibility Requirements

Social Connect is vendor-neutral. A hosting platform must provide:

### Backend Hosting Platform
- Node.js 20 LTS or OCI Docker container runtime.
- Long-lived WebSocket connection support with HTTP Upgrade header forwarding.
- Configurable environment secrets.
- Health check polling against `/api/health`.
- `SIGTERM` signal forwarding for graceful shutdown.

### Frontend Hosting Platform
- Fast global CDN static delivery.
- Custom domain support with automated TLS certificates.
- Single Page Application (SPA) fallback routing (redirecting all non-file routes to `/index.html`).

### Database Hosting Platform
- MongoDB 7.0 / MongoDB Atlas.
- Automated daily snapshots.
- TLS 1.2+ encryption in transit.
- Private network peering or IP allowlisting.
