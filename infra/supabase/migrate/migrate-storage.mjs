#!/usr/bin/env node
// Migrate hr-documents storage blobs cloud -> self-host, preserving exact paths.
// Zero deps: uses the Storage REST API via global fetch (Node 18+).
// Reads cloud creds from ./.env.cloud and self-host SERVICE_ROLE_KEY from ../.env.
// Idempotent (x-upsert). Run from anywhere:  node infra/supabase/migrate/migrate-storage.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BUCKET = "hr-documents";

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const cloud = parseEnv(join(here, ".env.cloud"));
const self = parseEnv(join(here, "..", ".env"));

const SRC = { url: cloud.CLOUD_SUPABASE_URL.replace(/\/$/, ""), key: cloud.CLOUD_SERVICE_ROLE_KEY };
const DST = { url: "http://localhost:8000", key: self.SERVICE_ROLE_KEY };

const authHeaders = (k) => ({ apikey: k, Authorization: `Bearer ${k}` });

async function list(side, prefix) {
  const res = await fetch(`${side.url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(side.key), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`list '${prefix}': ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAll(side, prefix = "") {
  const found = [];
  for (const entry of await list(side, prefix)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) found.push(...(await listAll(side, path))); // folder
    else found.push({ path, mimetype: entry.metadata?.mimetype });
  }
  return found;
}

const objects = await listAll(SRC);
console.log(`cloud ${BUCKET}: ${objects.length} object(s)`);

let ok = 0, fail = 0;
for (const obj of objects) {
  const dl = await fetch(`${SRC.url}/storage/v1/object/authenticated/${BUCKET}/${encodeURI(obj.path)}`, {
    headers: authHeaders(SRC.key),
  });
  if (!dl.ok) { console.error(`  DOWNLOAD FAIL ${obj.path}: ${dl.status}`); fail++; continue; }
  const buf = Buffer.from(await dl.arrayBuffer());
  const contentType = obj.mimetype || dl.headers.get("content-type") || "application/octet-stream";
  const up = await fetch(`${DST.url}/storage/v1/object/${BUCKET}/${encodeURI(obj.path)}`, {
    method: "POST",
    headers: { ...authHeaders(DST.key), "Content-Type": contentType, "x-upsert": "true" },
    body: buf,
  });
  if (!up.ok) { console.error(`  UPLOAD FAIL ${obj.path}: ${up.status} ${await up.text()}`); fail++; }
  else { console.log(`  OK ${obj.path} (${buf.length}b, ${contentType})`); ok++; }
}
console.log(`done: ${ok} uploaded, ${fail} failed`);
process.exit(fail ? 1 : 0);
