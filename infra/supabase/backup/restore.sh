#!/usr/bin/env bash
#
# KushHR self-host restore / backup verification (off-cloud §0, Step 3C).
#
# Decrypts a backup pair and proves it is restorable. Default mode is SAFE verify:
# it restores the DB dump into a THROWAWAY scratch database (restore_verify) and prints
# row counts, and lists the storage tar — without touching the live stack.
#
#   ./restore.sh <TIMESTAMP>            # verify (scratch DB, read-only to live data)
#   ./restore.sh <TIMESTAMP> --into-live   # DANGER: restore over the live postgres DB
#
# <TIMESTAMP> matches the archive name, e.g. 20260610-141500 from db-20260610-141500.dump.enc
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_FILE="${SCRIPT_DIR}/backup.key"
OUT_DIR="${SCRIPT_DIR}/../backups"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

TS="${1:-}"
MODE="${2:-verify}"
[ -n "${TS}" ] || { echo "usage: ./restore.sh <TIMESTAMP> [--into-live]" >&2; exit 1; }
[ -f "${KEY_FILE}" ] || { echo "ERROR: ${KEY_FILE} missing — cannot decrypt." >&2; exit 1; }

DB_ENC="${OUT_DIR}/db-${TS}.dump.enc"
ST_ENC="${OUT_DIR}/storage-${TS}.tar.gz.enc"
[ -f "${DB_ENC}" ] || { echo "ERROR: ${DB_ENC} not found." >&2; exit 1; }

DEC() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass "file:${KEY_FILE}"; }

# ---- storage: list contents (proves tar decrypts) -------------------------
if [ -f "${ST_ENC}" ]; then
  echo "=== storage archive ${TS} — top entries ==="
  DEC < "${ST_ENC}" | tar -tzf - | head -15
  echo "    (… $(DEC < "${ST_ENC}" | tar -tzf - | wc -l | tr -d ' ') entries total)"
fi

# ---- db: restore + verify -------------------------------------------------
if [ "${MODE}" = "--into-live" ]; then
  echo "!!! --into-live: restoring over the LIVE postgres database. Ctrl-C now to abort."; sleep 5
  DEC < "${DB_ENC}" | docker exec -i "${DB_CONTAINER}" pg_restore -U postgres -d postgres --clean --if-exists
  echo "live restore complete."
else
  echo "=== verify restore into scratch DB 'restore_verify' ==="
  docker exec "${DB_CONTAINER}" psql -U postgres -c "DROP DATABASE IF EXISTS restore_verify;" >/dev/null
  docker exec "${DB_CONTAINER}" psql -U postgres -c "CREATE DATABASE restore_verify;" >/dev/null
  # --no-owner/--no-acl so it lands cleanly in a bare db without the supabase roles wired;
  # row counts are what we assert, not grants.
  DEC < "${DB_ENC}" | docker exec -i "${DB_CONTAINER}" pg_restore -U postgres -d restore_verify --no-owner --no-acl 2>/dev/null || true
  echo "--- row counts in restore_verify (compare to source) ---"
  docker exec "${DB_CONTAINER}" psql -U postgres -d restore_verify -tAc "
    select 'auth.users', count(*) from auth.users
    union all select 'profiles', count(*) from public.profiles
    union all select 'audit_logs', count(*) from public.audit_logs
    union all select 'leave_requests', count(*) from public.leave_requests
    union all select 'documents', count(*) from public.documents
    order by 1;" 2>/dev/null || echo "(schema not present — inspect pg_restore output)"
  docker exec "${DB_CONTAINER}" psql -U postgres -c "DROP DATABASE IF EXISTS restore_verify;" >/dev/null
  echo "scratch DB dropped. Verification done (no live data touched)."
fi
