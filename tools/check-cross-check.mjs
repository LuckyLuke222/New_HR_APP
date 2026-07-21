#!/usr/bin/env node
/**
 * DB↔app cross-check gate (initiative §1, step 6).
 *
 * Sibling to tools/check-access-matrix.mjs. Where that script diffs the *application*
 * authz surface against access-matrix.md §1–§3, this one keeps the §7 DB↔app cross-check
 * from silently going stale: it asserts that the per-table agreement table in
 * docs/access-matrix.md §7 lists exactly the set of DB tables that docs/rls-policy-map.md
 * governs.
 *
 * Scope is INVENTORY COMPLETENESS only. It does NOT check that the documented allow/deny
 * *semantics* of the two layers agree — that remains the human/AI audit recorded in §7
 * Findings (a script cannot diff RLS-vs-Server-Action intent). What it kills is the failure
 * mode §7 itself calls out ("No automated cross-check yet"): a new RLS-governed table is
 * added to rls-policy-map.md but nobody updates §7, so the cross-check rots with no runtime
 * signal (sensitive reads go through the admin client, so a divergence never reaches the UI).
 * A red forces a §7 row — hence a human re-walk of that table's cross-check — before merge.
 *
 * Exit non-zero on any mismatch. Run via `npm run check:cross-check`.
 *
 * Doc paths can be overridden via RLS_MAP / MATRIX env vars (used by the negative tests).
 */
import { readFileSync } from "node:fs";

const RLS_MAP = process.env.RLS_MAP || "docs/rls-policy-map.md";
const MATRIX = process.env.MATRIX || "docs/access-matrix.md";

/**
 * §7's last row annotates the hr-documents bucket with its implementing table,
 * `storage.objects`, which is not a top-level DB table in rls-policy-map.md. It is a
 * known, intentional annotation — exclude it from the app-side inventory.
 */
const APP_ALIASES = new Set(["storage.objects"]);

// ------------------------------------------------------------ DB-layer inventory ---
/** First backticked token in each data row (after the separator) of an h2 section. */
function firstCellTokensOfSection(md, sectionTitleRe) {
  const out = new Set();
  let inSection = false;
  let pastSeparator = false;
  for (const line of md.split("\n")) {
    const header = line.match(/^##\s+(.*)$/);
    if (header) {
      inSection = sectionTitleRe.test(header[1]);
      pastSeparator = false;
      continue;
    }
    if (!inSection) continue;
    if (!line.startsWith("|")) {
      pastSeparator = false; // table ended
      continue;
    }
    if (/^\|\s*-/.test(line)) {
      pastSeparator = true; // header/body divider — body rows follow
      continue;
    }
    if (!pastSeparator) continue; // skip the header row
    const firstCell = line.split("|")[1] ?? "";
    const m = firstCell.match(/`([^`]+)`/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Tables governed by the DB layer: backticked `## `name`` headers + storage buckets. */
function dbTableInventory(md) {
  const out = new Set();
  for (const m of md.matchAll(/^##\s+`([^`]+)`/gm)) out.add(m[1]);
  for (const t of firstCellTokensOfSection(md, /^Storage Buckets\b/)) out.add(t);
  return out;
}

// ----------------------------------------------------------- app-layer inventory ---
/** Backticked tokens in the first cell of every row of the `## 7.` section table. */
function crossCheckInventory(md) {
  const out = new Set();
  let inSection = false;
  let pastSeparator = false;
  for (const line of md.split("\n")) {
    const header = line.match(/^##\s+(\d+)\./);
    if (header) {
      inSection = Number(header[1]) === 7;
      pastSeparator = false;
      continue;
    }
    if (/^#/.test(line)) {
      // any other heading (### sub-section, non-numbered ##, # h1) ends §7 —
      // a table under ### Findings must not feed the cross-check inventory
      inSection = false;
      pastSeparator = false;
      continue;
    }
    if (!inSection) continue;
    if (!line.startsWith("|")) {
      pastSeparator = false; // table ended
      continue;
    }
    if (/^\|\s*-/.test(line)) {
      pastSeparator = true;
      continue;
    }
    if (!pastSeparator) continue; // skip the header row
    const firstCell = line.split("|")[1] ?? "";
    for (const m of firstCell.matchAll(/`([^`]+)`/g)) {
      if (!APP_ALIASES.has(m[1])) out.add(m[1]);
    }
  }
  return out;
}

// -------------------------------------------------------------------------- diff ---
function main() {
  let dbMd, matrixMd;
  try {
    dbMd = readFileSync(RLS_MAP, "utf8");
    matrixMd = readFileSync(MATRIX, "utf8");
  } catch (e) {
    console.error(
      `✗ cannot read a cross-check doc: ${e.message}\n` +
        `  check the RLS_MAP / MATRIX env vars (defaults: docs/rls-policy-map.md, docs/access-matrix.md).`,
    );
    process.exit(1);
  }

  const dbTables = dbTableInventory(dbMd);
  const crossCheck = crossCheckInventory(matrixMd);

  // A security gate must never report green on empty input: an empty inventory means a
  // parse failure or a stripped doc, not a real "0 tables in sync".
  if (dbTables.size === 0) {
    console.error(`✗ DB-table inventory is empty — probable parse failure or stripped ${RLS_MAP}.`);
    process.exit(1);
  }
  if (crossCheck.size === 0 && /^##\s+7\./m.test(matrixMd)) {
    console.error(
      `✗ §7 cross-check inventory is empty though ${MATRIX} has a §7 section — the per-table\n` +
        `  agreement table may have moved under a ### sub-heading (it must stay in the §7 body).`,
    );
    process.exit(1);
  }

  const errors = [];

  for (const t of dbTables) {
    if (!crossCheck.has(t)) {
      errors.push(
        `  "${t}" is governed by ${RLS_MAP} but has no row in ${MATRIX} §7 (DB↔app cross-check).\n` +
          `           → add a row in the §7 per-table agreement table after re-walking its cross-check.`,
      );
    }
  }
  for (const t of crossCheck) {
    if (!dbTables.has(t)) {
      errors.push(
        `  ${MATRIX} §7 lists "${t}" but ${RLS_MAP} documents no such table (rename/removal).\n` +
          `           → update §7 to match the DB layer, or add the table to ${RLS_MAP}.`,
      );
    }
  }

  if (errors.length) {
    console.error(`✗ DB↔app cross-check out of sync (${errors.length} issue${errors.length > 1 ? "s" : ""}):\n`);
    console.error(errors.join("\n\n"));
    console.error(
      "\nThe §7 cross-check inventory must match the DB tables in rls-policy-map.md.\n" +
        "This gate enforces inventory completeness only — the allow/deny semantics remain the §7 audit.",
    );
    process.exit(1);
  }

  console.log(`✓ DB↔app cross-check in sync (${dbTables.size} DB tables ↔ §7 cross-check rows).`);
}

main();
