#!/usr/bin/env bash
# ==============================================================================
# Social Connect — MongoDB Backup Verification Script
# ==============================================================================
# Validates archive integrity, verifies SHA-256 checksums, and confirms that
# the backup is readable and uncorrupted.
# ==============================================================================

set -eo pipefail

ARCHIVE_PATH="$1"

if [ -z "$ARCHIVE_PATH" ]; then
  echo "Usage: $0 <path-to-archive.gz>" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "[ERROR] Backup archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

echo "[INFO] Verifying backup artifact: ${ARCHIVE_PATH}"

# 1. Non-zero size check
if [ ! -s "$ARCHIVE_PATH" ]; then
  echo "[FAIL] Backup artifact is empty (0 bytes)." >&2
  exit 1
fi

# 2. Gzip stream integrity check
if command -v gzip >/dev/null 2>&1; then
  if ! gzip -t "$ARCHIVE_PATH" 2>/dev/null; then
    echo "[FAIL] Archive compression integrity check failed (corrupted gzip stream)." >&2
    exit 1
  fi
  echo "[PASS] Gzip compression stream is valid and readable."
fi

# 3. SHA-256 Checksum validation
CHECKSUM_FILE="${ARCHIVE_PATH}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  EXPECTED_SHA=$(awk '{print $1}' "$CHECKSUM_FILE")
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
  else
    ACTUAL_SHA=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')
  fi

  if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "[FAIL] SHA-256 checksum mismatch!" >&2
    echo "  Expected: ${EXPECTED_SHA}" >&2
    echo "  Actual:   ${ACTUAL_SHA}" >&2
    exit 1
  fi
  echo "[PASS] SHA-256 checksum matches: ${ACTUAL_SHA}"
else
  echo "[WARN] Companion .sha256 checksum file not found."
fi

# 4. Metadata verification
META_FILE="${ARCHIVE_PATH}.meta.json"
if [ -f "$META_FILE" ]; then
  echo "[PASS] Companion metadata JSON exists:"
  cat "$META_FILE"
fi

echo "=========================================================="
echo "[SUCCESS] Backup verification passed without errors."
echo "=========================================================="
exit 0
