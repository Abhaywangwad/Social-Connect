#!/usr/bin/env bash
# ==============================================================================
# Social Connect — MongoDB Production Restore Script
# ==============================================================================
# Restores a compressed MongoDB archive backup. Requires explicit confirmation
# to prevent accidental production database overwrites.
# ==============================================================================

set -eo pipefail

ARCHIVE_PATH="$1"
CONFIRM_FLAG="$2"
TARGET_DB="${TARGET_DB:-}"

if [ -z "$ARCHIVE_PATH" ]; then
  echo "Usage: $0 <path-to-archive.gz> [--confirm] [--target-db <database_name>]" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "[ERROR] Backup archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

# 1. Require explicit confirmation
if [ "$CONFIRM_FLAG" != "--confirm" ] && [ "$CONFIRM_RESTORE" != "YES" ]; then
  echo "======================================================================" >&2
  echo "[SAFETY GUARD] Restoring a database will overwrite/modify data!" >&2
  echo "To proceed, you must pass '--confirm' as the second argument or set" >&2
  echo "the environment variable: CONFIRM_RESTORE=YES" >&2
  echo "======================================================================" >&2
  exit 1
fi

# 2. Ensure MONGODB_URI is provided
if [ -z "$MONGODB_URI" ]; then
  echo "[ERROR] MONGODB_URI environment variable is not set." >&2
  exit 1
fi

# 3. Check if mongorestore exists
if ! command -v mongorestore >/dev/null 2>&1; then
  echo "[ERROR] 'mongorestore' command not found. Install mongodb-database-tools." >&2
  exit 1
fi

# 4. Checksum verification if .sha256 companion file exists
CHECKSUM_FILE="${ARCHIVE_PATH}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  echo "[INFO] Verifying SHA-256 checksum..."
  EXPECTED_SHA=$(awk '{print $1}' "$CHECKSUM_FILE")
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
  else
    ACTUAL_SHA=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
  fi

  if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "[FATAL] Checksum verification failed!" >&2
    echo "Expected: ${EXPECTED_SHA}" >&2
    echo "Actual:   ${ACTUAL_SHA}" >&2
    exit 1
  fi
  echo "[INFO] Checksum verified: ${ACTUAL_SHA}"
fi

echo "[INFO] Initiating database restore from ${ARCHIVE_PATH}..."
START_TIME=$(date +%s)

# 5. Build mongorestore command
RESTORE_ARGS=(
  "--uri=${MONGODB_URI}"
  "--archive=${ARCHIVE_PATH}"
  "--gzip"
  "--drop"
)

if [ -n "$TARGET_DB" ]; then
  echo "[INFO] Restoring into isolated target database: ${TARGET_DB}"
  RESTORE_ARGS+=("--nsFrom=*.*" "--nsTo=${TARGET_DB}.*")
fi

# 6. Execute restore
if ! mongorestore "${RESTORE_ARGS[@]}" 2>/dev/null; then
  echo "[ERROR] mongorestore execution failed." >&2
  exit 1
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "[INFO] Database restore completed successfully in ${DURATION}s."
exit 0
