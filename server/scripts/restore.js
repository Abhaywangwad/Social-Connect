import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment configuration
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const defaultMongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-connect';

/**
 * Recursively walks a document and converts every 24-char hex string that is a
 * valid ObjectId back into a real mongoose.Types.ObjectId instance.
 *
 * This is necessary because JSON.stringify() serialises ObjectIds as plain
 * strings.  Without this conversion, FK reference fields (author, user, post,
 * sender, conversation, recipient, actor, etc.) remain as strings after restore
 * and break findOne({ _id: refValue }) lookups.
 *
 * @param {*} value - Any JS value (object, array, string, …)
 * @returns {*} The value with ObjectId strings replaced by ObjectId instances
 */
function deepConvertObjectIds(value) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => deepConvertObjectIds(item));
  }

  if (typeof value === 'string') {
    // Only convert strings that are exactly 24 hex chars — a precise ObjectId signature.
    if (/^[a-f\d]{24}$/i.test(value) && mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    return value;
  }

  if (typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepConvertObjectIds(v);
    }
    return result;
  }

  return value;
}

/**
 * Restores a compressed database backup archive into a target database.
 * Enforces confirmation guardrails to prevent accidental production overwrite.
 */
export async function runRestore(archivePath, options = {}) {
  const startTime = Date.now();
  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error(`Backup archive file not found: ${archivePath}`);
  }

  const isConfirmed = options.confirm === true || process.env.CONFIRM_RESTORE === 'YES';
  const targetDb = options.targetDb || null;

  // Derive target URI
  let uri = options.mongoUri || defaultMongoUri;
  if (targetDb) {
    const parsedUri = new URL(uri);
    parsedUri.pathname = `/${targetDb}`;
    uri = parsedUri.toString();
  }

  // Safety confirmation check
  const isProdDb = uri.includes('social-connect') && !uri.includes('test') && !uri.includes('restore');
  if (isProdDb && !isConfirmed) {
    throw new Error(
      '[SAFETY GUARD] Refusing to restore over production database without explicit confirmation (--confirm or CONFIRM_RESTORE=YES)'
    );
  }

  // 1. Verify SHA-256 checksum if companion file exists
  const checksumFile = `${archivePath}.sha256`;
  if (fs.existsSync(checksumFile)) {
    const expectedHash = fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
    const fileBuffer = fs.readFileSync(archivePath);
    const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (expectedHash !== actualHash) {
      throw new Error(`[FATAL] SHA-256 checksum verification failed! Expected ${expectedHash}, got ${actualHash}`);
    }
    console.log(`[Restore] SHA-256 checksum verified: ${actualHash}`);
  }

  // 2. Decompress archive
  const compressedBuffer = fs.readFileSync(archivePath);
  let payload = null;
  try {
    const decompressed = zlib.gunzipSync(compressedBuffer);
    payload = JSON.parse(decompressed.toString('utf8'));
  } catch (e) {
    throw new Error(`Failed to decompress or parse backup archive: ${e.message}`);
  }

  if (!payload || !payload.collections) {
    throw new Error('Invalid archive payload: missing collections');
  }

  // 3. Connect to target database
  let conn = null;
  try {
    conn = await mongoose.createConnection(uri).asPromise();
    const db = conn.db;
    const destDbName = db.databaseName;

    console.log(`[Restore] Restoring ${Object.keys(payload.collections).length} collections into '${destDbName}'...`);

    let totalRestoredDocs = 0;
    const restoredCollections = [];

    for (const [collName, collData] of Object.entries(payload.collections)) {
      const coll = db.collection(collName);

      // Drop existing collection to ensure clean restore
      try {
        await coll.drop();
      } catch (_dropErr) {
        // Collection may not exist yet
      }

      // Restore documents
      if (Array.isArray(collData.documents) && collData.documents.length > 0) {
        // Recursively convert all ObjectId-shaped strings back to ObjectId instances.
        // JSON serialisation flattens ObjectIds to their 24-char hex representation;
        // without this step, FK reference fields (author, user, post, sender, etc.)
        // would remain as plain strings and break findOne() lookups after restore.
        const docsToInsert = collData.documents.map((doc) => deepConvertObjectIds(doc));
        await coll.insertMany(docsToInsert, { ordered: false });
        totalRestoredDocs += docsToInsert.length;
      }

      // Recreate custom indexes (excluding standard _id_)
      if (Array.isArray(collData.indexes) && collData.indexes.length > 0) {
        const customIndexes = collData.indexes.filter((idx) => idx.name !== '_id_');
        for (const idx of customIndexes) {
          const { key, name, unique, sparse, expireAfterSeconds } = idx;
          const indexOptions = { name };
          if (unique) indexOptions.unique = true;
          if (sparse) indexOptions.sparse = true;
          if (typeof expireAfterSeconds === 'number') indexOptions.expireAfterSeconds = expireAfterSeconds;

          try {
            await coll.createIndex(key, indexOptions);
          } catch (idxErr) {
            console.warn(`[Restore] Notice on index '${name}' for '${collName}': ${idxErr.message}`);
          }
        }
      }

      restoredCollections.push(collName);
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Restore] Completed successfully in ${durationSeconds}s (${totalRestoredDocs} docs restored across ${restoredCollections.length} collections)`);

    return {
      success: true,
      database: destDbName,
      restoredCollections,
      totalRestoredDocs,
      durationSeconds,
    };
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const archiveArg = process.argv[2];
  const confirmArg = process.argv.includes('--confirm');
  const targetDbArg = (process.argv.find((a) => a.startsWith('--targetDb=')) || '').split('=')[1];

  runRestore(archiveArg, { confirm: confirmArg, targetDb: targetDbArg })
    .then((result) => {
      console.log(`Restore finished for database: ${result.database}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Restore failed: ${err.message}`);
      process.exit(1);
    });
}

export default runRestore;
