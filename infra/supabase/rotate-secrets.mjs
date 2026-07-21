#!/usr/bin/env node
// Rotate the self-hosted Supabase stack's demo secrets with our own.
// - Generates random secrets.
// - Signs ANON_KEY + SERVICE_ROLE_KEY as HS256 JWTs with the NEW JWT_SECRET,
//   so the three stay consistent by construction.
// - Backs up .env -> .env.bak, rewrites only the target keys in place.
// - Prints a redacted summary. Contains no secrets itself (safe to commit).
//
// Run from infra/supabase:  node rotate-secrets.mjs

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const ENV_PATH = ".env";
const BAK_PATH = ".env.bak";

if (!existsSync(ENV_PATH)) {
  console.error(`No ${ENV_PATH} found. Run this from infra/supabase.`);
  process.exit(1);
}

// --- helpers ---------------------------------------------------------------
const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randB64 = (bytes) => b64url(randomBytes(bytes));

function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (o) => b64url(Buffer.from(JSON.stringify(o)));
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = b64url(createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

// --- generate --------------------------------------------------------------
const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 365 * 10; // 10 years

const JWT_SECRET = randB64(32); // ~43 chars, >= 32 required
const ANON_KEY = signJwt({ role: "anon", iss: "supabase", iat: now, exp }, JWT_SECRET);
const SERVICE_ROLE_KEY = signJwt({ role: "service_role", iss: "supabase", iat: now, exp }, JWT_SECRET);

const updates = {
  JWT_SECRET,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  POSTGRES_PASSWORD: randB64(24),
  DASHBOARD_USERNAME: "supabase", // unchanged, keep explicit
  DASHBOARD_PASSWORD: randB64(18),
  SECRET_KEY_BASE: randB64(48), // 64 chars
  VAULT_ENC_KEY: randB64(24), // exactly 32 chars
  LOGFLARE_PUBLIC_ACCESS_TOKEN: randB64(24),
  LOGFLARE_PRIVATE_ACCESS_TOKEN: randB64(24),
  POOLER_TENANT_ID: randomBytes(8).toString("hex"),
};

// --- rewrite ---------------------------------------------------------------
copyFileSync(ENV_PATH, BAK_PATH);
let env = readFileSync(ENV_PATH, "utf8");

const summary = [];
for (const [key, val] of Object.entries(updates)) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (!re.test(env)) {
    console.error(`WARN: ${key} not found in ${ENV_PATH} — skipped`);
    continue;
  }
  env = env.replace(re, `${key}=${val}`);
  const shown = key === "DASHBOARD_USERNAME" ? val : `${val.slice(0, 6)}… (${val.length} chars)`;
  summary.push(`  ${key} = ${shown}`);
}

writeFileSync(ENV_PATH, env);

console.log(`Backed up ${ENV_PATH} -> ${BAK_PATH}`);
console.log("Rotated keys (values redacted):");
console.log(summary.join("\n"));
console.log("\nNext: docker compose down -v && docker compose up -d");
