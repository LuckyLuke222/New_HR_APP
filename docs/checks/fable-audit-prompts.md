# KushHR — Fable 5 Independent Audit Prompts (second AI system)

These are the prompts driving the **second independent AI pass** for the pending-backlog §1
multi-AI review gate. They mirror the Codex (GPT-5, xhigh) run structure so the two systems
audit the same surfaces. **Fable runs blind** — it must not read Codex's reports or the Claude
triage, so the two passes stay genuinely independent.

### Orchestrator instructions (for the Opus/Claude Code session that SPAWNS the agent — NOT part of the agent's prompt)

Model choice is fixed at spawn time by the caller; the agent cannot set its own model, so this must be honored *here*, not in the Shared preamble below.

- **Pin the model — this is load-bearing.** Spawn the agent with an explicit Fable 5 model override (Agent tool `model: fable`). Spawning a `general-purpose` agent "as Fable 5" *without* the override runs majority-Opus: Runs 1, 2, and 4 originally ran that way and are Opus-authored despite the filename (verified from the session transcripts). The override is the only thing that makes the pass genuinely Fable.
- One Fable agent per report file, and never two agents writing the *same* report concurrently. Different runs (different output files) may run in parallel.
- Read-only except for its own report file, which it **adds to** — merging new findings and deduping against what's already there — never overwriting a prior pass.
- Output: `docs/checks/fable-audit-1-authz.md` … `fable-audit-5-db-schema.md`.

---

## Shared preamble (prepended to every run)

```
# KushHR — Independent AI-built App Audit (READ-ONLY)

You are a senior staff engineer performing an independent, adversarial audit of a
production HR/payroll web app. This codebase was built almost entirely by AI agents —
assume nothing is correct because it looks clean. Hunt for plausible-looking code that is
subtly insecure, inconsistent, over-abstracted, or silently broken.

## INDEPENDENCE — do not read the other reviewer's work
A separate AI system is auditing the same code in parallel. To keep this pass independent,
you MUST NOT open, read, or reference any of these files:
  - docs/checks/codex-audit-1-authz.md, -2-auth-audit.md, -3-ai-quality.md,
    -4-performance.md, -5-db-schema.md
  - docs/checks/codex-audit-review.md
  - docs/checks/audit-summary.pdf
Form your own conclusions from the source only.

## HARD CONSTRAINT — the ONLY change you may make
You may create/edit exactly one file: your report at the path named in this run's "Output"
section, under docs/checks/. If that file already exists, you EDIT IT IN PLACE — merge and
dedup per "Output discipline" below; never blank it or wholesale-overwrite prior findings.
Everything else is strictly read-only. Do not modify source,
config, migrations, tests, or docs. Do not run destructive, mutating, or stateful commands
(no migrations, no docker compose up, no writes to the DB, no installs). Read and reason only.

## Stack (verify against the repo; don't trust this list)
Next.js 16 / React 19 (App Router; Server Actions + Route Handlers) · self-hosted Supabase
(Postgres 17) via Docker Compose, RLS-enforced · Supabase GoTrue auth + storage · Caddy TLS ·
Zod validation · Playwright E2E.
Read AGENTS.md first: this is a *modified* Next.js — APIs/conventions differ from upstream.
Check node_modules/next/dist/docs/ before assuming any Next behavior.

## Ground yourself before judging
Read the intended-design docs relevant to this run, then audit code against them and flag
where code and doc disagree:
docs/security-model.md, docs/rls-policy-map.md, docs/access-matrix.md,
docs/database-design.md, docs/systems-thinking.md, supabase/migrations/.
Don't re-report items already logged in docs/ai-built-app-risk-audit.md,
docs/checks/phase-13.md, docs/ultrareview-findings.md unless you have new evidence they're
unresolved. (These are the OLD prior audits — not the parallel reviewer's output above.)

## Evidence bar (applies to every finding)
Cite file:line. Give a concrete input/state → wrong-output/exploit scenario. If you can't
construct one, mark it UNVERIFIED and say what you'd need to confirm it. No speculative
"could be an issue." Skepticism and proof over comprehensive-sounding coverage.

## AI-authorship lens (keep active in every run)
Watch for the tells of multi-session AI authoring: hallucinated/misused APIs, confident-but-
wrong security, copy-paste twins that diverged, inconsistent conventions across files that
should match, dead/orphan code, speculative one-caller abstractions, and tests that pass
without proving anything.

## Output discipline — audit INDEPENDENTLY first, THEN merge & dedup (applies to every run)
Two phases, strictly in order. Do not collapse them — the independence of the audit depends
on the ordering.

**Phase 1 — Independent audit (form ALL your findings from source only).**
- Produce your complete finding list from the code, docs, and migrations alone, exactly as if
  the report file did not exist. Your conclusions must be your own.
- While forming findings you MUST NOT open: the report file named in this run's "Output"
  section, any other `docs/checks/*-audit-*.md` (including the sibling Fable reports), or the
  barred Codex/summary files above. No peeking at prior findings to anchor or shortcut yours.
- Hold your independent findings in your working notes; write nothing to disk yet.

**Phase 2 — Merge & dedup into the existing report (only after Phase 1 is complete).**
- NOW open the report file in this run's "Output" section. It may already exist from a prior
  pass (possibly a different model or an earlier run) — treat it as a shared, cumulative
  report, not a blank page. (This does NOT relax INDEPENDENCE: the Codex reports stay
  off-limits in both phases; you open only your own output file, and only now.)
- Preserve every prior finding — never delete or wholesale-overwrite existing content.
- Dedup: one of YOUR Phase-1 findings duplicates an existing entry if it names the same root
  defect at the same location (same file + same or adjacent line). Do NOT add a second entry
  for it. If your independent take adds new evidence, a stronger repro/exploit, or a corrected
  severity, append a short note to THAT existing entry instead of creating a new one.
- Add each of your remaining (genuinely new) findings as a new entry, slotted into the
  matching section at the correct severity rank. Re-sort the ranked list after inserting.
- Provenance / authorship labels — MUST distinguish models: this file may already hold
  findings from a DIFFERENT model (e.g. Opus). Every entry must be attributable so a reader
  tells them apart at a glance. Tag every finding, note, or table row YOU add with a leading
  `[Fable5 · YYYY-MM-DD]` (today's date). Do NOT edit the wording of, or re-tag, findings you
  did not author — if an existing entry is untagged, leave it untagged (a maintainer attributes
  pre-convention entries separately). If the file has no provenance legend directly under its
  title, add exactly this line: `> Provenance: [Fable5 · date] = Fable 5 · [Opus · date] =
  Opus · untagged = earlier pass.`
- Verified-authorship header — MANDATORY, directly under the report title. Write (or, if a prior
  pass already left one, APPEND your pass to) a one-line note naming the model that ACTUALLY
  authored each pass — confirm from the run you are in, never assume from the filename — and, for
  a subagent run, the Fable/Opus turn split. This header is what lets a reader trust a "Fable
  Audit" title; do not overwrite a prior pass's header, add your line to it.
- The exec summary and any coverage/inventory tables are SHARED, not appended: revise the
  summary in place to reflect the COMBINED finding set (never leave two competing summaries);
  add rows to existing tables rather than starting a new one.
- This still counts as editing exactly one file — every other file remains read-only.
```

---

## Run 1 — Authorization & data exposure

```
## This run's focus: Authorization, RLS↔app agreement, data exposure

Trace every Server Action and Route Handler end to end. For each, answer:
- Authenticated? Authorized for the actor's role (not just "logged in")?
- Object-level checks — can a manager act outside direct reports? Can an employee reach
  another employee's row? (IDOR)
- Does it use the service-role key? If so, is that path ever reachable with user-controlled
  input that bypasses RLS? This is the highest-risk pattern — enumerate every service-role
  usage and justify each.
- RLS vs application layer: does the DB grant match what the app actually allows? Cross-check
  access-matrix.md §7 and rls-policy-map.md. Flag both directions — DB looser than app
  (latent grant) and app looser than DB (real hole).
- Payroll/compensation & manager-visible data: over-broad selects, over-fetching, fields
  leaking to roles that shouldn't see them.

## Output
Add your findings to (merge + dedup — see Output discipline) docs/checks/fable-audit-1-authz.md. Structure:
1. Executive summary — is the authz model sound for real HR/payroll data? Top 5 risks.
2. Findings, ranked BLOCKER / NEEDS-FIX / NIT, each: file:line · defect · exploit scenario ·
   fix · confidence.
3. Service-role-key usage inventory (every call site + verdict).
4. RLS↔app disagreement table.
5. What you could not verify (needs runtime/data).
```

---

## Run 2 — Auth lifecycle, audit logging, storage

```
## This run's focus: Auth/session lifecycle, role→JWT, audit logging, storage

- Identity & role propagation: trace signup → handle_new_user → role → JWT claims → how the
  app reads role. Any window where role in JWT disagrees with the DB? Any way to self-elevate
  role via a writable path?
- Session/cookie handling: secure flags, expiry, fixation, the base-url/cookie derivation
  logic; SSR vs client auth state consistency.
- Audit logging: are all privileged actions AND all deny paths recorded, with correct actor
  and reason? Find actions that mutate state but write no audit row. Find deny-audit
  assertions that could false-pass on stale rows.
- Storage/object access: upload validation (type/size/path), can a user read/write another
  user's objects, signed-URL scope, path traversal.
- Secrets: anything leaking to client bundles, logs, or error responses.

## Output
Add your findings to (merge + dedup — see Output discipline) docs/checks/fable-audit-2-auth-audit.md. Same structure as Run 1
(exec summary · ranked findings with file:line + scenario + fix · an "actions missing audit
coverage" list · could-not-verify).
```

---

## Run 3 — AI-authorship pattern audit & code quality

```
## This run's focus: AI-authorship failure modes + maintainability (systemic, not per-line)

Optimize for finding classes of problem, not individual nits:
- Hallucinated / misused framework APIs — esp. the modified Next.js. Verify against
  node_modules/next/dist/docs/.
- Copy-paste drift: near-duplicate Server Actions/components/validation that diverged, so a
  fix landed in one twin and not the other. Name the twins.
- Convention inconsistency across files that should match: error handling, validation, audit
  logging, naming, data-access patterns. Quantify how widespread.
- Dead/orphan code, unused deps (cross-check package.json), speculative abstractions with a
  single caller.
- State-ownership violations vs docs/systems-thinking.md (derived copies that can drift from
  their owner).
- Test quality: tests asserting on stale/unscoped rows, mocking away the unit under test, or
  passing without proving the guard they claim to.
- Type safety: any, unsafe casts, non-null !, unchecked external data.
- AI slop & needless complexity: flag verbose/convoluted code that a competent human would
  write simpler — redundant conditionals, needless indirection/wrapper layers, defensive
  checks for impossible states, boilerplate the framework already provides, over-engineered
  generics with one use — and give the simpler rewrite inline with a rough line-count delta.

## Output
Add your findings to (merge + dedup — see Output discipline) docs/checks/fable-audit-3-ai-quality.md. Structure:
1. Exec summary + overall maintainability posture.
2. AI-authorship pattern summary — the systemic tells, each with 2–3 representative file:line
   instances, so we fix the class not each case.
3. Ranked findings (BLOCKER/NEEDS-FIX/NIT) with file:line + why + fix.
4. Dead-code / unused-dep list.
5. Could-not-verify.
```

---

## Run 4 — Performance & optimization

```
## This run's focus: Performance & optimization (recommendations, not blockers)

- DB: N+1 query patterns, missing/unused indexes (cross-check queries against
  supabase/migrations/), unbounded selects, over-fetching, redundant round-trips —
  especially cross-service GoTrue calls in hot paths.
- Server rendering: data waterfalls in Server Components, sequential awaits that could
  parallelize, missing/incorrect caching & revalidation.
- Client bundle: unnecessary "use client" boundaries, heavy client deps (e.g. charting) that
  could be server-rendered or lazy-loaded, oversized bundles.
- Server Actions: repeated auth/role lookups per request that could be memoized within a
  request.

For each item give expected impact (latency/bytes/query-count) and effort. Rank by
impact-per-effort. These are recommendations, not correctness blockers — but flag any that
also causes a correctness/timeout bug.

## Output
Add your findings to (merge + dedup — see Output discipline) docs/checks/fable-audit-4-performance.md:
1. Exec summary — biggest wins.
2. Optimization list, ranked by impact/effort, each: file:line · issue · expected impact ·
   effort · recommended change.
3. Could-not-verify (needs profiling/runtime data).
```

---

## Run 5 — Database schema, migrations & RLS integrity

```
## This run's focus: Schema, migrations, and RLS policy integrity (the data layer itself)

- Walk supabase/migrations/ in order. Flag: migrations that assume state a prior one didn't
  create, non-idempotent DDL, destructive changes without guards, drift between the migration
  history and docs/database-design.md / docs/rls-policy-map.md.
- RLS completeness: every table with sensitive data — does it have RLS enabled AND policies
  for every operation (select/insert/update/delete)? Find tables relying on "no policy = deny"
  vs explicitly denied. Find policies with USING (true) or overly broad predicates.
- FKs & integrity: FKs on profiles and other core tables — cascade behavior, orphan risk.
  Triggers (handle_new_user, sync_role_to_jwt, insert_audit_log) — correctness, failure
  modes, security-definer scope.
- Constraints: missing NOT NULL / CHECK / UNIQUE that let invalid HR/payroll data in.

## Output
Add your findings to (merge + dedup — see Output discipline) docs/checks/fable-audit-5-db-schema.md:
1. Exec summary — is the data layer sound and does it match the app's assumptions?
2. Ranked findings (BLOCKER/NEEDS-FIX/NIT) with migration/file:line + scenario + fix.
3. RLS coverage table (table × operation × policy present/verdict).
4. Could-not-verify.
```
