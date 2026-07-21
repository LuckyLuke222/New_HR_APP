#!/usr/bin/env bash
#
# KushHR self-host backup — encrypted, local, restorable (off-cloud §0, Step 3C).
#
# Dumps the two stateful stores of the self-hosted stack and writes ENCRYPTED archives:
#   1. Postgres  — full `pg_dump -Fc` of the `postgres` database (schema + data, all schemas:
#                  auth, storage, public, …) via the running supabase-db container.
#   2. Storage   — tar of the `storage-data` named volume (the hr-documents blobs).
# Both are encrypted at rest with openssl AES-256-CBC + PBKDF2 (passphrase in ./backup.key,
# gitignored). A sha256 manifest is written for integrity. Old archives are pruned to the
# RETENTION most recent of each kind.
#
# Run from anywhere; paths are resolved relative to this script.
#   ./backup.sh
# Schedule: see README.md (cron / launchd line). The OFF-SITE upload is a marked TODO below.
#
set -euo pipefail

# ---- config ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${SCRIPT_DIR}/backup.key"
OUT_DIR="${SCRIPT_DIR}/../backups"            # infra/supabase/backups (gitignored)
RETENTION="${RETENTION:-7}"                   # keep N most recent of each archive kind
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
STORAGE_VOLUME="${STORAGE_VOLUME:-supabase_storage-data}"
PBKDF2_ITERS=600000
TS="$(date +%Y%m%d-%H%M%S)"

ENC() { openssl enc -aes-256-cbc -pbkdf2 -iter "${PBKDF2_ITERS}" -salt -pass "file:${KEY_FILE}"; }

# ---- preflight ------------------------------------------------------------
mkdir -p "${OUT_DIR}"

if [ ! -f "${KEY_FILE}" ]; then
  echo "backup.key not found — generating a new random passphrase at ${KEY_FILE}"
  echo "  *** SAVE THIS KEY OFF-MACHINE. Losing it makes every backup unrecoverable. ***"
  openssl rand -base64 48 > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "ERROR: ${DB_CONTAINER} is not running — start the stack before backing up." >&2
  exit 1
fi

DB_ENC="${OUT_DIR}/db-${TS}.dump.enc"
ST_ENC="${OUT_DIR}/storage-${TS}.tar.gz.enc"

# ---- 1. Postgres ----------------------------------------------------------
# Stage to .tmp and mv only on full success, so a mid-pipe failure (pipefail) or a
# partial pg_dump never leaves a truncated archive that retention/manifest treat as valid.
echo "[1/3] pg_dump (custom format) -> ${DB_ENC}"
docker exec "${DB_CONTAINER}" pg_dump -U postgres -Fc postgres | ENC > "${DB_ENC}.tmp"
mv "${DB_ENC}.tmp" "${DB_ENC}"

# ---- 2. Storage volume ----------------------------------------------------
echo "[2/3] tar storage volume ${STORAGE_VOLUME} -> ${ST_ENC}"
docker run --rm -v "${STORAGE_VOLUME}":/data:ro alpine tar -czf - -C /data . | ENC > "${ST_ENC}.tmp"
mv "${ST_ENC}.tmp" "${ST_ENC}"

# ---- 3. Integrity manifest + retention ------------------------------------
echo "[3/3] checksums + retention (keep ${RETENTION})"
( cd "${OUT_DIR}" && shasum -a 256 "$(basename "${DB_ENC}")" "$(basename "${ST_ENC}")" >> manifest.sha256 )

prune() {  # $1 = glob prefix
  ls -1t "${OUT_DIR}"/${1}-*.enc 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
    echo "  pruning $(basename "${old}")"; rm -f "${old}"
  done
}
prune db
prune storage

echo "OK  db=$(du -h "${DB_ENC}" | cut -f1)  storage=$(du -h "${ST_ENC}" | cut -f1)  at ${OUT_DIR}"

# ---- OFF-SITE (deferred) --------------------------------------------------
# Wire the off-site destination here once chosen (S3-compatible bucket / NAS / second host).
# Example (S3): aws s3 cp "${DB_ENC}" "s3://<bucket>/kushhr/" && aws s3 cp "${ST_ENC}" "s3://<bucket>/kushhr/"
# OFF-SITE: upload "${DB_ENC}" and "${ST_ENC}" to <destination>
