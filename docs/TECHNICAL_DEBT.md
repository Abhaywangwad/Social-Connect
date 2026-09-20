# Technical Debt & Architectural Evolution Register

## Purpose & Scope
This register tracks deliberate architectural trade-offs, operational boundaries, and deferred enhancements for Social Connect. Items are categorized across three actionable time horizons:
* **Now** (Immediate operational / pre-launch priorities)
* **Later** (Post-launch scaling & growth priorities)
* **Future** (High-scale distributed infrastructure considerations)

---

## Technical Debt Inventory

### Horizon: NOW (Pre-Launch & Maintenance)

| ID | Component | Description | Current State | Target State | Impact / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TD-01** | **Orphaned Media Cleanup** | Post/Story deletions attempt synchronous Cloudinary removal; if network fails, public IDs are logged to console. | In-flight failure leaves image in Cloudinary bucket. | Introduce dead-letter queue or nightly reconciliation sweep script comparing MongoDB media publicIds with Cloudinary asset registry. | Cost optimization and storage hygiene. |
| **TD-02** | **Account Deletion Cascade** | Account lifecycle currently supports suspension (`accountStatus: SUSPENDED`) and session revocation. Full GDPR/CCPA hard deletion is not yet automated. | Suspended accounts retain posts, comments, media, and conversations. | Implement an asynchronous cascading deletion worker (or tombstoning service) to redact PII and purge assets upon confirmed user deletion. | Legal/compliance readiness. |
| **TD-03** | **Scheduled Counter Audit** | `scripts/reconcile-counters.js` is a manual CLI tool. | Executed ad-hoc by operators or engineers. | Wire up as a weekly cron or Kubernetes Job executing in `--fix` mode with alert dispatching. | Automated self-healing data integrity. |

---

### Horizon: LATER (Post-Launch Scaling)

| ID | Component | Description | Current State | Target State | Impact / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TD-04** | **Socket.IO Multi-Node Clustering** | Socket.IO server runs as a single-node stateful instance using local memory for rooms and presence (`presenceManager`). | Limited to single server instance (~10k-20k concurrent WebSocket connections). | Attach `@socket.io/redis-adapter` and Redis-backed Pub/Sub for cross-pod real-time broadcasting and presence synchronization. | Enables horizontal scaling across multiple application containers. |
| **TD-05** | **Distributed Rate Limiting** | `rateLimiter.js` utilizes in-memory buckets (`express-rate-limit` with memory store). | Per-instance bucket enforcement; restarts or multiple replicas split the rate limits. | Migrate to Redis-backed store (`rate-limit-redis`) for cluster-wide quota enforcement. | Consistent abuse prevention behind multi-instance load balancers. |
| **TD-06** | **Feed Materialization for High-Follower Accounts** | Home feed uses Fan-Out-On-Read (`Post.find({ author: { $in: candidateIds } })`). | High efficiency for users following < 500 accounts; scales up to ~1,000 followees without latency degradation. | For users following > 1,000 accounts or accounts with millions of followers, introduce hybrid fan-out-on-write / Redis feed timelines. | Protects MongoDB CPU under celebrity follow scenarios. |
| **TD-07** | **Read Replica Query Offloading** | All reads and writes target the primary replica set member (`primaryPreferred` not explicitly partitioned in service queries). | Single primary handles both mutations and heavy read pipelines. | Configure secondary read preference (`readPreference: 'secondaryPreferred'`) for read-only aggregation workloads (AuditLogs, Reports). | Increases primary write headroom by 2x-4x. |

---

### Horizon: FUTURE (High-Scale Architecture)

| ID | Component | Description | Current State | Target State | Impact / Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TD-08** | **Full-Text & Semantic Search** | User and content search uses normalized prefix regex matching with indexed B-trees. | Fast for exact username prefixes and lowercase tokens; limited typo tolerance or fuzzy matching. | Integrate MongoDB Atlas Search (Lucene) or dedicated OpenSearch cluster for fuzzy autocomplete and hashtag exploration. | Enhanced discovery UX as content volume reaches millions of posts. |
| **TD-09** | **Historical Data Tiering & Archival** | Audit logs and notifications grow monotonically with indefinite retention. | Stored indefinitely in primary MongoDB collections (`AuditLog`, `Notification`). | Establish cold storage archival (S3 / Parquet export) for audit logs older than 365 days; TTL auto-purge for unread notifications > 90 days. | Storage cost control and index compaction. |
| **TD-10** | **Asynchronous Task Queue** | Notifications, email dispatch, and audit logging execute within the request-response lifecycle (non-blocking errors caught). | In-process execution within Express event loop. | Extract event-driven tasks into BullMQ / Redis worker queue for retry backoffs, dead-lettering, and decouple API latency. | Zero-overhead API responses and bulletproof retry guarantees. |
