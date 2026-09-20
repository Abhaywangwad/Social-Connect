# Final Project Architecture — Social Connect

## 1. System Overview

Social Connect is a production-grade MERN (MongoDB, Express, React, Node.js) social media platform built with strict architectural boundaries, defense-in-depth security, deterministic data consistency, real-time messaging, and high-performance querying.

```
┌────────────────────────────────────────────────────────┐
│                   React 19 Frontend                    │
│      SPA Router • AuthContext • SocketContext          │
│   Vanilla CSS System • Resilient Reconnection Bus       │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       HTTP/REST│                        │WebSocket / Polling
     (credentials: include)              │(JWT Handshake)
                │                        │
┌───────────────▼────────────────────────▼───────────────┐
│                    Express API Gateway                 │
│   Helmet • CORS • Rate Limiters • Request Correlation   │
│   Authentication (JWT) • Strict Zod Schema Validation  │
└───────────────────────┬────────────────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ REST Service │ │  Socket.IO   │ │ Cloudinary / │
│    Layer     │ │ Real-Time Hub│ │ Media Engine │
└──────┬───────┘ └──────┬───────┘ └──────────────┘
       │                │
       └────────┬───────┘
                ▼
┌────────────────────────────────────────────────────────┐
│                   MongoDB 8.x Cluster                  │
│    ACID Multi-Document Transactions • Lean Queries     │
│   Partial Compound Indexes • Aggregation Pipelines     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture (`client/`)

- **Framework & Build**: React 19, Vite, ES Modules. Zero heavyweight router dependencies; custom, zero-dependency History API router supporting deep links, back/forward history navigation, and unauthenticated redirects.
- **Design System & Styling**: Pure vanilla CSS (`client/src/index.css`) utilizing modern CSS variables for dark theme aesthetics, glassmorphism, responsive grid layouts, micro-animations, and zero CSS runtime overhead (no Tailwind, zero bundle bloat).
- **Security & XSS Prevention**:
  - **Zero `dangerouslySetInnerHTML`**: All user-generated text (posts, comments, bios, direct messages) is rendered strictly through native React string escaping.
  - **Short-Lived Access Tokens**: In-memory storage only (React state + API client memory). Tokens are never written to `localStorage` or `sessionStorage`.
  - **HttpOnly Refresh Cookies**: Secured with `path: /api/auth`, `SameSite: strict`, and HTTPS in production, preventing XSS-based token theft.
- **State Management & Contexts**:
  - `AuthContext`: Manages user identity lifecycle, silent session bootstrap via refresh cookie, automatic token rotation on 401 with concurrent request queuing, and instant logout.
  - `SocketContext`: Singleton wrapper around `SocketManager` establishing resilient Socket.IO connections on authentication, tracking online presence, live typing indicators, and room synchronization.
- **Component Hierarchy**:
  - `AppContent`: Header navbar, breadcrumbs/mobile drawer, and dynamic route view renderer.
  - `FeedView`: Cursor-based feed pagination with optimistic like/save toggling.
  - `PostCard`: Media gallery, author attribution, engagement counters, inline comments, reporting modal.
  - `MessagesView`: Split-pane real-time chat with message histories, typing indicator animations, and automatic read receipt emission.
  - `ProfileView`: Profile header, follow/unfollow toggle with optimistic updates, tabbed posts grid, and profile editor modal.
  - `AdminDashboard`: Tabbed moderation queues (OPEN, REVIEWING, RESOLVED, DISMISSED) with inline review transitions and content hiding/removal.

---

## 3. Backend Architecture (`server/`)

- **Runtime & Framework**: Node.js, Express, Socket.IO.
- **Layered Architecture**:
  - `routes/`: Declares HTTP verbs, URL routes, rate limiters, authentication gates, and Zod validation middlewares.
  - `controllers/`: Unpacks request parameters, correlates request IDs, invokes business services, and formats standard responses.
  - `services/`: Encapsulates all domain logic, authorization assertions, and MongoDB operations.
  - `models/`: Mongoose schemas defining validation constraints, compound indexes, and toJSON serialization sanitizers.
  - `middleware/`: Cross-cutting concerns including `requestId`, `slowRequestLogger`, `errorHandler`, `adminMiddleware`, `accountStatusMiddleware`, and sliding-window `rateLimiter`.
  - `socket/`: Socket.IO lifecycle managers, JWT handshake authenticators, and event handlers for messaging, typing, and presence.

---

## 4. Database & Query Optimization

- **Consistency Model**: MongoDB multi-document transactions ensure atomicity across denormalized counters (`followersCount`, `followingCount`, `likesCount`, `commentsCount`).
- **Compound & Partial Indexing**:
  - Active stories: `{ expiresAt: 1, author: 1 }`
  - Feed aggregation: `{ author: 1, createdAt: -1 }`
  - Follow relationships: `{ follower: 1, following: 1 }` (unique compound)
  - Unread notifications: `{ recipient: 1, isRead: 1, createdAt: -1 }`
- **Cursor-Based Pagination**: Prevents deep-page skip performance degradation using deterministic base64-encoded `createdAt + _id` composite cursors.

---

## 5. Security & Isolation Matrix

| Layer | Mechanism | Protection |
|---|---|---|
| **Transport** | Helmet, HSTS, CORS Allowlist | Clickjacking, MIME-sniffing, CSRF, MITM |
| **Authentication** | Dual-Token JWT (Access + HttpOnly Cookie Refresh) | Session fixation, credential leakage |
| **Authorization** | DB-backed role verification on each admin request | Stale-token privilege escalation |
| **Input Validation** | Strict Zod schemas with unknown field stripping | Prototype pollution, parameter injection |
| **Rate Limiting** | Sliding-window in-memory stores per endpoint tier | Brute-force attacks, DDoS, bot abuse |
| **Content Safety** | User blocking boundaries & admin moderation queues | Harassment, spam, abusive media |
