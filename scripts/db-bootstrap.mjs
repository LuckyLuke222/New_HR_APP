#!/usr/bin/env node

/**
 * Fresh-DB bootstrap for a self-hosted KushHR instance.
 *
 * `docker compose up` brings up Supabase's services but does NOT apply
 * KushHR's schema or demo data. This script does that one-time step:
 * it applies every migration in `supabase/migrations/` (numeric order)
 * plus `supabase/seed.sql` to the running `supabase-db` container.
 *
 * FRESH-ONLY by design. The migrations are NOT tracked and NOT idempotent
 * (bare `create table`/`create index`, no `schema_migrations`), so
 * re-running the bundle against an already-initialized DB halts partway
 * with `already exists` under `ON_ERROR_STOP=1`. To stay safe to run twice
 * — and safe against a DB that holds real data — we probe first:
 *
 *   - schema already present (`public.profiles` exists) -> no-op, exit 0
 *   - DB fresh (no `public.profiles`)                    -> apply
 *   - probe can't reach the DB / errors                  -> abort, exit 1
 *     (fail-safe: never apply on an ambiguous probe)
 *
 * The apply runs as `supabase_admin` (the self-host superuser), NOT
 * `postgres`: some migrations create indexes on `auth.users` (owned by
 * `supabase_auth_admin`), which the non-superuser `postgres` role cannot
 * (`ERROR: must be owner of table users`). The read-only probe uses
 * `postgres` — no superuser needed for a `to_regclass` read.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTAINER = "supabase-db";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");
const seedFile = path.join(repoRoot, "supabase", "seed.sql");

/** Run psql inside the db container. `input` (if given) is piped to stdin. */
function psql({ user, args = [], input }) {
  return spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", user, "-d", "postgres", ...args],
    { input, encoding: "utf8" },
  );
}

function fail(message, detail) {
  console.error(`\n✖ ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(1);
}

// ── 1. Probe: is the schema already applied? ────────────────────────────────
// `to_regclass` returns a `regclass`, which renders as the *minimal* name
// (just `profiles` when `public` is on the search_path) — so compare a
// search-path-independent boolean (`t`/`f`), not the schema-qualified string.
const probe = psql({
  user: "postgres",
  args: ["-tAc", "select to_regclass('public.profiles') is not null"],
});

if (probe.error || probe.status !== 0) {
  // Container not found, DB not accepting connections, psql error, etc.
  fail(
    `Can't reach the "${CONTAINER}" database container. Is the stack up?\n` +
      `  Start it from infra/supabase, then re-run: npm run db:bootstrap`,
    probe.stderr || String(probe.error || ""),
  );
}

const schemaPresent = (probe.stdout || "").trim() === "t";
if (schemaPresent) {
  console.log(
    "✓ Database already initialized — skipping.\n" +
      "  (To start over from an empty DB, run infra/supabase/reset.sh, bring the\n" +
      "   stack back up, then re-run: npm run db:bootstrap)",
  );
  process.exit(0);
}

// ── 2. Apply: migrations (numeric order) + seed ─────────────────────────────
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // zero-padded names -> lexical sort == numeric order

if (migrationFiles.length === 0) {
  fail(`No migrations found in ${migrationsDir}`);
}

const bundle =
  migrationFiles
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n") +
  "\n" +
  fs.readFileSync(seedFile, "utf8");

console.log(
  `Applying ${migrationFiles.length} migrations + seed to "${CONTAINER}" (as supabase_admin)…`,
);

const apply = psql({
  user: "supabase_admin",
  args: ["-v", "ON_ERROR_STOP=1"],
  input: bundle,
});

if (apply.stdout) process.stdout.write(apply.stdout);
if (apply.status !== 0) {
  fail(
    "Apply halted on an error (ON_ERROR_STOP=1) — the DB may be half-applied.\n" +
      "  Reset it (infra/supabase/reset.sh), bring the stack up, then re-run.",
    apply.stderr,
  );
}

// ── 3. Confirm: the demo users exist ────────────────────────────────────────
const verify = psql({
  user: "postgres",
  args: [
    "-tAc",
    "select email from auth.users where email like '%@kushhr.dev' order by email",
  ],
});

const users = (verify.stdout || "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (verify.status !== 0 || users.length === 0) {
  fail(
    "Apply finished but the demo users were not found — seed may not have run.",
    verify.stderr,
  );
}

console.log(`\n✓ Bootstrap complete. Demo accounts (password: TestPass123!):`);
for (const email of users) console.log(`    ${email}`);
