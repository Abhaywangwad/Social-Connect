# Known Limitations & Edge Cases — Social Connect

## 1. Socket.IO Clustering & Multi-Node Scaling
- **Current State**: Socket.IO presence, socket IDs, and rooms run on the single-node Node.js in-memory process.
- **Limitation**: When scaling the backend horizontally across multiple server instances (e.g., Kubernetes pods or ECS containers), clients connected to Node A will not receive real-time events emitted from Node B without a message broker.
- **Recommended Remediation**: Attach `@socket.io/redis-adapter` and `@socket.io/redis-emitter` connected to a Redis cluster before deploying multi-node production replicas.

---

## 2. In-Memory Rate Limiting
- **Current State**: Sliding-window rate limiters use in-memory JS `Map` instances (`server/src/middleware/rateLimiter.js`).
- **Limitation**:
  1. Rate limit counts reset when the Node.js process restarts.
  2. In multi-instance deployments, client requests load-balanced across multiple nodes experience independent rate limits instead of a shared global ceiling.
- **Recommended Remediation**: Transition in-memory rate stores to `rate-limiter-flexible` backed by Redis for centralized quota tracking.

---

## 3. Media Upload Size & Storage
- **Current State**: Image uploads are temporarily buffered into Node.js server memory before being piped to Cloudinary.
- **Limitation**: Extremely large multi-image uploads (up to 10 images concurrently) consume Node.js heap during transmission.
- **Mitigation in Place**: Express request limits (`100kb` for JSON), Multer file size caps (`5MB` per image, max 10 images), and Cloudinary asset cleanup on partial failures.
- **Recommended Future Evolution**: Direct-to-Cloudinary presigned client uploads using signed upload signatures to bypass server memory entirely.

---

## 4. Full-Text Search Tokenization
- **Current State**: User search relies on normalized lowercase substring prefix matching and regex text indexing.
- **Limitation**: Does not support fuzzy spelling corrections, phonetic matches (Soundex/Metaphone), or multi-lingual stemming.
- **Recommended Future Evolution**: Integrate MongoDB Atlas Search (Lucene) or Elasticsearch/Meilisearch for typo-tolerant fuzzy discovery.

---

## 5. Story Media Type
- **Current State**: Stories support images (JPEG, PNG, WEBP) with automatic 24-hour TTL expiration. Video stories are not currently accepted by the schema.
- **Planned Roadmap**: Add MP4/WebM video transcoding and streaming chunking via Cloudinary Video transformations.
