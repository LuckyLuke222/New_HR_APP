#!/usr/bin/env node
/**
 * User-flow inventory gate (pending-backlog §1).
 *
 * Keeps docs/user-flow-inventory.md honest in two directions:
 *
 *   1. capability -> inventory : every Server Action (src/server/actions/*.ts
 *      export) and every (app) page route must appear in a §1 row — in the
 *      `Server Action(s)` or `Entry route` column — or in the
 *      `user-flow-checker:exempt` block. A new capability cannot merge without
 *      a documented flow. (Bidirectional: a cited token with no matching code
 *      — a rename/deletion — also fails.) Scope = Server Actions + (app) page
 *      routes only; `src/app/** /route.ts` handlers are intentionally NOT
 *      tracked here (they are API callbacks, not user-initiated journeys — the
 *      access-matrix gate owns them). If a handler ever surfaces a user flow,
 *      add it to the exempt block or extend this scope.
 *
 *   2. inventory -> tests : every flow marked `Covered` / `Partially covered`
 *      must cite a `Covered by` test (`<spec>.spec.ts › "title"`) that actually
 *      exists under tests/e2e/. A renamed/deleted test fails the PR.
 *
 * It does NOT check that a test actually *exercises* the flow correctly — that
 * stays human review (same boundary as check-access-matrix.mjs: presence, not
 * correctness).
 *
 * The action/page inventory functions mirror check-access-matrix.mjs. They are
 * duplicated (not shared) to avoid refactoring that CI-critical gate; if a third
 * consumer appears, extract tools/lib/code-inventory.mjs (rule of three).
 *
 * Exit non-zero on any mismatch. Run via `npm run check:user-flows`.
 * The inventory path defaults to docs/user-flow-inventory.md; override with the
 * USERFLOW env var (used by the gate's own negative tests, e.g. USERFLOW=/dev/null).
 */
import { readFileSync, existsSync, globSync } from "node:fs";

const INVENTORY = process.env.USERFLOW || "docs/user-flow-inventory.md";
const TESTS_DIR = "tests/e2e";

// ---------------------------------------------------------------- inventory ---
// (mirror of check-access-matrix.mjs actionInventory/pageInventory/routeFromFile)
function actionInventory() {
  const tokens = new Map(); // token -> file
  for (const file of globSync("src/server/actions/*.ts").sort()) {
    const base = file.split("/").pop().replace(/\.ts$/, "");
    const re = /^export async function (\w+)/gm;
    const src = readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(src))) tokens.set(`${base}.${m[1]}`, file);
  }
  return tokens;
}

function routeFromFile(file) {
  const p = file
    .replace(/^src\/app/, "")
    .replace(/\/(page|route)\.(t|j)sx?$/, "")
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg))
    .join("/");
  return "/" + p;
}

function pageInventory() {
  const tokens = new Map();
  for (const file of globSync("src/app/(app)/**/page.tsx").sort()) {
    tokens.set(routeFromFile(file), file);
  }
  return tokens;
}

// ----------------------------------------------------------- inventory parse ---
/** Split a markdown table row into trimmed cell strings (drops the leading/trailing empties). */
function cells(line) {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

/** All `## 1.` table rows, with header-derived column indices. */
function flowTable(md) {
  const lines = md.split("\n");
  let inSection = false;
  let idx = null;
  const rows = [];
  for (const line of lines) {
    const h = line.match(/^## (\d+)\./);
    if (h) {
      if (Number(h[1]) === 1) inSection = true;
      else if (inSection) break; // left §1 — stop (don't let a later heading clobber the header)
      continue;
    }
    if (!inSection || !line.startsWith("|")) continue;
    if (/^\|[\s|:-]+\|?$/.test(line)) continue; // separator row
    if (!idx) {
      idx = {};
      cells(line).forEach((name, i) => (idx[name] = i));
      continue;
    }
    rows.push(cells(line));
  }
  return { idx: idx ?? {}, rows };
}

/** Backticked tokens in a single cell. */
function backticks(cell) {
  return [...(cell ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

// Match only the actual HTML-comment exempt block, anchored on `<!--`, so a
// prose/backticked mention of the marker elsewhere in the doc neither inflates
// the block count nor pollutes the parsed token set.
const EXEMPT_BLOCK = /<!--\s*user-flow-checker:exempt([\s\S]*?)-->/g;

/** Tokens in the `user-flow-checker:exempt` comment block. */
function exemptTokens(md) {
  const out = new Set();
  for (const block of md.matchAll(EXEMPT_BLOCK)) {
    for (const raw of block[1].split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      out.add(line.split(/\s+—\s+|\s+--\s+|\s{2,}/)[0].trim());
    }
  }
  return out;
}

// -------------------------------------------------------------------- main ---
function main() {
  const md = readFileSync(INVENTORY, "utf8");
  const { idx, rows } = flowTable(md);
  const errors = [];

  if (rows.length === 0) {
    console.error(`✗ ${INVENTORY}: no §1 flow rows parsed — refusing to report green on an empty/mis-parsed inventory.`);
    process.exit(1);
  }
  for (const col of ["Server Action(s)", "Entry route", "Covered by", "Status"]) {
    if (idx[col] === undefined) {
      console.error(`✗ ${INVENTORY}: §1 table is missing the "${col}" column (header changed?).`);
      process.exit(1);
    }
  }

  // --- collect documented tokens from the two keyed columns only -------------
  const documented = new Set(); // action + route tokens cited in the inventory
  for (const row of rows) {
    for (const t of backticks(row[idx["Server Action(s)"]])) documented.add(t);
    for (const t of backticks(row[idx["Entry route"]])) documented.add(t);
  }

  // Exactly one exempt block is allowed. A second (HTML comments are invisible
  // in rendered Markdown) could silently exempt a real capability past review.
  const exemptBlocks = md.match(EXEMPT_BLOCK)?.length ?? 0;
  if (exemptBlocks !== 1) {
    console.error(
      `✗ ${INVENTORY}: expected exactly one \`user-flow-checker:exempt\` block, found ${exemptBlocks}.\n` +
        `  Multiple/hidden blocks can silently exempt a real capability — consolidate into one.`,
    );
    process.exit(1);
  }
  const exempt = exemptTokens(md);
  const code = new Map([...actionInventory(), ...pageInventory()]);

  if (documented.size === 0) {
    console.error(`✗ ${INVENTORY}: §1 parsed but no action/route tokens found — refusing to report green.`);
    process.exit(1);
  }

  // --- direction 1: capability <-> inventory ---------------------------------
  for (const [token, file] of code) {
    if (!documented.has(token) && !exempt.has(token)) {
      errors.push(
        `  [capability] "${token}" exists in code (${file}) but no §1 flow row references it.\n` +
          `               → add a flow row citing it (Server Action(s) / Entry route), or add it to the user-flow-checker:exempt block with a reason.`,
      );
    }
  }
  for (const token of documented) {
    // route tokens with a dynamic segment ([id]) are matched literally against pageInventory keys
    if (!code.has(token) && !exempt.has(token)) {
      errors.push(
        `  [stale] inventory cites "${token}" but no matching Server Action / page route exists in code (rename or deletion?).\n` +
          `         → update the flow row to match the code.`,
      );
    }
  }

  // --- direction 2: covered flows must cite a real test ----------------------
  const COVERED = new Set(["Covered", "Partially covered"]);
  for (const row of rows) {
    const status = row[idx["Status"]];
    if (!COVERED.has(status)) continue; // Missing / Not in v1 scope / Needs manual confirmation may be testless
    const flow = row[idx["Flow"]] ?? "(unnamed flow)";
    const coveredBy = row[idx["Covered by"]] ?? "";
    const specFile = coveredBy.match(/`([\w.-]+\.spec\.ts)`/);
    const title = coveredBy.match(/"([^"]+)"/);
    if (!specFile || !title) {
      errors.push(
        `  [coverage] flow "${flow}" is "${status}" but its "Covered by" cell has no \`<spec>.spec.ts\` › "title" reference.\n` +
          `             → cite the covering test, or change the Status to Missing / Needs manual confirmation.`,
      );
      continue;
    }
    const path = `${TESTS_DIR}/${specFile[1]}`;
    if (!existsSync(path)) {
      errors.push(`  [coverage] flow "${flow}" cites ${specFile[1]} which does not exist under ${TESTS_DIR}/.`);
      continue;
    }
    if (!readFileSync(path, "utf8").includes(title[1])) {
      errors.push(
        `  [coverage] flow "${flow}" cites ${specFile[1]} › "${title[1]}" but that test title is not present (renamed/deleted?).\n` +
          `             → update the reference to the current test title.`,
      );
    }
  }

  if (errors.length) {
    console.error(`✗ user-flow inventory out of sync (${errors.length} issue${errors.length > 1 ? "s" : ""}):\n`);
    console.error(errors.join("\n\n"));
    console.error(`\nSee ${INVENTORY}. It is the source of truth for what a user can do, and which test proves it.`);
    process.exit(1);
  }

  console.log(
    `✓ user-flow inventory in sync (${rows.length} flows; ${code.size} capabilities referenced; ` +
      `${exempt.size} exempt; coverage claims resolve).`,
  );
}

main();
