#!/usr/bin/env bash
#
# Cloud-vs-self-host schema-parity diff (off-cloud §0 workstream 3, Step 4).
#
# The self-host schema is REBUILT from supabase/migrations/*, not cloned from
# cloud. This proves "exactly as-is held": it dumps the schema-only DDL from
# both the cloud project and the running self-host Postgres and diffs them,
# catching any out-of-band cloud drift (manual dashboard SQL, hand-toggled
# RLS / grants) that never made it into the repo migrations.
#
# READ-ONLY on both ends: pg_dump --schema-only + SELECTs. CLOUD_DB_URI must
# never be used for anything but --schema-only / SELECT.
#
# Both dumps run through the PG17 client INSIDE the supabase-db container so
# client-version differences (host pg_dump is 15.x) don't show up as noise.
#
# Primary verdict = the `public` schema diff (the real drift risk). auth/storage
# DDL diffs are produced too, but image-version differences there are expected
# noise — classify, don't fail on them.
#
# Usage:  bash infra/supabase/checks/schema-parity.sh
# Output: docs/checks/schema-parity-cloud-vs-selfhost.md (archived verdict)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLOUD_ENV="$REPO_ROOT/infra/supabase/migrate/.env.cloud"
DB_CONTAINER="supabase-db"
ARCHIVE="$REPO_ROOT/docs/checks/schema-parity-cloud-vs-selfhost.md"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -f "$CLOUD_ENV" ] || { echo "FATAL: $CLOUD_ENV not found" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; source "$CLOUD_ENV"; set +a
[ -n "${CLOUD_DB_URI:-}" ] || { echo "FATAL: CLOUD_DB_URI unset" >&2; exit 1; }
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || { echo "FATAL: $DB_CONTAINER not running" >&2; exit 1; }

SCHEMAS=(public auth storage)
DUMP_FLAGS=(--schema-only --no-owner --no-privileges)

# Strip volatile / version-specific noise so a real DDL drift stands out.
normalize() {
  # `|| true`: grep -v exits 1 when it filters out every line (all-noise schema);
  # under `set -o pipefail` that would abort the script. pg_dump failures upstream
  # still propagate (pipefail returns the upstream non-zero).
  grep -vE '^(--|SET |SELECT pg_catalog\.set_config|\\restrict|\\unrestrict)' | grep -vE '^[[:space:]]*$' || true
}

dump() { # $1=source label, $2=schema, $3..=extra pg_dump conn args
  local schema="$2"; shift 2
  docker exec "$DB_CONTAINER" pg_dump "${DUMP_FLAGS[@]}" --schema="$schema" "$@"
}

# Portable (bash 3.2): per-schema changed-line count stored in $WORK/lines.<schema>.
difflines() { cat "$WORK/lines.$1"; }

echo "Dumping schemas: ${SCHEMAS[*]}"
DRIFT=0

for schema in "${SCHEMAS[@]}"; do
  dump cloud "$schema" "$CLOUD_DB_URI"            | normalize > "$WORK/cloud.$schema.sql"
  dump self  "$schema" -U postgres -d postgres    | normalize > "$WORK/self.$schema.sql"
  if diff -u "$WORK/cloud.$schema.sql" "$WORK/self.$schema.sql" > "$WORK/diff.$schema.txt"; then
    echo 0 > "$WORK/lines.$schema"
  else
    # `^[+-][^+-]` matches changed lines only, not the +++/--- diff headers, so the
    # displayed count isn't inflated by 2. Display column only — the verdict is the diff exit code.
    grep -cE '^[+-][^+-]' "$WORK/diff.$schema.txt" > "$WORK/lines.$schema" || true
    [ "$schema" = "public" ] && DRIFT=1
  fi
done

# Non-DB settings: storage.buckets rows.
psql_cloud() { docker exec "$DB_CONTAINER" psql "$CLOUD_DB_URI" -tAc "$1"; }
psql_self()  { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "$1"; }
BUCKETS_Q="select id,name,public,file_size_limit,coalesce(array_to_string(allowed_mime_types,','),'') from storage.buckets order by 1"
psql_cloud "$BUCKETS_Q" > "$WORK/buckets.cloud.txt"
psql_self  "$BUCKETS_Q" > "$WORK/buckets.self.txt"
BUCKETS_DIFF="$(diff -u "$WORK/buckets.cloud.txt" "$WORK/buckets.self.txt" || true)"

VERDICT=$([ "$DRIFT" -eq 0 ] && echo "PARITY (public schema identical)" || echo "DRIFT in public schema — investigate")

{
  echo "# Schema parity — cloud vs self-host"
  echo
  echo "_Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ) by infra/supabase/checks/schema-parity.sh_"
  echo
  echo "**Verdict: $VERDICT**"
  echo
  echo "> This file is **auto-generated** — do not hand-edit. The durable human"
  echo "> classification of each diff + decisions taken lives in"
  echo "> [\`schema-parity-notes.md\`](schema-parity-notes.md)."
  echo
  echo "Schema-only DDL dumped from both ends via the PG17 client in \`$DB_CONTAINER\`,"
  echo "normalized (comments / SET / set_config / restrict markers / blank lines stripped),"
  echo "then \`diff -u\` (cloud = left/-, self-host = right/+)."
  echo
  echo "| Schema | Changed diff lines | Notes |"
  echo "|---|---|---|"
  for schema in "${SCHEMAS[@]}"; do
    note="-"
    [ "$schema" = "public" ] && note="**primary verdict** (manual SQL / RLS / grants drift)"
    [ "$schema" != "public" ] && note="supabase-managed; image-version differences expected"
    echo "| \`$schema\` | $(difflines "$schema") | $note |"
  done
  echo
  for schema in "${SCHEMAS[@]}"; do
    echo "## \`$schema\` schema diff"
    echo
    if [ "$(difflines "$schema")" -eq 0 ]; then
      echo "_No differences._"
    else
      echo '```diff'
      cat "$WORK/diff.$schema.txt"
      echo '```'
    fi
    echo
  done
  echo "## storage.buckets"
  echo
  if [ -z "$BUCKETS_DIFF" ]; then
    echo "_Identical._"
  else
    echo '```diff'
    echo "$BUCKETS_DIFF"
    echo '```'
  fi
  echo
  echo "## Manual checks (not auto-diffable)"
  echo
  echo "- **GoTrue/auth config** (lives in GoTrue env, not the DB): compare the cloud"
  echo "  dashboard Auth settings against \`infra/supabase/.env\` — SITE_URL / redirect"
  echo "  URLs, JWT expiry, password policy, mailer/SMTP, external providers."
  echo "- **Hooks / webhooks / cron**: \`supabase_functions\` + \`net\` rows both sides"
  echo "  (no \`cron\` schema present → pg_cron N/A)."
} > "$ARCHIVE"

echo
echo "Verdict: $VERDICT"
echo "Archived: $ARCHIVE"
[ "$DRIFT" -eq 0 ] || exit 2
