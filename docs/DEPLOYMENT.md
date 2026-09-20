# Social Connect — Operations & Deployment Guide

This document outlines the containerization, environment configuration, database persistence, health checking, and production deployment procedures for the **Social Connect** application.

---

## 1. System Requirements & Architecture

Social Connect is architected as a modular monolithic MERN application with real-time Socket.IO communication.

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

### Host Requirements
- **Docker Engine**: Version 24.0.0 or later
- **Docker Compose**: Version 2.20.0 or later
- **Node.js (for local host dev/test)**: Node.js 20 LTS or 22 LTS

---

## 2. Environment Configuration Strategy

The application enforces explicit environment separation across three modes:

| Environment | Purpose | Secrets & Mocks | Fail-Fast Validation |
|---|---|---|---|
| **`development`** | Local feature development and testing | Uses local `.env` with fallback credentials and mock email service | Permissive warnings |
| **`test`** | Automated testing via Vitest & Supertest | Loads `server/.env.test` targeting isolated test DB (`social-connect-test`) | In-memory mocks |
| **`production`** | Live staging or production deployments | Credentials supplied via container environment or secret manager | **Strict fail-fast termination** on missing secrets |

### Environment Variables Reference

| Variable | Type | Required in Prod | Default (Dev) | Description |
|---|---|---|---|---|
| `NODE_ENV` | String | Yes | `development` | Runtime environment: `development`, `test`, or `production`. |
| `PORT` | Integer | No | `5000` | Port on which the Express HTTP server listens. |
| `MONGODB_URI` | String | **Yes** | `mongodb://localhost:27017/social-connect` | MongoDB connection URI. Inside Docker Compose, use `mongodb://mongo:27017/social-connect`. |
| `CLIENT_URL` | String | **Yes** | `http://localhost:5173` | Allowed CORS origin for browser clients (e.g. `https://app.example.com`). |
| `JWT_ACCESS_SECRET` | String | **Yes** | — | Cryptographic secret for signing short-lived JWT access tokens (minimum 32 characters). |
| `JWT_REFRESH_SECRET` | String | **Yes** | — | Cryptographic secret for signing long-lived refresh tokens (minimum 32 characters). |
| `JWT_ACCESS_EXPIRES_IN`| String | No | `15m` | Access token lifespan (e.g. `15m`). |
| `JWT_REFRESH_EXPIRES_IN`| String | No | `30d` | Refresh token lifespan (e.g. `30d`). |
| `CLOUDINARY_CLOUD_NAME`| String | Recommended | — | Cloudinary cloud identifier for post and story media storage. |
| `CLOUDINARY_API_KEY` | String | Recommended | — | Cloudinary API key. |
| `CLOUDINARY_API_SECRET`| String | Recommended | — | Cloudinary API secret. |
| `CLOUDINARY_FOLDER` | String | No | `social-connect/posts` | Cloudinary storage folder prefix. |
| `EMAIL_PROVIDER` | String | No | `mock` (dev) / `smtp` (prod) | Email delivery provider: `mock` (in-memory queue) or `smtp`. |
| `EMAIL_FROM` | String | No | `no-reply@socialconnect.local` | Sender email address for account verification and password resets. |
| `EMAIL_HOST` | String | If SMTP | — | SMTP server hostname. |
| `EMAIL_PORT` | Integer | If SMTP | `587` | SMTP server port (usually 587 or 465). |
| `EMAIL_USER` | String | If SMTP | — | SMTP authentication username. |
| `EMAIL_PASSWORD` | String | If SMTP | — | SMTP authentication password. |
| `MONGO_MAX_POOL_SIZE` | Integer | No | `20` | Maximum number of concurrent connections in MongoDB pool. |
| `MONGO_MIN_POOL_SIZE` | Integer | No | `5` | Minimum number of idle connections maintained in MongoDB pool. |
| `ENABLE_API_DOCS` | Boolean | No | `false` | When set to `true` in production, exposes interactive Swagger UI at `/api/docs`. |

---

## 3. Local Development with Docker Compose

To start the entire backend stack (Express API, Socket.IO, and persistent MongoDB) in development mode:

### 1. Start Services
```bash
# Build images and start containers in foreground
docker compose up --build

# Or run in detached background mode
docker compose up -d --build
```

### 2. Inspect Running Containers
```bash
docker compose ps
```

### 3. View Real-Time Streaming Logs
```bash
# Follow all container logs
docker compose logs -f

# Follow only backend service logs
docker compose logs -f backend
```

### 4. Stop Services
```bash
# Stop containers while preserving database volume
docker compose down

# Stop containers AND delete persistent database volume (resets DB)
docker compose down -v
```

---

## 4. Production Deployment Workflow

For production environments, use `docker-compose.prod.yml`, which applies production security hardening, unexposes the database from the host network, enables resource limits, and configures container log rotation.

### 1. Provision Production Secrets
Create a secure production environment file (e.g. `.env.production`), ensuring strict file permissions:

```bash
chmod 600 .env.production
```

Populate with high-entropy cryptographic keys:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://mongo:27017/social-connect
CLIENT_URL=https://your-production-app.example.com
JWT_ACCESS_SECRET=c28f9d0e14a6b29841d6f1c4e7892305a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7
JWT_REFRESH_SECRET=89d0e14a6b29841d6f1c4e7892305a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f
CLOUDINARY_CLOUD_NAME=your_production_cloud
CLOUDINARY_API_KEY=your_production_key
CLOUDINARY_API_SECRET=your_production_secret
EMAIL_PROVIDER=smtp
EMAIL_FROM=no-reply@yourdomain.com
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your_sendgrid_api_key
ENABLE_API_DOCS=false
```

### 2. Launch Production Stack
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 3. Verify Health Probes
```bash
# Check container health status
docker compose -f docker-compose.prod.yml ps

# Query liveness endpoint
curl -i http://localhost:5000/api/health

# Query readiness endpoint (validates MongoDB connection)
curl -i http://localhost:5000/api/health/ready
```

---

## 5. Security & Hardening Protections

1. **Non-Root Runtime User**:
   - The production container switches to the built-in Alpine `node` user (UID/GID 1000). The Node.js process never runs as `root`.
2. **Multi-Stage Build**:
   - Compilers, development dependencies, test runners (`vitest`, `supertest`), and build tools are completely discarded in Stage 1 (`dependencies`). The final Stage 2 (`runner`) image contains only lean production assets.
3. **Database Network Isolation**:
   - In `docker-compose.prod.yml`, the MongoDB port `27017` is **never exposed** to the host machine. All database traffic is locked to the internal Docker bridge network (`social-connect-prod-net`).
4. **Secret Hygiene**:
   - Secrets are **never embedded** in the `Dockerfile` or committed in Compose files.
   - Fail-fast validation halts process startup immediately if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are missing or set to fallback strings.
   - Error messages mask internal paths and stack traces in production.
5. **Cookie Security**:
   - Refresh tokens are issued with `httpOnly: true`, `sameSite: 'lax'`, `path: '/api/auth'`, and `secure: true` when `NODE_ENV === 'production'`.
6. **Reverse Proxy Compatibility**:
   - Express is configured with `app.set('trust proxy', 1)` to accurately extract client IP addresses and protocol schemes when deployed behind AWS ALB, Nginx, or Cloudflare.

---

## 6. Health & Readiness Probes

Social Connect provides dedicated liveness and readiness probes designed for Docker, Kubernetes, and AWS ALB health checking:

### Liveness Probe (`GET /api/health`)
- **Purpose**: Verifies that the Express process is active and accepting HTTP requests.
- **Response**: `200 OK`
```json
{
  "success": true,
  "status": "healthy",
  "message": "Social Connect API is running",
  "timestamp": "2026-09-20T10:30:00.000Z",
  "environment": "production"
}
```

### Readiness Probe (`GET /api/health/ready`)
- **Purpose**: Verifies that essential dependencies (MongoDB connection state = 1) are active and accepting queries.
- **Responses**:
  - `200 OK`: Database connected (`status: "ready"`).
  - `503 Service Unavailable`: Database disconnected (`status: "unready"`). Traffic should not be routed to this container.

---

## 7. Graceful Shutdown

Social Connect implements clean, graceful lifecycle termination in `server/src/server.js`:

```text
Host / Orchestrator sends SIGTERM / SIGINT
                 │
                 ▼
1. Node process traps signal (stops accepting new connections)
                 │
                 ▼
2. HTTP server closes cleanly (drains active HTTP in-flight requests)
                 │
                 ▼
3. Socket.IO connections closed (broadcasts termination to connected clients)
                 │
                 ▼
4. Mongoose database connection closed cleanly (flushes connection pool)
                 │
                 ▼
5. Process exits with exit code 0
   (Guarded by 10-second force-kill watchdog timer if resources hang)
```

Because `CMD ["node", "src/server.js"]` is configured in exec-form in the `Dockerfile`, Node.js runs as **PID 1** inside the container and directly receives `SIGTERM` signals from Docker or Kubernetes without delay.
