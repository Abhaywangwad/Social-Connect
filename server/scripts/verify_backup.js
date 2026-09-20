import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

/**
 * Validates a backup archive's integrity, checks SHA-256 hash, and inspects collection contents.
 */
export function verifyBackupArchive(archivePath) {
  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error(`Backup archive not found: ${archivePath}`);
  }

  const stat = fs.statSync(archivePath);
  if (stat.size === 0) {
    throw new Error(`Backup archive is empty (0 bytes): ${archivePath}`);
  }

  // 1. Validate SHA-256 Checksum
  const checksumFile = `${archivePath}.sha256`;
  let shaVerified = false;
  if (fs.existsSync(checksumFile)) {
    const expectedHash = fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
    const fileBuffer = fs.readFileSync(archivePath);
    const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (expectedHash !== actualHash) {
      throw new Error(`SHA-256 checksum mismatch! Expected: ${expectedHash}, Actual: ${actualHash}`);
    }
    shaVerified = true;
  }

  // 2. Validate GZIP Decompression & JSON Parse
  const compressedBuffer = fs.readFileSync(archivePath);
  let payload = null;
  try {
    const decompressed = zlib.gunzipSync(compressedBuffer);
    payload = JSON.parse(decompressed.toString('utf8'));
  } catch (e) {
    throw new Error(`Archive decompression or parsing failed: ${e.message}`);
  }

  if (!payload || !payload.collections) {
    throw new Error('Archive missing required "collections" structure');
  }

  const collections = Object.keys(payload.collections);
  const collectionSummaries = {};
  let totalDocs = 0;

  for (const [name, data] of Object.entries(payload.collections)) {
    const count = Array.isArray(data.documents) ? data.documents.length : 0;
    const indexCount = Array.isArray(data.indexes) ? data.indexes.length : 0;
    collectionSummaries[name] = { count, indexCount };
    totalDocs += count;
  }

  return {
    valid: true,
    shaVerified,
    sizeBytes: stat.size,
    backupId: payload.metadata?.backupId || 'unknown',
    timestamp: payload.metadata?.timestamp || null,
    collectionsCount: collections.length,
    totalDocuments: totalDocs,
    collections: collectionSummaries,
  };
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const archiveArg = process.argv[2];
  try {
    const result = verifyBackupArchive(archiveArg);
    console.log('====================================================');
    console.log(`[Backup Verify] PASS: Archive is valid and uncorrupted`);
    console.log(`Backup ID:   ${result.backupId}`);
    console.log(`Size:        ${result.sizeBytes} bytes`);
    console.log(`Collections: ${result.collectionsCount}`);
    console.log(`Total Docs:  ${result.totalDocuments}`);
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error(`[Backup Verify] FAIL: ${err.message}`);
    process.exit(1);
  }
}

export default verifyBackupArchive;
