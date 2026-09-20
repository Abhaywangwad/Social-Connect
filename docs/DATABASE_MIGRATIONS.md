# Database Migration and Index Management Guide

This document defines the schema evolution, index deployment, and operational database change patterns for **Social Connect** using MongoDB and Mongoose.

---

## 1. Schema Evolution in Document Databases

MongoDB is schemaless at the storage engine level (WiredTiger), but **Social Connect enforces strict application-level schema contracts via Mongoose**.

In a production environment running continuous deployments, multiple versions of the application (e.g., during rolling updates or blue/green transitions) may query the database concurrently. Therefore, all schema changes must follow **backward and forward compatibility principles**.

```
Version N-1 (Active) ──┐
                       ├──> [ MongoDB Replica Set ]
Version N   (Canary) ──┘
```

### 1.1 Additive Changes (Zero-Downtime Safe)
Adding a new field or optional attribute is the safest migration pattern.

* **Rule**: New fields **must** be optional or provide a deterministic `default` value in the Mongoose schema.
* **Why**: Older application instances querying recently created documents will simply ignore the new key (unless `strict: 'throw'` is configured). Newer application instances querying older documents will receive `undefined` or the specified Mongoose `default`.
* **Example**:
  ```javascript
  // Safe additive change
  const userSchema = new mongoose.Schema({
    // existing fields...
    bio: { type: String, default: '' },
    // NEW FIELD: optional with default
    websiteUrl: { type: String, default: null, trim: true }
  });
  ```

### 1.2 Deprecating and Removing Fields (3-Phase Rollout)
Never remove a field from Mongoose schema and database simultaneously in one release.

| Phase | Application State | Database Action | Compatibility |
|---|---|---|---|
| **Phase 1: Dual Read / Write Stop** | App stops reading or relying on deprecated field. New writes omit or nullify it. | None. Deprecated field remains in existing documents. | N and N-1 fully operational. |
| **Phase 2: Schema Removal** | Field definition deleted from Mongoose schema. | Background batch script unsets field (`$unset`) in chunks. | N and N-1 operational. |
| **Phase 3: Database Pruning** | Application has zero references. | Ensure all documents have field removed. | Safe to compact if needed. |

### 1.3 Renaming Fields (Dual-Property Bridge)
Directly renaming a field (e.g. `$rename` in MongoDB) instantly breaks active running instances of the application that expect the old name.

Instead, follow the **Read-Both, Write-New** migration pattern:
1. Add new field name with default.
2. In Mongoose, add a virtual or pre-save hook that populates the new field if the old exists.
3. Deploy application Version N.
4. Run a background backfill script to copy values: `updateMany({ oldField: { $exists: true } }, [{ $set: { newField: '$oldField' } }])`.
5. Deploy application Version N+1 which removes reads from `oldField`.
6. Run `$unset` to remove `oldField`.

---

## 2. Production Index Management

### 2.1 The Danger of `autoIndex` in Production
By default, Mongoose calls `Model.init()` on startup, which triggers `createIndex()` for every index declared in schemas.

* **In Development**: Convenient and automatic.
* **In Production**: **Dangerous**.
  * Large collections (millions of posts/users) will experience lock contention, latency spikes, or memory exhaustion during cold boots.
  * If multiple containers boot simultaneously after a deploy, they will issue concurrent `createIndex()` commands against the primary replica.
  * Boot probes (liveness/readiness) may time out before index builds complete, causing container crash loops.

#### Production Configuration Rule
In production, `autoIndex` should be disabled across Mongoose connection options:

```javascript
// server/src/config/database.js
const mongooseOptions = {
  autoIndex: process.env.NODE_ENV !== 'production',
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
};
```

---

## 3. Social Connect Complete Index Inventory

Social Connect maintains 16 core Mongoose models with specialized indexes for relational constraints, feed fan-out, and automated data expiration:

| Model | Index Specification | Type / Purpose |
|---|---|---|
| **`User`** | `{ email: 1 }` | Unique (`unique: true, lowercase: true`) |
| **`User`** | `{ username: 1 }` | Unique (`unique: true, lowercase: true`) |
| **`User`** | `{ role: 1 }`, `{ isBanned: 1 }` | Moderation and admin query filtering |
| **`Post`** | `{ moderationStatus: 1, author: 1, createdAt: -1, _id: -1 }` | **Quad Compound Index**: Optimized cursor-based Home Feed queries |
| **`Post`** | `{ author: 1, createdAt: -1 }` | User profile timeline queries |
| **`Post`** | `{ createdAt: -1 }` | Global chronological discovery feed |
| **`Comment`** | `{ post: 1, createdAt: 1 }` | Chronological post discussion threads |
| **`Comment`** | `{ parentComment: 1 }` | Nested reply queries |
| **`Follow`** | `{ follower: 1, following: 1 }` | Unique compound: Prevents duplicate follow relationships |
| **`Follow`** | `{ following: 1 }` | Follower list lookups and fan-out targeting |
| **`Like`** | `{ user: 1, post: 1 }` | Unique compound: Prevents duplicate post likes |
| **`Save`** | `{ user: 1, post: 1 }` | Unique compound: Prevents duplicate bookmarks |
| **`Story`** | `{ user: 1, createdAt: -1 }` | Active user stories |
| **`Story`** | `{ expiresAt: 1 }` | **TTL Index**: Automatic document deletion (`expireAfterSeconds: 0`) |
| **`Conversation`** | `{ participants: 1 }` | Lookup 1-on-1 direct message threads |
| **`Message`** | `{ conversation: 1, createdAt: -1 }` | Paginated chat message history |
| **`Notification`** | `{ recipient: 1, isRead: 1, createdAt: -1 }` | Unread notifications counter & badge |
| **`Block`** | `{ blocker: 1, blocked: 1 }` | Unique compound: Bidirectional visibility exclusion |
| **`Report`** | `{ status: 1, createdAt: -1 }` | Moderation dashboard queue |
| **`AuditLog`** | `{ timestamp: -1 }`, `{ targetType: 1, targetId: 1 }` | Security and compliance audit queries |
| **`Session`** | `{ expiresAt: 1 }` | **TTL Index**: Automatic refresh session cleanup |
| **`Session`** | `{ user: 1, tokenHash: 1 }` | Refresh token validation |
| **`PasswordResetToken`** | `{ expiresAt: 1 }` | **TTL Index**: Temporary reset token cleanup |
| **`EmailVerificationToken`**| `{ expiresAt: 1 }` | **TTL Index**: Verification link expiration |

---

## 4. Rolling Index Creation in Production

When adding new compound indexes in production on a MongoDB Replica Set (Primary-Secondary-Secondary), use a **rolling index build** to avoid saturating the primary node:

1. **Target Secondary Node 1**:
   - Step down secondary from read traffic or use direct connection.
   - Run index creation: `db.posts.createIndex({ tags: 1 }, { background: true })`.
   - Wait for index build completion.
2. **Target Secondary Node 2**:
   - Repeat the process for the second replica member.
3. **Step Down Primary**:
   - Issue `rs.stepDown()` on the Primary to elect one of the newly indexed Secondaries as the new Primary.
4. **Target Former Primary (Now Secondary)**:
   - Build the index on the demoted member.
   - Return replica set to balanced operational state.

*(Note: In MongoDB 4.2+, index builds do not lock the database globally, but still consume significant CPU, disk I/O, and cache memory).*

---

## 5. Idempotent Migration Script Pattern

For bulk data transforms or schema backfills, scripts must:
1. Be **idempotent** (safe to run multiple times without duplicating data or corrupting state).
2. Use **cursor batching** (`batchSize` or cursor loops) rather than loading entire collections into memory.
3. Log progress and handle errors gracefully.

### Reference Migration Template

```javascript
// server/scripts/migrations/20260920_backfill_user_settings.js
const mongoose = require('mongoose');
require('dotenv').config();

const BATCH_SIZE = 500;

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable missing');

  await mongoose.connect(uri);
  console.log('Connected to database for migration...');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  // 1. Find documents missing the target field (Idempotent filter)
  const filter = { notificationPreferences: { $exists: false } };
  const totalToUpdate = await usersCollection.countDocuments(filter);
  console.log(`Found ${totalToUpdate} users requiring migration`);

  let updatedCount = 0;
  const cursor = usersCollection.find(filter).batchSize(BATCH_SIZE);

  let bulkOps = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();

    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            notificationPreferences: { email: true, push: true, inApp: true },
            updatedAt: new Date()
          }
        }
      }
    });

    if (bulkOps.length >= BATCH_SIZE) {
      await usersCollection.bulkWrite(bulkOps, { ordered: false });
      updatedCount += bulkOps.length;
      console.log(`Migrated ${updatedCount}/${totalToUpdate} records...`);
      bulkOps = [];
    }
  }

  if (bulkOps.length > 0) {
    await usersCollection.bulkWrite(bulkOps, { ordered: false });
    updatedCount += bulkOps.length;
  }

  console.log(`Migration complete. Successfully updated ${updatedCount} records.`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

---

## 6. Rollback Protocol for Database Changes

Because databases contain stateful production data, **rolling back a container image does NOT roll back database changes**.

### Golden Rules of Database Rollback Safety
1. **Never drop collections or delete fields in the same release as application code changes.**
2. If application version `v2.4.0` must be rolled back to `v2.3.0`, the database schema must remain compatible with `v2.3.0`.
3. If destructive data transformations are required, create a complete physical or logical backup (`mongodump`) immediately prior to execution:
   ```bash
   mongodump --uri="$MONGODB_URI" --gzip --archive=/backups/pre_migration_$(date +%Y%m%d%H%M).gz
   ```
4. If a migration fails halfway through:
   - Identify the stopping point using migration status logs.
   - Fix the underlying cause or run the corresponding down-migration script using idempotent inverse operations (e.g. `$unset` newly added fields).
