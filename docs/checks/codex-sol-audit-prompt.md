# KushHR — GPT-5.6 "Sol" (Codex) Independent Audit Prompt (third AI system)

One-shot prompt for the **third independent AI pass** of the pending-backlog §1 multi-AI review
gate. Unlike the Fable/Codex-GPT-5 runs (one agent per report file), this is a **single Codex
invocation** that produces all six report files. It mirrors the earlier run structure (parts 1–5)
so the three systems audit the same surfaces, and adds a **sixth production-readiness opinion**.

### Orchestrator / operator notes (NOT part of the pasted prompt)

- **Pin the model — load-bearing.** Run this in Codex with **GPT-5.6 "Sol"** selected. The prompt
  cannot set its own model; the operator must select it before running.
- **Independence:** Sol runs blind to both prior systems — it must not read any `codex-audit-*`,
  `fable-audit-*`, `codex-audit-review.md`, `audit-summary.pdf`, or `audit-remediation-plan.md`.
- **Web research is permitted for this run** (operator decision). Parts 1–5 must still ground every
  finding in `file:line` evidence — research informs judgment, it does not replace the evidence bar.
  Part 6 is the evaluative/opinion section where best-practice research is the point.
- **Read-only except its six output files.** No source/config/migration/test/doc changes; no
  destructive/stateful commands.
- Output: `docs/checks/codex-sol-audit-1-authz.md` … `-5-db-schema.md`, plus
  `-6-production-readiness.md`.

---

## The prompt (paste everything in the block below into Codex)

````text
# KushHR — Independent AI-Built App Audit (READ-ONLY, one-shot, 6 reports)

You are a senior staff engineer performing an independent, adversarial audit of a
production HR/payroll web app (repo: KushHR). This codebase was built almost entirely by AI
agents — assume nothing is correct because it looks clean. Hunt for plausible-looking code
that is subtly insecure, inconsistent, over-abstracted, or silently broken.

You are a THIRD independent AI system (GPT-5.6 "Sol"). Two other systems have already audited
this same code. Your value is independence — form every conclusion from the source alone.

## INDEPENDENCE — do NOT read any prior reviewer's work (hard bar, throughout)
To keep this pass genuinely independent, you MUST NOT open, read, grep, or reference any of
these files at any point:
  - docs/checks/codex-audit-1-authz.md, -2-auth-audit.md, -3-ai-quality.md,
    -4-performance.md, -5-db-schema.md
  - docs/checks/codex-audit-review.md
  - docs/checks/fable-audit-1-authz.md, -2-auth-audit.md, -3-ai-quality.md,
    -4-performance.md, -5-db-schema.md
  - docs/checks/fable-audit-prompts.md
  - docs/checks/audit-summary.pdf
  - docs/checks/audit-remediation-plan.md
Do not open any docs/checks/*-audit-*.md other than your own six output files (created fresh).
Form your own findings; do not anchor to, shortcut from, or corroborate against prior work.

## HARD CONSTRAINT — the ONLY changes you may make
You may create exactly SIX files, all under docs/checks/, all new:
  - docs/checks/codex-sol-audit-1-authz.md
  - docs/checks/codex-sol-audit-2-auth-audit.md
  - docs/checks/codex-sol-audit-3-ai-quality.md
  - docs/checks/codex-sol-audit-4-performance.md
  - docs/checks/codex-sol-audit-5-db-schema.md
  - docs/checks/codex-sol-audit-6-production-readiness.md
Everything else is strictly read-only. Do NOT modify source, config, migrations, tests, or
docs. Do NOT run destructive, mutating, or stateful commands (no migrations, no docker compose
up, no DB writes, no installs). Read and reason only.

## Web research (permitted this run)
You MAY use web search to ground judgments in current industry best practices, CVEs, framework
guidance, and comparable-product norms. BUT: for Reports 1–5 every finding must still cite
file:line evidence in THIS repo — research informs your judgment, it does not substitute for a
concrete input/state → wrong-output/exploit trace. Report 6 is the one section where
best-practice research is the primary input. Cite sources you lean on.

## Stack (verify against the repo; don't trust this list)
Next.js 16 / React 19 (App Router; Server Actions + Route Handlers) · self-hosted Supabase
(Postgres 17) via Docker Compose, RLS-enforced · Supabase GoTrue auth + storage · Caddy TLS ·
Zod validation · Playwright E2E.
Read AGENTS.md first: this is a *modified* Next.js — APIs/conventions differ from upstream.
Check node_modules/next/dist/docs/ before assuming any Next behavior.

## Ground yourself before judging
Read the intended-design docs, then audit code against them and flag where code and doc
disagree: docs/security-model.md, docs/rls-policy-map.md, docs/access-matrix.md,
docs/database-design.md, docs/systems-thinking.md, supabase/migrations/.
Do NOT re-report items already logged in docs/ai-built-app-risk-audit.md,
docs/checks/phase-13.md, docs/ultrareview-findings.md unless you have new evidence they are
unresolved. (These are the OLD prior audits — read them only to avoid duplication; they are
NOT the parallel reviewers barred above.)

## Evidence bar (Reports 1–5)
Cite file:line. Give a concrete input/state → wrong-output/exploit scenario. If you can't
construct one, mark it UNVERIFIED and say what you'd need to confirm it. No speculative
"could be an issue." Skepticism and proof over comprehensive-sounding coverage.

## AI-authorship lens (keep active throughout)
Watch for the tells of multi-session AI authoring: hallucinated/misused APIs, confident-but-
wrong security, copy-paste twins that diverged, inconsistent conventions across files that
should match, dead/orphan code, speculative one-caller abstractions, and tests that pass
without proving anything.

## Authorship / provenance header (MANDATORY, top of every one of the six files)
Directly under each report's title add:
  > Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on <CURRENT DATE>.
  > Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].
Use the actual current date. These are fresh files, so there is nothing to merge — but keep
the header/legend so a future appended pass stays attributable.

---

# Perform all SIX workstreams below and write all SIX files.

Audit each workstream on its own merits; a finding may legitimately surface in more than one
lens, but report it in the most-fitting file and cross-reference rather than duplicating full
detail. Complete all six — do not stop early.

## Report 1 — Authorization, RLS↔app agreement, data exposure → codex-sol-audit-1-authz.md
Trace every Server Action and Route Handler end to end. For each:
- Authenticated? Authorized for the actor's ROLE (not just "logged in")?
- Object-level checks — can a manager act outside direct reports? Can an employee reach
  another employee's row? (IDOR)
- Service-role key: enumerate EVERY usage; is any path reachable with user-controlled input
  that bypasses RLS? This is the highest-risk pattern — justify each call site.
- RLS vs application layer: does the DB grant match what the app allows? Cross-check
  access-matrix.md and rls-policy-map.md. Flag BOTH directions — DB looser than app (latent
  grant) and app looser than DB (real hole).
- Payroll/compensation & manager-visible data: over-broad selects, over-fetching, fields
  leaking to roles that shouldn't see them.
Structure: (1) Exec summary — is the authz model sound for real HR/payroll data? Top 5 risks.
(2) Findings ranked BLOCKER/NEEDS-FIX/NIT, each: file:line · defect · exploit scenario · fix ·
confidence. (3) Service-role-key usage inventory (every call site + verdict). (4) RLS↔app
disagreement table. (5) What you could not verify.

## Report 2 — Auth/session lifecycle, role→JWT, audit logging, storage → codex-sol-audit-2-auth-audit.md
- Identity & role propagation: signup → handle_new_user → role → JWT claims → how the app
  reads role. Any window where JWT role disagrees with the DB? Any self-elevation path?
- Session/cookie handling: secure flags, expiry, fixation, base-url/cookie derivation; SSR vs
  client auth-state consistency. Also inspect deployed auth config (e.g. signup enabled?).
- Audit logging: are all privileged actions AND all deny paths recorded, with correct actor
  and reason? Find state-mutating actions that write no audit row. Find deny-audit assertions
  that could false-pass on stale rows. Consider audit-write failure behavior (fail-open?).
- Storage/object access: upload validation (type/size/path), cross-user read/write, signed-URL
  scope, path traversal.
- Secrets: anything leaking to client bundles, logs, or error responses.
Structure: exec summary · ranked findings (file:line + scenario + fix) · an "actions missing
audit coverage" list · could-not-verify.

## Report 3 — AI-authorship failure modes + maintainability → codex-sol-audit-3-ai-quality.md
Optimize for finding CLASSES of problem, not individual nits:
- Hallucinated/misused framework APIs (esp. the modified Next.js — verify against
  node_modules/next/dist/docs/).
- Copy-paste drift: near-duplicate actions/components/validation that diverged so a fix landed
  in one twin and not the other. Name the twins.
- Convention inconsistency across files that should match (error handling, validation, audit
  logging, naming, data-access). Quantify how widespread.
- Dead/orphan code, unused deps (cross-check package.json), speculative single-caller
  abstractions.
- State-ownership violations vs docs/systems-thinking.md (derived copies that can drift).
- Test quality: tests asserting on stale/unscoped rows, mocking away the unit under test, or
  passing without proving the guard they claim.
- Type safety: any, unsafe casts, non-null !, unchecked external data.
- AI slop / needless complexity: give the simpler rewrite inline with a rough line-count delta.
Structure: (1) Exec summary + maintainability posture. (2) AI-authorship pattern summary — each
tell with 2–3 representative file:line instances (fix the class). (3) Ranked findings
(BLOCKER/NEEDS-FIX/NIT) with file:line + why + fix. (4) Dead-code / unused-dep list.
(5) Could-not-verify.

## Report 4 — Performance & optimization → codex-sol-audit-4-performance.md
- DB: N+1 patterns, missing/unused indexes (cross-check queries vs supabase/migrations/),
  unbounded selects, over-fetching, redundant round-trips — especially cross-service GoTrue
  calls in hot paths.
- Server rendering: data waterfalls in Server Components, sequential awaits that could
  parallelize, missing/incorrect caching & revalidation.
- Client bundle: unnecessary "use client" boundaries, heavy client deps (e.g. charting) that
  could be server-rendered or lazy-loaded.
- Server Actions: repeated auth/role lookups per request that could be memoized within a
  request.
For each item give expected impact (latency/bytes/query-count) and effort. Rank by
impact-per-effort. These are recommendations, not correctness blockers — but flag any that
ALSO causes a correctness/timeout bug.
Structure: (1) Exec summary — biggest wins. (2) Optimization list ranked by impact/effort, each:
file:line · issue · expected impact · effort · recommended change. (3) Could-not-verify (needs
profiling/runtime data).

## Report 5 — Schema, migrations & RLS integrity → codex-sol-audit-5-db-schema.md
- Walk supabase/migrations/ in order. Flag: migrations assuming state a prior one didn't
  create, non-idempotent DDL, destructive changes without guards, drift between migration
  history and database-design.md / rls-policy-map.md.
- RLS completeness: every sensitive table — RLS enabled AND policies for every operation
  (select/insert/update/delete)? Find tables relying on "no policy = deny" vs explicit deny.
  Find USING (true) or overly broad predicates. Check for column-level gaps (grants that let a
  privileged-but-scoped role rewrite fields the app forbids).
- FKs & integrity: FKs on profiles and core tables — cascade behavior, orphan risk. Triggers
  (handle_new_user, sync_role_to_jwt, insert_audit_log, leave balance/refund triggers) —
  correctness, failure modes, security-definer scope.
- Constraints: missing NOT NULL / CHECK / UNIQUE that let invalid HR/payroll data in.
Structure: (1) Exec summary — is the data layer sound and does it match the app's assumptions?
(2) Ranked findings (BLOCKER/NEEDS-FIX/NIT) with migration/file:line + scenario + fix. (3) RLS
coverage table (table × operation × policy present/verdict). (4) Could-not-verify.

## Report 6 — Production-readiness & professional-grade assessment → codex-sol-audit-6-production-readiness.md
This is a step back from line-level bug hunting: a senior-staff / principal-engineer OPINION on
whether KushHR is structured like professional, production-grade software — and if not, what
would make it so. Use web research freely here to benchmark against how the best software in
this class is actually built. Ground each judgment in what you SEE in this repo (name the files
/ dirs / config / scripts you're reacting to), but the framing is evaluative, not file:line
exploit tracing.

Assess at least these dimensions, and add any others you think matter:
- **Repo scaffolding & structure:** directory layout, module boundaries (app / server actions /
  DAL / lib / components), separation of concerns, naming, monorepo-vs-single, where business
  logic lives. Is it coherent and conventional for Next.js 16 + Supabase, or ad hoc?
- **Architecture & data layer:** the service-role-bypasses-RLS pattern, app-layer-as-sole-authz,
  DAL design, migration discipline, typing of DB access. Is this how a mature team would do it?
- **Change-management / engineering process:** branching, commit hygiene, PR/review gates, the
  plan-mode + Systems-Thinking + agents workflow described in CLAUDE.md/AGENTS.md, docs cadence,
  handover/phase discipline. Does the *process* look production-grade, or solo/ad-hoc?
- **Testing & CI:** coverage shape (E2E vs unit), what's gated in CI, forge/RLS security tests,
  test-data hygiene, whether green CI actually proves safety.
- **Observability & operations:** logging, audit trail as telemetry, error tracking, metrics,
  alerting, health checks, runbooks, backup/restore, secret management, deploy story
  (Docker Compose self-host vs the AWS plan).
- **Security & compliance posture** at the program level (not individual bugs): does the overall
  approach meet the bar for real HR/payroll data (PII, access reviews, retention, least
  privilege, incident response)?
- **Dependency & supply-chain health:** pinning, unused deps, update cadence, advisory handling.
- **Documentation & onboarding:** could a new engineer get productive from the docs alone?

Structure:
1. **Verdict** — one paragraph: is this production-grade / professional-grade software today?
   Give a maturity rating (e.g. a 1–5 scale you define, or a "prototype / MVP / production-ready
   / mature" band) with a one-line justification.
2. **Dimension-by-dimension assessment** — for each dimension: what's genuinely good, what falls
   short of best-in-class, and the concrete gap. Cite the repo evidence (paths/files) and any
   industry references you used.
3. **What the best software in this class does differently** — specific, named practices/tools/
   patterns KushHR is missing or doing differently, with why they matter.
4. **Prioritized recommendations** — ranked, each with rough effort and the maturity gap it
   closes; separate "table stakes for production" from "nice-to-have polish."
5. **Honest caveats** — where a self-hosted ~15–20-user internal HR tool legitimately does NOT
   need big-company machinery (don't cargo-cult FAANG scale onto a small internal app); call out
   where lighter-weight is the *correct* professional choice, not a shortcoming.
````
