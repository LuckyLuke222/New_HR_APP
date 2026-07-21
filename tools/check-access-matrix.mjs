#!/usr/bin/env node
/**
 * Access-matrix gate (initiative §1, step 3).
 *
 * Strict, bidirectional check that the application authorization surface in the
 * codebase matches what `docs/access-matrix.md` documents:
 *   §1 Page routes      — src/app/(app)/ ** /page.tsx
 *   §2 Route handlers   — src/app/ ** /route.ts (exported HTTP verbs)
 *   §3 Server Actions   — src/server/actions/*.ts (exported async functions)
 *
 * It does NOT check that the documented rule is *correct* (that is the Playwright
 * suite, step 2) — only that nothing is undocumented and no documented row has
 * lost its code. The DB layer (tables / RLS policies) is intentionally out of
 * scope here; it is owned by docs/rls-policy-map.md and the step-4 cross-check.
 * A soft tripwire below nudges when a migration changes without an rls-policy-map
 * update, so the DB-layer gap stays a conscious decision rather than a silent one.
 *
 * Exit non-zero on any mismatch. Run via `npm run check:access-matrix`.
 */
import { readFileSync, globSync } from "node:fs";
import { execSync } from "node:child_process";

const MATRIX = "docs/access-matrix.md";

// ---------------------------------------------------------------- inventory ---
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

/** src/app/(app)/employees/[id]/edit/page.tsx -> /employees/[id]/edit */
function routeFromFile(file) {
  const p = file
    .replace(/^src\/app/, "")
    .replace(/\/(page|route)\.(t|j)sx?$/, "")
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg)) // drop (group) segments
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

function handlerInventory() {
  const tokens = new Map();
  for (const file of globSync("src/app/**/route.ts").sort()) {
    const verb = /^export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;
    const route = routeFromFile(file);
    const src = readFileSync(file, "utf8");
    let m;
    while ((m = verb.exec(src))) tokens.set(`${m[1]} ${route}`, file);
  }
  return tokens;
}

// ------------------------------------------------------------- matrix parse ---
/** Backticked spans in the first table cell of a given `## N.` section. */
function documentedTokens(md, sectionNum) {
  const lines = md.split("\n");
  const out = new Set();
  let inSection = false;
  for (const line of lines) {
    const header = line.match(/^## (\d+)\./);
    if (header) {
      inSection = Number(header[1]) === sectionNum;
      continue;
    }
    if (!inSection) continue;
    if (!line.startsWith("|")) continue;
    if (/^\|\s*-/.test(line)) continue; // separator row
    const firstCell = line.split("|")[1] ?? "";
    for (const m of firstCell.matchAll(/`([^`]+)`/g)) out.add(m[1]);
  }
  return out;
}

/** Tokens listed in any `access-matrix-checker:exempt` comment block. */
function exemptTokens(md) {
  const out = new Set();
  for (const block of md.matchAll(/access-matrix-checker:exempt([\s\S]*?)-->/g)) {
    for (const raw of block[1].split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      out.add(line.split(/\s+—\s+|\s+--\s+|\s{2,}/)[0].trim());
    }
  }
  return out;
}

// -------------------------------------------------------------------- diff ---
function diff(label, section, inventory, documented, exempt, errors) {
  for (const token of inventory.keys()) {
    if (!documented.has(token) && !exempt.has(token)) {
      errors.push(
        `  [${label}] "${token}" exists in code (${inventory.get(token)}) but is missing from access-matrix.md ${section}.\n` +
          `           → add a row in ${section}, or add it to the access-matrix-checker:exempt block with a reason.`,
      );
    }
  }
  for (const token of documented) {
    if (!inventory.has(token)) {
      errors.push(
        `  [${label}] access-matrix.md ${section} lists "${token}" but no matching code exists (rename or deletion).\n` +
          `           → update ${section} to match the code.`,
      );
    }
  }
}

// -------------------------------------------------- soft DB-layer tripwire ---
function migrationTripwire() {
  try {
    const base = process.env.BASE_REF || "origin/main";
    const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const changed = out.split("\n").filter(Boolean);
    const newMigration = changed.some((f) => /^supabase\/migrations\/.*\.sql$/.test(f));
    const touchedRlsMap = changed.includes("docs/rls-policy-map.md");
    if (newMigration && !touchedRlsMap) {
      console.warn(
        "⚠️  migration(s) changed without docs/rls-policy-map.md — confirm the DB-layer authz is documented\n" +
          "    (this script does not enforce the DB layer; that is the step-4 cross-check). Warning only.",
      );
    }
  } catch {
    /* no git history / base ref unavailable — skip silently */
  }
}

// -------------------------------------------------------------------- main ---
function main() {
  const md = readFileSync(MATRIX, "utf8");
  const exempt = exemptTokens(md);
  const errors = [];

  const actions = actionInventory();
  const pages = pageInventory();
  const handlers = handlerInventory();

  diff("action", "§3", actions, documentedTokens(md, 3), exempt, errors);
  diff("page", "§1", pages, documentedTokens(md, 1), exempt, errors);
  diff("handler", "§2", handlers, documentedTokens(md, 2), exempt, errors);

  migrationTripwire();

  if (errors.length) {
    console.error(`✗ access matrix out of sync (${errors.length} issue${errors.length > 1 ? "s" : ""}):\n`);
    console.error(errors.join("\n\n"));
    console.error("\nSee docs/access-matrix.md. The matrix is the source of truth for who-can-do-what.");
    process.exit(1);
  }

  console.log(`✓ access matrix in sync (${actions.size} actions / ${pages.size} pages / ${handlers.size} handlers).`);
}

main();
