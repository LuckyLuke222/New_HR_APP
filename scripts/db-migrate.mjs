#!/usr/bin/env node

/**
 * Incremental migration runner for a self-hosted KushHR instance.
 *
 * Companion to `db-bootstrap.mjs`. Bootstrap is FRESH-ONLY (bundles every
 * migration + seed, no-ops once `public.profiles` exists); it cannot apply a
 * *new* migration to a server that already holds real data. This tool can:
 * it keeps a ledger of applied migrations and applies only the pending ones.
 *
 *   npm run db:migrate              # apply pending migrations (incremental)
 *   npm run db:migrate -- --list    # dry-run: print pending, apply nothing
 *   npm run db:migrate -- --backfill  # one-time: record current files as applied
 *
 * Ledger: `kushhr_migrations.applied(filename, checksum, applied_at)`. A
 * dedicated non-`public` schema so PostgREST never exposes it via the REST API
 * and no RLS is needed.
 *
 * Apply runs as `supabase_admin` (superuser) — some migrations index
 * `auth.users` (owned by `supabase_auth_admin`), which `postgres` cannot. The
 * read-only probe uses `postgres`. (Same split as `db-bootstrap.mjs`.)
 *
 * Each pending migration is applied in its OWN transaction together with its
 * ledger insert (`--single-transaction -v ON_ERROR_STOP=1`), so apply+record is
 * atomic: a failure rolls that migration back, leaves the ledger untouched, and
 * aborts naming the file. All KushHR migrations are transaction-safe (no
 * CONCURRENTLY/VACUUM/REINDEX).
 *
 * Migrations are append-only: editing an already-applied file changes its
 * checksum and is rejected (drift guard).
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTAINER = "supabase-db";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const args = new Set(process.argv.slice(2));
const LIST = args.has("--list");
const BACKFILL = args.has("--backfill");

/** Run psql inside the db container. `input` (if given) is piped to stdin. */
function psql({ user, args: psqlArgs = [], input }) {
  return spawnSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", user, "-d", "postgres", ...psqlArgs],
    { input, encoding: "utf8" },
  );
}

// Prints psql stderr verbatim — fine for a local operator-run tool. If db:migrate is
// ever wired into CI, mask/suppress its output (strip to exit status) so psql error
// context doesn't land in world-readable logs.
function fail(message, detail) {
  console.error(`\n✖ ${message}`);
  if (detail) console.error(String(detail).trim());
  process.exit(1);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Migration files in numeric (== lexical, zero-padded) order, with checksums. */
function readMigrations() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) fail(`No migrations found in ${migrationsDir}`);
  return files.map((filename) => {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
    return { filename, sql, checksum: sha256(sql) };
  });
}

/** Single-quote escape for a SQL string literal. */
function lit(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

// ── 1. Probe: is the DB reachable, and is the schema present? ────────────────
const probe = psql({
  user: "postgres",
  args: ["-tAc", "select to_regclass('public.profiles') is not null"],
});

if (probe.error || probe.status !== 0) {
  fail(
    `Can't reach the "${CONTAINER}" database container. Is the stack up?\n` +
      `  Start it from infra/supabase, then re-run: npm run db:migrate`,
    probe.stderr || String(probe.error || ""),
  );
}
const schemaPresent = (probe.stdout || "").trim() === "t";

// ── 2. Read the applied set, tolerating a not-yet-created ledger ────────────
// The ledger is created LAZILY — only just before we actually write (backfill or
// apply). A pure refusal (fresh DB, or populated-without-`--backfill`) must touch
// nothing, so we never create the ledger on a path that aborts.
//
// search_path pinned to pg_catalog so the (fully-qualified) ledger DDL can't be
// redirected by a rogue object earlier in the session search_path. Safe here
// because every name is qualified; NOT done on the apply path (see below).
const ledgerDdl = `
set search_path = pg_catalog, pg_temp;
create schema if not exists kushhr_migrations;
create table if not exists kushhr_migrations.applied (
  filename   text primary key,
  checksum   text not null,
  applied_at timestamptz not null default now()
);`;

function ensureLedger() {
  const ensure = psql({
    user: "supabase_admin",
    args: ["-v", "ON_ERROR_STOP=1"],
    input: ledgerDdl,
  });
  if (ensure.status !== 0) fail("Could not create the migration ledger.", ensure.stderr);
}

const ledgerExists =
  (
    psql({
      user: "postgres",
      args: ["-tAc", "select to_regclass('kushhr_migrations.applied') is not null"],
    }).stdout || ""
  ).trim() === "t";

const applied = new Map();
if (ledgerExists) {
  const read = psql({
    user: "postgres",
    args: [
      "-tAF",
      "\t",
      "-c",
      "select filename, checksum from kushhr_migrations.applied order by filename",
    ],
  });
  if (read.status !== 0) fail("Could not read the migration ledger.", read.stderr);
  for (const line of (read.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [filename, checksum] = line.split("\t");
    applied.set(filename, checksum);
  }
}

const migrations = readMigrations();

// ── 4. Ledger empty: fresh DB (→bootstrap) or populated pre-ledger (→backfill) ─
if (applied.size === 0) {
  if (!schemaPresent) {
    fail(
      "DB not initialized (no public.profiles, empty ledger).\n" +
        "  Run the first-boot bundle instead:  npm run db:bootstrap",
    );
  }
  // Populated DB with no ledger.
  if (!BACKFILL) {
    fail(
      "Populated DB with no migration ledger.\n" +
        "  If this DB already has ALL current migrations applied, record them:\n" +
        "    npm run db:migrate -- --backfill\n" +
        "  Otherwise investigate before migrating.",
    );
  }
  ensureLedger();
  const values = migrations
    .map((m) => `(${lit(m.filename)}, ${lit(m.checksum)})`)
    .join(",\n  ");
  const backfill = psql({
    user: "supabase_admin",
    args: ["-v", "ON_ERROR_STOP=1"],
    input: `set search_path = pg_catalog, pg_temp;\ninsert into kushhr_migrations.applied (filename, checksum) values\n  ${values}\non conflict (filename) do nothing;`,
  });
  if (backfill.status !== 0) fail("Backfill failed.", backfill.stderr);
  console.log(
    `✓ Backfilled ${migrations.length} migrations into the ledger (applied 0 — assumed already present).`,
  );
  process.exit(0);
}

// ── 5. Incremental: drift guard, then apply pending ─────────────────────────
for (const m of migrations) {
  const recorded = applied.get(m.filename);
  if (recorded && recorded !== m.checksum) {
    fail(
      `Migration ${m.filename} changed after being applied — migrations are append-only.\n` +
        "  Revert the edit and add a NEW migration instead.",
    );
  }
}

const pending = migrations.filter((m) => !applied.has(m.filename));

if (LIST) {
  if (pending.length === 0) {
    console.log("✓ 0 pending migrations — the DB is up to date.");
  } else {
    console.log(`${pending.length} pending migration(s):`);
    for (const m of pending) console.log(`    ${m.filename}`);
  }
  process.exit(0);
}

if (pending.length === 0) {
  console.log("✓ 0 pending migrations — the DB is up to date.");
  process.exit(0);
}

console.log(
  `Applying ${pending.length} pending migration(s) to "${CONTAINER}" (as supabase_admin)…`,
);

// Migrations MUST be transaction-safe (no CONCURRENTLY/VACUUM/REINDEX) — each is
// applied inside a single transaction below, and those statements cannot run in one.
for (const m of pending) {
  process.stdout.write(`  → ${m.filename} … `);
  // Apply the migration and record it in ONE transaction, so apply+record is atomic.
  // NOTE: no `set search_path` here — migrations create unqualified `public` objects
  // and use extension functions (gen_random_uuid, …); they must run under the default
  // Supabase search_path exactly as db-bootstrap.mjs applied them. The trailing ledger
  // insert is fully-qualified, so it's unaffected by whatever search_path the migration set.
  const txn =
    m.sql +
    `\ninsert into kushhr_migrations.applied (filename, checksum) values (${lit(m.filename)}, ${lit(m.checksum)});\n`;
  const apply = psql({
    user: "supabase_admin",
    args: ["--single-transaction", "-v", "ON_ERROR_STOP=1"],
    input: txn,
  });
  if (apply.status !== 0) {
    console.log("FAILED");
    fail(
      `Migration ${m.filename} failed and was rolled back (ledger unchanged).\n` +
        "  Fix the migration, then re-run: npm run db:migrate",
      apply.error || apply.stderr,
    );
  }
  console.log("ok");
}

console.log(`\n✓ Applied ${pending.length} migration(s).`);
