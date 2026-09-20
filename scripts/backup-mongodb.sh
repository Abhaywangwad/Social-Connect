#!/usr/bin/env bash
# ==============================================================================
# Social Connect — MongoDB Production Backup Script
# ==============================================================================
# Creates a compressed, consistent MongoDB archive backup, generates a SHA-256
# checksum, records operational metadata, and enforces the retention policy.
# ==============================================================================

set -eo pipefail

START_TIME=$(date +%s)
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOCK_FILE="/tmp/social_connect_mongodb_backup.lock"

# 1. Ensure required environment variables
if [ -z "$MONGODB_URI" ]; then
  echo "[ERROR] MONGODB_URI environment variable is not set." >&2
  exit 1
fi

# 2. Check if mongodump exists
if ! command -v mongodump >/dev/null 2>&1; then
  echo "[ERROR] 'mongodump' command not found. Install mongodb-database-tools." >&2
  exit 1
fi

# 3. Prevent overlapping executions via process lockfile
exec 200>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 200 || { echo "[WARN] A backup job is already in progress. Exiting." >&2; exit 0; }
fi

mkdir -p "$BACKUP_DIR"

BACKUP_ID="social_connect_backup_${TIMESTAMP}"
ARCHIVE_NAME="${BACKUP_ID}.archive.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
CHECKSUM_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}.sha256"
META_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}.meta.json"

echo "[INFO] Starting MongoDB backup at $(date -u +"%Y-%m-%dT%H:%M:%SZ")..."
echo "[INFO] Backup ID: ${BACKUP_ID}"

# 4. Execute mongodump with gzip compression
if ! mongodump --uri="$MONGODB_URI" --archive="$ARCHIVE_PATH" --gzip 2>/dev/null; then
  echo "[ERROR] mongodump failed." >&2
  rm -f "$ARCHIVE_PATH"
  exit 1
fi

# 5. Verify artifact exists and has non-zero size
if [ ! -s "$ARCHIVE_PATH" ]; then
  echo "[ERROR] Backup archive was not created or is empty: ${ARCHIVE_PATH}" >&2
  exit 1
fi

ARCHIVE_SIZE=$(wc -c < "$ARCHIVE_PATH" | tr -d ' ')

# 6. Generate SHA-256 checksum
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  SHA256=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
else
  SHA256="checksum_tool_missing"
fi

echo "${SHA256}  ${ARCHIVE_NAME}" > "$CHECKSUM_PATH"

# 7. Write companion metadata JSON (no secrets included)
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

cat <<EOF > "$META_PATH"
{
  "backupId": "${BACKUP_ID}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "archive": "${ARCHIVE_NAME}",
  "sizeBytes": ${ARCHIVE_SIZE},
  "durationSeconds": ${DURATION},
  "sha256": "${SHA256}",
  "format": "mongodump-archive-gzip",
  "status": "COMPLETED"
}
EOF

echo "[INFO] Backup completed successfully in ${DURATION}s."
echo "[INFO] Size: ${ARCHIVE_SIZE} bytes | SHA256: ${SHA256}"

# 8. Apply Retention Policy (Prune archives older than RETENTION_DAYS)
echo "[INFO] Enforcing retention policy: pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -type f \( -name "*.archive.gz" -o -name "*.sha256" -o -name "*.meta.json" \) -mtime "+${RETENTION_DAYS}" -exec rm -f {} +

exit 0
