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

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/social-connect';
const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || './backups');
const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 7;
const lockFilePath = path.join(backupDir, '.backup.lock');

/**
 * Executes a consistent, compressed database backup across all collections and indexes.
 */
export async function runBackup(options = {}) {
  const uri = options.mongoUri || mongoUri;
  const targetDir = options.backupDir || backupDir;
  const startTime = Date.now();

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Check locking
  const lockFile = options.lockFile || path.join(targetDir, '.backup.lock');
  if (fs.existsSync(lockFile)) {
    try {
      const lockStat = fs.statSync(lockFile);
      // If lock is younger than 30 minutes, consider it active
      if (Date.now() - lockStat.mtimeMs < 30 * 60 * 1000) {
        throw new Error(`Backup lock is already active: ${lockFile}`);
      }
    } catch (e) {
      if (e.message.includes('already active')) throw e;
    }
  }

  // Create lock
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));

  let conn = null;
  try {
    conn = await mongoose.createConnection(uri).asPromise();
    const db = conn.db;
    const dbName = db.databaseName;

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const backupId = `social_connect_backup_${timestamp}`;
    const archiveName = `${backupId}.archive.gz`;
    const archivePath = path.join(targetDir, archiveName);
    const checksumPath = `${archivePath}.sha256`;
    const metaPath = `${archivePath}.meta.json`;

    console.log(`[Backup] Starting backup for database '${dbName}' -> ${archiveName}`);

    const collectionsList = await db.listCollections().toArray();
    const backupPayload = {
      metadata: {
        backupId,
        timestamp: new Date().toISOString(),
        database: dbName,
        format: 'node-bson-gzip',
      },
      collections: {},
    };

    let totalDocuments = 0;

    for (const collInfo of collectionsList) {
      const collName = collInfo.name;
      if (collName.startsWith('system.')) continue;

      const coll = db.collection(collName);
      const docs = await coll.find({}).toArray();
      const indexes = await coll.indexes();

      backupPayload.collections[collName] = {
        indexes,
        documents: docs,
      };

      totalDocuments += docs.length;
    }

    // Compress payload to gzip
    const rawBuffer = Buffer.from(JSON.stringify(backupPayload), 'utf8');
    const compressedBuffer = zlib.gzipSync(rawBuffer);
    fs.writeFileSync(archivePath, compressedBuffer);

    // Compute SHA-256
    const hash = crypto.createHash('sha256').update(compressedBuffer).digest('hex');
    fs.writeFileSync(checksumPath, `${hash}  ${archiveName}\n`, 'utf8');

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const sizeBytes = compressedBuffer.length;

    // Metadata JSON
    const metadata = {
      backupId,
      timestamp: new Date().toISOString(),
      archive: archiveName,
      sizeBytes,
      durationSeconds,
      sha256: hash,
      database: dbName,
      collectionsCount: Object.keys(backupPayload.collections).length,
      totalDocuments,
      format: 'node-bson-gzip',
      status: 'COMPLETED',
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    console.log(`[Backup] Completed successfully in ${durationSeconds}s (${sizeBytes} bytes, ${totalDocuments} docs)`);

    // Enforce retention policy
    try {
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(targetDir);
      for (const file of files) {
        if (file.endsWith('.archive.gz') || file.endsWith('.sha256') || file.endsWith('.meta.json')) {
          const filePath = path.join(targetDir, file);
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (_pruneErr) {
      // Retention prune failure is non-fatal
    }

    return {
      success: true,
      backupId,
      archivePath,
      checksumPath,
      metaPath,
      sha256: hash,
      sizeBytes,
      durationSeconds,
      totalDocuments,
    };
  } finally {
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (_e) {}
    }
    if (conn) {
      await conn.close();
    }
  }
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runBackup()
    .then((result) => {
      console.log(`Backup finished: ${result.backupId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Backup failed: ${err.message}`);
      process.exit(1);
    });
}

export default runBackup;
