# KushHR — Handover Session Index

Mining index over `handover.md`. Built by condensing each session to its load-bearing lines
(Scope / What was done / What was learned / Systems-thinking / Next) — ~75% smaller than the
raw log — then tagging against the four demo deliverables.

**Coverage note.** `handover.md` uses two header levels: the foundation build (Sessions 1–23)
was logged as level-3 `### Session N`, while everything from Session 24 on uses level-2
`## Session N` (139 entries). Era 0 below (Sessions 1–23) covers the foundation block; Eras
1–12 cover Sessions 24–159. Two minor level-3 follow-ups (`### Session 111/112 — post-user-run`)
and one undated `### Session 2026-05-22` entry also exist and are folded into their neighbours.

## How to read this

**Tags** (a session can carry several):

| Tag | Meaning | Feeds deliverable |
|---|---|---|
| `BUILD` | Feature / milestone build work | (i) Building Story |
| `SHADCN` | shadcn/ui migration arc | (i) Building Story |
| `WORKFLOW` | AI-workflow infrastructure (agents, slash-commands, skills) | (iii) AI Workflow |
| `SUBAGENT` | Subagent / multi-agent review in action | (iii) AI Workflow |
| `TOKEN` | Token-minimization technique | (iii) AI Workflow |
| `CODEX` | Codex did the work, or Codex↔Claude handoff | (iii) AI Workflow |
| `SAFEGUARD` | RLS / security / systems-thinking gate / file-loss guard | (iv) Safeguards |
| `LESSON` | Generalizable lesson logged (often promoted to `learning.md`) | (i)/(ii) Lessons |

`*` = **landmark** session — the ones worth featuring in the video narrative.

## Quick map — landmark sessions per deliverable

- **(i) Building Story arc:** S2 (scaffold + 5-agent gate) → S9 (systems-thinking born) → S10 (schema/RLS) → S20a (leave) → S24 (MVP done) → S26/S30 (auth saga) → S33–S34 (ultrareview) → S36 (systems-thinking in practice) → S100/S105 (shadcn migration) → S143 (leave engine) → S155 (payroll reshape) → S156/S159 (reporting module, v1 complete).
- **(iii) AI Workflow:** roots in **S2** (5-agent gate), **S9** (systems-thinking.md), **S11** (inline checks for token conservation), **S17a** (agent gate catches real bugs) → formalized at S123 (change-workflow infra) → S126 (real sub-agents) → S136 (3-agent serial review) → S137 (`/user-check`) → S156 (`research` sub-agent). Token: **S11** (early) + **S138** (the big one). Codex-solves-what-Claude-couldn't: **S116a**.
- **(iv) Safeguards / change-workflow:** S7/S10 (RLS-first schema) → S9 (systems-thinking gate) → S17a–S18a (agent-gate security fixes) → S29 (RLS boundary tests) → S120 (DOM-measured assertion) → S123 (Systems-Thinking gate) → S138 (always-loaded payload discipline). Plus the explicit **File-Loss Safeguard** (see supplements).

---

## Era 0 — Foundation build (Sessions 1–23, the `### Session` block)

Research → scaffold → schema/RLS → auth → directory → leave → documents → payroll →
onboarding → dashboards → performance → hardening. This is the origin story for deliverables
(i)/(ii). **Numbering quirk:** the log holds two blocks — Sessions 1–20 (all dated 04-27,
planning + Phases 0–6) and a second Sessions 13–23 (04-27/28, feature build Phases 7–12). The
restart aligns with the Phase-7 Codex→Claude handover (see the multi-AI timeline), so the
duplicate 13–20 are *different* sessions. Marked `a`/`b` below where they collide.

| Session | Date | Tags | Gist |
|---|---|---|---|
| S1 | 04-27 | BUILD SAFEGUARD | Phase 0 research; `PROJECT_CONTEXT.md`; Server-Actions-as-public-endpoints + RLS guardrails set. |
| S2 * | 04-27 | BUILD WORKFLOW SAFEGUARD | Scaffold Next 16 + Supabase + Playwright + dashboard shell; **5-agent gate** (research/QA/review/uiux/security) all record pass. |
| S3 | 04-27 | WORKFLOW | Research docs + `agent-responsibilities.md` + CLAUDE.md/AGENTS.md created. |
| S4 | 04-27 | BUILD | Product scope locked: single-company HRMS, Admin/Manager/Employee. |
| S5 | 04-27 | BUILD | Phase 1 — architecture / data-model / security-model planning docs. |
| S6 | 04-27 | BUILD | Phase 2 scaffold formalized; phases renumbered to add explicit scaffold phase. |
| S7 | 04-27 | BUILD SAFEGUARD | Split schema/RLS (Phase 3) from auth/RBAC (Phase 4); `rls-policy-map.md` created. |
| S8 | 04-27 | BUILD | Phases 5–11 fully specified (no standalone reports phase). |
| S9 * | 04-27 | SAFEGUARD WORKFLOW | **`systems-thinking.md` born** — state-ownership / feedback / blast-radius questions + high-risk component map. |
| S10 | 04-27 | BUILD SAFEGUARD | All 13 migrations written: schema + RLS + triggers + audit helper + JWT role sync. |
| S11 * | 04-27 | TOKEN SAFEGUARD | Phase 3 checks run **inline, "no subagents — token conservation"** (earliest token-minimization signal); 35/40 pass. |
| S12 | 04-27 | BUILD | Phase 4 auth/RBAC close-out; `auth.access_denied` audit in `requireRole()`. |
| S13a | 04-27 | BUILD | Phase 5 employee directory — read-only slice (mutations deferred to avoid half-secured writes). |
| S14a | 04-27 | BUILD SAFEGUARD | Department mutations — Zod + server-side authz + audit. |
| S15a | 04-27 | BUILD SAFEGUARD | Admin employee create/edit via server-only Auth Admin client. |
| S16a | 04-27 | BUILD | Employee self-service edit (name/phone only; HR fields stay read-only). |
| S17a * | 04-27 | SUBAGENT SAFEGUARD | **Phase 5 agent gate FAILED** — agents caught audit forgery, compensation exposure, predictable passwords. |
| S18a | 04-27 | BUILD SAFEGUARD | Gate fixes: audit hardening (migration 0014), generated passwords, manager validation. |
| S19a | 04-27 | SAFEGUARD CODEX | Phase 5 close-out; static-verified audit path — "Codex had already fixed this." |
| S20a | 04-27 | BUILD | Phase 6 Leave Management built (DAL + actions + UI + self-approval guard). |
| S13b | 04-27 | BUILD SAFEGUARD | Phase 7 Documents — private bucket, Storage RLS, signed URLs, soft-delete. |
| S14b | 04-28 | BUILD SUBAGENT | Phase 7 agent exit checks; force `Content-Disposition: attachment`; false-alarm cross-checked. |
| S15b | 04-28 | BUILD SAFEGUARD | Phase 8 Payroll — compensation + change-request workflow; employee-safe summary DTO. |
| S16b | 04-28 | BUILD SUBAGENT | Phase 8 agent checks; TOCTOU hardened to atomic pending-only updates. |
| S17b | 04-28 | BUILD CODEX SUBAGENT | Phase 9 Onboarding agent-gate fixes (Codex took over at the gate); completeTask ownership lock. |
| S18b | 04-28 | BUILD | Phase 10 dashboards + admin audit-log viewer (no new schema). |
| S19b | 04-28 | BUILD SAFEGUARD | Phase 11 hardening pass; created security-review / qa-report / final-handover. |
| S20b | 04-28 | BUILD | Performance-appraisal research (HiBob/BambooHR) + scope; final hardening → Phase 12. |
| S21 | 04-28 | BUILD | Phase 11 Performance Appraisals built (migration 0018, DAL, actions, UI, dashboards). |
| S22 | 04-28 | BUILD | Remote migrations applied (0017/0018); runtime checklist queued. |
| S23 | 04-28 | SAFEGUARD | Phase 11 runtime checks via live SQL + JWT-context RLS simulation — all pass. |

## Era 1 — Phase 12 hardening + the auth saga (S24–S32)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S24 * | ~04-27 | BUILD SAFEGUARD | Phase 12 hardening; MVP complete. Fixed raw Supabase errors leaking to client. |
| S25 | 04-27 | BUILD | Built Playwright auth-fixture infra; hit GoTrue "DB error querying schema". |
| S26 * | 04-27 | BUILD LESSON | Fixed auth seed — raw `auth.users` inserts are brittle vs GoTrue's row shape. |
| S27 | 04-28 | BUILD | Performance mutation E2E coverage + audit-log assertions passing. |
| S28 | 04-28 | BUILD | Docs cleanup; document upload/download signed-URL runtime coverage. |
| S29 | 04-28 | BUILD SAFEGUARD | Direct RLS boundary + trigger-verification test suite complete. |
| S30 * | 04-28 | CODEX LESSON | Codex closed Phase 12 runtime hardening; GoTrue `auth.identities` rule learned. |
| S31 | 04-28 | BUILD | Keyboard/focus a11y pass + responsive visual regression sweep. |
| S32 | 04-29 | BUILD | Manual admin login confirmed; deterministic storage-state auth setup. |

## Era 2 — Ultrareview + test-data hygiene (S33–S35)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S33 * | 04-29 | WORKFLOW | Git/GitHub init; staged a full-codebase PR to drive Claude Code cloud `/ultrareview`. |
| S34 * | 04-29 | BUILD SAFEGUARD LESSON | Remediated all 13 ultrareview findings; human-flow review still matters after automation. |
| S35 | 05-06 | BUILD LESSON | Dry-run cleanup script for Playwright artifacts polluting manual review. |

## Era 3 — First manual-review remediation pass (S36–S43)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S36 * | 05-06 | BUILD SAFEGUARD | First RLS change run through `systems-thinking.md`; manager active-cycle visibility. |
| S37 | 05-06 | BUILD LESSON | Profile sub-tabs made thin views over module-owned tables (no stale promises). |
| S38 | 05-06 | BUILD LESSON | Row-level Edit actions on goals table → direct scoped mutation path. |
| S39 | 05-06 | BUILD | Employee goal-progress notes (separate field from manager-owned description). |
| S40 * | 05-06 | BUILD LESSON | Public `/forgot-password` + admin-only recovery-link generation path. |
| S41 | 05-06 | BUILD LESSON | Specific leave-approval failure messaging; trigger stays the atomic balance owner. |
| S42 | 05-06 | BUILD | Leave-request form shows scoped balance context (advisory, trigger is truth). |
| S43 | 05-06 | BUILD LESSON | Role/job-title confusion solved with guidance, not validation. |

## Era 4 — Searchable-select rollout + product-gap fixes (S44–S60)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S44 | 05-06 | BUILD | Searchable-select started on highest-friction admin employee form. |
| S45 | 05-06 | BUILD | Extracted shared `SearchableSelectField`; applied to performance forms. |
| S46 | 05-06 | BUILD LESSON | Onboarding completion-note column; Tailwind `target:` drill-down, no client state. |
| S47 | 05-07 | BUILD | Leave-admin balance form → searchable select + server-side label resolution. |
| S48 | 05-07 | BUILD | Document-upload admin picker → searchable select; applied migration 0026. |
| S49 | 05-07 | BUILD | Payroll admin picker → searchable select on GET filter form. |
| S50 | 05-07 | BUILD | Onboarding assignment selectors → searchable select; stale-bundle lesson. |
| S51 | 05-07 | BUILD | MetricCard made navigable (href) with composed aria-label. |
| S52 | 05-07 | BUILD | Manager/employee dashboards gain pending-approvals / pending-tasks panels. |
| S53 | 05-07 | BUILD | Review-cycle form status-aware success copy (onSubmit snapshot pattern). |
| S54 | 05-07 | BUILD SAFEGUARD | Employee payroll card stops rendering salary amount on dashboard. |
| S55 | 05-07 | BUILD | Currency free-text → MUR/AED/USD enum (app-layer hardening over text column). |
| S56 / S56b | 05-07 | BUILD | Mauritius bank-name dropdown (single source of truth list). |
| S57 | 05-07 | BUILD SAFEGUARD | Added passport/nationality columns in the sensitive HR-ID column group. |
| S58 | 05-07 | BUILD LESSON | Localized leave taxonomy via in-place rename (preserves all FKs). |
| S59 * | 05-07 | SAFEGUARD LESSON | "Generic toast + console.error" silent-failure → typed `employee.create_failed` audit. |
| S60 | 05-07 | BUILD LESSON | Cleanup script must track every test-data prefix or it silently under-reports. |

## Era 5 — Round 3 form-hardening (S61–S69)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S61 | 05-08 | BUILD | Round-3 findings intake; employee dashboard per-row leave balances. |
| S62 | 05-08 | BUILD LESSON | Phone defaults to +230 (Mauritius) via per-field helper-text pattern. |
| S63 | 05-08 | BUILD | Work-location defaults to Mauritius (same helper pattern). |
| S64 | 05-08 | BUILD SAFEGUARD | Preserve form input on failure — round-trip submitted values, no silent wipe. |
| S65 | 05-08 | BUILD SAFEGUARD | Form-preservation rolled across every form + Playwright-proven. |
| S66 | 05-08 | SAFEGUARD LESSON | `describeAuthError` → typed reason map surfacing real cause inline. |
| S67 | 05-08 | BUILD | Compensation mandatory-field validation (salary/currency/tax_id/national_id). |
| S69 | 05-08 | BUILD | Mandatory-field validation extended to performance/onboarding/leave forms. |

## Era 6 — "8 May" manual-review remediation, Batches 1–13 (S70–S99)

*Rows S70–S94 collapsed: a long run of Claude-driven remediation batches (correctness →
labels → pattern-consistency C1/C2/C3/C7/C8 inline-feedback sweep → directory/dashboard gaps).
Batches 9–13 were handed to Codex.*

| Session | Date | Tags | Gist |
|---|---|---|---|
| S70–S94 | 05-08→05-12 | BUILD SAFEGUARD | Batches 1–8 (Claude): validation, inline save-feedback, pattern consistency, dashboard gaps. |
| S95 | 05-12 | BUILD CODEX | Batch 9 — "Employees" → "People" terminology (routes stable). |
| S96 | 05-12 | BUILD CODEX SAFEGUARD | Batch 10 — employee-visible colleague directory via SECURITY DEFINER RPC. |
| S97 | 05-12 | BUILD CODEX | Batch 11 — clickability sweep (names, drill-downs, operational cards). |
| S98 | 05-12 | BUILD CODEX | Batch 12 — manager appraisal redesign (cycle-first side-by-side workspace). |
| S99 | 05-12 | BUILD CODEX | Batch 13 — dashboard card polish + tamed Next dev overlay; Batches 9–13 closed. |

## Era 7 — shadcn/ui adoption (S100–S105)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S100 * | 05-12 | SHADCN BUILD | shadcn init (slate/new-york, light-only) + extract Field/MetricCard; 2 pages as POC. |
| S101 | 05-13 | SHADCN | Migrate `/login`; unauthenticated surface fully on shadcn. |
| S102 | 05-13 | SHADCN | Migrate the three role dashboards. |
| S103 | 05-13 | SHADCN | Migrate the four big forms (employee/compensation/settings/performance). |
| S104 | 05-13 | SHADCN | Migrate list/queue pages (directory, leave, change-requests, audit). |
| S105 * | 05-13 | SHADCN | Stragglers + chrome sweep — migration complete, zero legacy classes. |

## Era 8 — employee-profile-lifecycle UAT (S106–S118)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S106 | 05-14 | BUILD | UAT Batches 1+2 — A1 terminate-revert + label fixes. |
| S107 | 05-14 | BUILD | Batch 3 — settings save feedback + pattern consistency. |
| S108 | 05-14 | BUILD | Batch 4 — directory filters (role/department/recent). |
| S109 | 05-14 | BUILD SAFEGUARD | Batch 5 — "Needs attention" employee flags (admin client). |
| S110 | 05-14 | BUILD | Batch 6 — collapsible/resizable sidebar + hello message; flow closed. |
| S111 | 05-14 | SHADCN BUILD | UI-polish "cheap 80%" pass; Phase 14 visual-system items queued. |
| S112 | 05-14 | BUILD | Cleanup script + journey-test hardening. |
| S114 | 05-15 | BUILD | Leave-balance manual-adjustment provenance. |
| S115a | 05-16 | BUILD LESSON | A1 follow-up — drop dual-ownership post-success resync effect. |
| S115b | 05-16 | BUILD LESSON | A1 — uncontrolled Status/End-date (later superseded by S116). |
| S116a * | 05-16 | CODEX LESSON | **Codex fix Claude couldn't land**: React-19 form-action reset; verified vs Next source + digest mechanism. |
| S116b | 05-16 | SHADCN | Alert `success` variant for save feedback. |
| S116c | 05-16 | SHADCN | MetricCard subtle/default share alignment grammar. |
| S117 | 05-16 | SHADCN | MetricCard tone alignment on dashboard operational report. |
| S118 | 05-16 | SAFEGUARD | D3 follow-up — specific identity reasons; sensitive cols stay admin-only. |

## Era 9 — Change-workflow infrastructure + Security/RBAC UAT (S119–S138)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S119a | 05-16 | BUILD | `/leave/admin` upsert alignment + sick-leave row clarification. |
| S119b | 05-16 | BUILD LESSON | Align Save button by structure, not pixel math. |
| S119c | 05-16 | SHADCN | Removed redundant searchable-select empty-state caption. |
| S120 * | 05-16 | CODEX SAFEGUARD LESSON | **Codex**: root-caused alignment via field contract; added DOM-measured regression assertion. |
| S121 | 05-18 | BUILD LESSON | Cross-tab stale-chrome fix; single-cookie-jar auth needs a client listener. |
| S122 | 05-20 | BUILD | Security & RBAC UAT completion + finding triage. |
| S123 * | 05-21 | WORKFLOW SUBAGENT | **Change-workflow loop born**: Systems-Thinking agent + `/user-qa\|review\|uiux` commands. |
| S124 | 05-22 | SAFEGUARD | Audit observability on zod-fail / row-not-found branches (paused mid-batch). |
| S125 | 05-23 | SAFEGUARD WORKFLOW | B3 completion + workflow infra + Category-B test fixes. |
| S126 * | 05-23 | WORKFLOW SUBAGENT | `.claude/` restructure — QA/Review/UIUX promoted to real sub-agents; wrap-up skill. |
| S127 | 05-23 | SAFEGUARD WORKFLOW | Access-denied consistency (throw + error boundary); added manual-smoke step. |
| S128 | 05-24 | BUILD SUBAGENT | B4 closure + B5 submission-lock full delivery (plan→tests→3 agent passes). |
| S129 | 05-25 | BUILD SUBAGENT LESSON | Onboarding-note "leak" was browser autofill, not React state; uiux silent-success. |
| S130 | 05-25 | BUILD SAFEGUARD | Peer-profile RPC; UUID-anchored Playwright assertions beat name-matching. |
| S131 | 05-25 | BUILD LESSON | Auth-flow polish; lazy `useState(window)` initializer → hydration mismatch. |
| S132 | 05-25 | BUILD LESSON | Audit-log mouse-nav; sticky-bottom action affordances on tall tables. |
| S133 | 05-26 | BUILD SUBAGENT LESSON | B5 deadline-lock; exploration-before-planning halved rework. |
| S134 | 05-26 | CODEX | B5 deadline-lock follow-up closure (Codex). |
| S135 | 05-26 | BUILD CODEX | `/performance` task-tab simplification for presentation (Codex). |
| S136 * | 05-26 | SUBAGENT WORKFLOW LESSON | 3 sub-agent passes converge on different layers; serial run narrows each next pass. |
| S137 * | 05-26 | WORKFLOW SUBAGENT | **`/user-check`** batch runner — auto-applies fixes, routes NITs, one decision block. |
| S138 * | 05-27 | TOKEN WORKFLOW LESSON | **Token fix**: resume payload 72KB→7KB; lean status board + de-dup CLAUDE/AGENTS. |

## Era 10 — performance-cycle UAT (S139–S142)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S139 | 05-27 | BUILD LESSON | B1+B2 — bootstrap review row on goal creation; render-during-render pattern. |
| S140 | 05-27 | SAFEGUARD LESSON | Supabase explicit-grants opt-in ahead of Oct-2026 enforcement. |
| S141 | 05-27 | BUILD SUBAGENT LESSON | B3 goal-list redesign; `Map.groupBy` unsafe — QA agent caught it. |
| S142 | 05-27 | BUILD SUBAGENT LESSON | B4 score/lock polish; QA caught double-icon + fragile border cascade. |

## Era 11 — Leave / leave-admin / doc / onboarding / password / payroll UAT (S143–S155)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S143 * | 05-28 | BUILD SAFEGUARD LESSON | Leave engine — working-days, half-day, refund-on-cancel; state-transitions touch 3 layers. |
| S144 | 05-28 | BUILD LESSON | Mid-walk leave fixes; `grant to service_role` mandatory under revoke. |
| S145 * | 05-28 | WORKFLOW LESSON | B1 balance-gating + UAT-table plan format + re-smoke-delta workflow rule. |
| S146 | 05-28 | BUILD SUBAGENT LESSON | Dashboard pending-leave surfacing; token-collision caught by uiux agent. |
| S147 | 05-29 | BUILD WORKFLOW LESSON | Leave-admin UX; uncontrolled `<details>` collapses on revalidate; `/smoke-done` skill. |
| S148 | 05-29 | BUILD LESSON | Cross-role leave calendar (SECURITY DEFINER RPC); smoke-driven scope needs a doc trail. |
| S149 | 05-29 | BUILD SUBAGENT LESSON | Calendar cap-and-spill; CSS opacity multiplies on descendants. |
| S150 | 05-30 | BUILD SAFEGUARD LESSON | Leave-admin hygiene; RLS-as-filter creates "invisible inactive" join gap. |
| S151 | 06-01 | BUILD SAFEGUARD LESSON | Doc-upload uploader RPC; two RLS "Unknown"-fallback bugs, opposite fixes. |
| S152 | 06-01 | BUILD LESSON | Playwright 75→0; server health gates the whole failure picture. |
| S153 | 06-01 | BUILD SAFEGUARD LESSON | New-hire onboarding; backfill admin into `employee_records` (cascade has blast radius). |
| S154 | 06-02 | BUILD LESSON | Password-reset UAT clean; Supabase-managed flows hide an off-cloud migration tax. |
| S155 * | 06-02 | BUILD SAFEGUARD LESSON | Payroll reshape — self-service + manager RPC; column grants restrict UPDATE not SELECT. |

## Era 12 — Admin reporting module (S156–S159)

| Session | Date | Tags | Gist |
|---|---|---|---|
| S156 * | 06-03 | BUILD WORKFLOW SUBAGENT | Reporting module: built `research` sub-agent + `/user-research`; Phase 1 shipped. |
| S157 | 06-03 | BUILD LESSON | Phase 2 (4 reports + grain toggle); parallel-test assertions need identity scoping. |
| S158 | 06-03 | BUILD LESSON | Phase 3 CSV export; `page.request` is not a reliable auth carrier behind a proxy. |
| S159 * | 06-03 | BUILD LESSON | Phase 4 themed charts — reporting v1 COMPLETE. Next entry: presentation prep. |

---

## Notes for the synthesis step

- **Building Story spine** falls out of the era headers above: hardening → auth saga → ultrareview → manual-review remediation → shadcn → UAT-by-flow → reporting module.
- **"Interface was bad → got shadcn"** maps cleanly to Era 7 (S100→S105), preceded by ad-hoc UI fixes in Eras 3–5.
- **"How bugs were resolved"** — the subagent/auto-remediation story lives in Era 9 (S123, S126, S136, S137) and recurs through Eras 10–11 (QA/UIUX agents catching issues inline).
- **"Codex solved what Claude could not"** — primary example **S116a** (React-19 form reset); supporting: S120 (alignment root cause), S30/S95–S99 (Codex batch runs), S134–S135.
- **Token minimization** is concentrated in **S138** (one rich, quotable session) plus the condense-then-tag method used to build *this* index.
- S70–S94 are collapsed; if the video needs specifics from that run, expand that range from `handover.md` directly.

---

# Storyline Supplements (from non-handover docs)

`handover.md` is the session-by-session *log*. These docs carry the framing the log
doesn't: the origin, the objective, the planned structure, and the carried-in lessons.
Organized by deliverable.

## (i) Building Story — origin, objective, structure

- **Objective / product scope** (`PROJECT_CONTEXT.md`, `phase-plan.md` Phase 0): a single-company HRMS with Admin / Manager / Employee roles, payroll privacy, leave, documents, onboarding, dashboards. Phase 0 goal stated explicitly: *"establish product scope, security baseline, privacy rules, and documentation rhythm before any code is written."*
- **The build was research-first, not code-first** (`MainProjectSteps.md` steps 1–7): research HRMS/Supabase/Next/OWASP patterns → lock scope → write agent responsibilities → architecture/data/security models → phase plan → systems-thinking rules — *all before schema*.
- **Stack chosen at scaffold and held** (`scaffold-research.md`): Next.js 16 App Router + TS + Tailwind, Supabase (`@supabase/ssr`), Zod, Playwright at scaffold time so permission tests had a home from Phase 1. Sensitive HR/payroll fields split into narrow stricter-RLS tables from the start.
- **The phase ladder** (`phase-plan.md`): Phase 0 research → 1 architecture → 2 scaffold → 3 schema/RLS (split from auth deliberately) → 4 auth/RBAC → 5 directory → 6 leave → 7 documents → 8 payroll → 9 onboarding → 10 dashboards/audit → 11 performance → 12 hardening → 13 AI-built-app risk audit.
- **Two unplanned pivots worth narrating:**
  - **systems-thinking gap audit** (`MainProjectSteps` step 24): after "MVP complete," re-evaluating against `systems-thinking.md` found two real gaps (leave approval never decremented balances; soft-delete orphaned Storage binaries) — both fixed with a SECURITY DEFINER trigger + storage cleanup. The MVP wasn't actually done; the audit caught it.
  - **shadcn adoption** (`MainProjectSteps` steps 61–66): the hand-rolled UI was migrated wholesale to shadcn/ui *after* the feature set existed — init → unauthenticated pages → dashboards → forms → lists → stragglers, ending at zero legacy `slate-*`/`teal-*` classes. This is the literal "interface was rough → adopted a system" beat.
- **Quality came in layers, not one pass** (`MainProjectSteps` steps 25–31, 54–60): AI-app pitfall research → evidence audit → independent cloud `/ultrareview` (13 findings, all fixed) → multiple rounds of manual human review (Round 3, Round 4 "8 May" 13 batches) → per-UAT-flow remediation.

## (ii) Video / graphic — ready-made structures to draw

Two artifacts in the repo are already shaped for a flowchart or slide, not prose:

- **The "Reusable Pattern" pipeline** (`MainProjectSteps.md`, verbatim): *research → scope → agents → phase plan → systems-thinking guardrails → schema/RLS → auth/RBAC → feature phases → agent checks → runtime hardening → handover → final QA/docs → systems-thinking gap audit → AI-app pitfall research → evidence audit/remediation → independent cloud ultrareview → manual human flow review → user-flow comparison → final multi-AI review.* This is a single linear flowchart spine for the build video.
- **The phase ladder (0→13)** doubles as a horizontal timeline / progress bar.
- **The Codex↔Claude handoff timeline** (below) is a natural two-lane swimlane.
- The existing **`demo-script.md`** is the *product* walkthrough (≈20 min, 9 flows, headline = cross-role leave flow). Keep the build-story video distinct from it: one is "how it was built," the other is "what it does." Don't merge.

## (iii) AI Workflow — the parts that predate the S123 infrastructure

The session-log landmarks (S123/126/136/137/138) are already indexed. These docs show the workflow existed in lighter form from day one:

- **Five named agents from Phase 0** (`phase-0.md`): Research, QA, Review, UI/UX, Security — each recording PASS / PASS-WITH-RESIDUAL-RISK at the gate. The agent fleet predates the formal `.claude/agents/` files; S123/S126 *codified* an existing convention.
- **The phase→check rhythm** (`lessons-learned.md`, `prior-project-patterns.md`): "do not mark a phase complete without QA notes"; checks kept as written artifacts, not terminal output. This is the cultural root of the later slash-command workflow.
- **The "Final Step" intent** (`phase-plan.md`): the project was always meant to end by extracting reusable skills/checklists for future projects — which is effectively what this whole demo-mining exercise produces.
- **`MainProjectSteps.md` is itself a workflow artifact** — a human-readable, append-only build ledger maintained alongside the machine log.

## (iv) Safeguards / change-workflow / lessons

- **File-Loss Safeguard (explicit)** (`MainProjectSteps.md`): before any destructive workflow — back up gitignored files (`.env*`), confirm blast radius with the user, use guard hooks to block `git clean` / `git reset --hard` / `git switch --orphan` until backup + confirmation. Also visible in practice: S110/S111 left orphaned components in place "per file-loss safeguard" rather than deleting.
- **Carried-in patterns from prior projects** (`prior-project-patterns.md`, from BlockchainIntelligence / Moove / Risk Analytics Module): append-only handover, always-visible current-phase, migration-first DB, explicit permission-boundary review every phase, UUID PKs, JSONB only for event payloads. Plus an explicit **"Mistakes Observed"** list — don't let handover lag, don't use UI hiding as authorization, don't introduce real HR data before RLS + negative tests, don't blindly apply forced audit fixes that downgrade the framework.
- **Security baseline set before schema** (`scaffold-research.md`, `phase-0.md`, `final-handover.md`): RLS on every table in the same migration; `@supabase/ssr` cookie auth + `getUser()` server-side (never trust the cookie alone); private Storage buckets + server-only signed URLs; Server Actions treated as public endpoints (authenticate → authorize-from-DB → Zod → mutate → safe error); service-role key isolated behind `server-only`; `profiles.role` as single source of truth mirrored to JWT via trigger; append-only audit log (insert RPC revoked from `authenticated`).
- **Intentional v1 scope exclusions** (`final-handover.md`): no 360/calibration, no payroll calc engine, no deadline reminder engine, no multi-tenant. Useful for the "what we deliberately didn't build" honesty beat.
- **The standing dependency watch-item** (`final-handover.md`, `phase-0.md`): a moderate PostCSS advisory via Next 16's nested dep, *not* fixed because the only `audit fix --force` path downgrades Next to 9.3.3 — a documented, deliberate non-fix. Good concrete example of judgment over blind remediation.

---

# Multi-AI Thread: Codex ↔ Claude (factual timeline)

Reconstructed from `MainProjectSteps.md` step attributions + `handover.md`. **Facts only** —
the rationale for the eventual Claude-only stretch is deliberately left out for now.

| Phase of work | Who | What |
|---|---|---|
| Phase 0–6 (research → leave) | Codex | Planning, scaffold, schema/RLS, auth, directory, leave (`MainProjectSteps` 1–12; foundation block S1–S20a, dated 04-27). |
| Phase 7 handoff | → Claude | Documents, Payroll, most Onboarding (step 13). **The handover numbering restarts here (S13b onward, 04-28) — that restart is the handoff evidence.** |
| Phase 9 gate | Codex | Resumed at the onboarding agent gate; fixed onboarding security/RLS (step 14; S17b). |
| Phase 10–12 | mixed | Dashboards + audit viewer, hardening, performance phase (steps 15–18). |
| Phase 12 runtime | → Claude | Authenticated Playwright expansion + GoTrue auth-seed fix; 47/47 (steps 19–21; handover S25–S30). |
| Ultrareview | Codex (cloud) | Independent `/ultrareview` of the full codebase; 13 findings remediated (steps 29–30; S33–S34). |
| Searchable-select slices | alternating | Codex: employee form, leave-admin, documents, payroll, onboarding (steps 40/42/43/44/45). Claude: performance + shared-component extraction (step 41). |
| Round-4 "8 May" batches | Claude → Codex | Claude closed Batches 1–8; Codex closed Batches 9–13 (D1 terminology, D2 directory RPC, clickability, perf redesign, card polish) (steps 55–60; S95–S99). |
| shadcn migration | Claude | All six sessions (steps 61–66; S100–S105). |
| The React-19 form-reset bug | Codex | The fix Claude's two attempts couldn't land — verified against Next source + digest mechanism (S115→**S116a**). |
| Alignment root-cause + DOM assertion | Codex | S120. |
| B5 deadline-lock follow-up; perf-tab simplification | Codex | S134, S135. |
| S136 onward (multi-agent review, `/user-check`, token compression, all later UAT flows, payroll reshape, reporting module v1) | Claude only | Codex's credit ran out mid-flow at S136 (the one documented trigger); every session after is Claude. |

**Graphic suggestion:** a two-lane swimlane (Codex / Claude) with handoff arrows at the
boundaries above, converging to a single Claude lane from S136. The "Codex solved what
Claude couldn't" beat (S116a) is the one place to call out by name.

*Gap flagged earlier: no doc states **why** the project finished Claude-only beyond
"credit ran out." That reasoning, if you want it in the narrative, comes from you.*

---

# Storyline Supplements — Batch 2 (audit output + agent-gate detail)

Two reference docs turned out to carry net-new narrative value, captured here.

## The Phase-13 self-audit — `ai-built-app-risk-audit.md` (2026-04-29)

This is the project auditing *itself as an AI-built app* — a strong climax beat for the build
story and a concrete safeguard artifact.

- **Verdict: "GO WITH RESIDUAL EXTERNAL WATCH."** The one open item is the upstream Next/PostCSS advisory with no acceptable force-fix — everything else resolved.
- **The AI-specific angle (deliverable i/iv):** the audit explicitly checked for the *catastrophic AI-built-app failure modes* and found none — no exposed service-role key, no public Storage bucket, no missing role-check across the 35 Server Actions, no hallucinated/unused imports (two unused deps were found and removed), no fake generated features beyond the intentional placeholder Settings page. That "we built it with AI, then audited it against known AI failure modes, and it held" is a distinct narrative beat from generic QA.
- **Classification table worth showing:** AI-specific smell = *limited*; generic smell amplified by AI = *yes* (inconsistent denied-action audit logging, large action files nearing the maintainability threshold); platform/autonomy-control failure = *not observed* (no agentic runtime in the app).
- **Positive-evidence frame:** service-role behind `server-only`, DB role as source of truth (not JWT alone), `auth.access_denied` before redirect, append-only audit helper, scoped Storage paths + MIME allowlist, payroll summary excludes bank/tax/national-ID, Zod+DB double-enforcement of the 1–5 score, real negative-RLS tests. Good "what 'done right' looks like" slide.

## What the agent gate actually caught — `phase-5-agent-findings.md`

Concrete detail behind the S17a "gate failed" landmark — the strongest evidence for the
AI-workflow deliverable (iii), because it shows the agents catching real security bugs, not nits:

- **Security agent (FAIL → fixed):** `insert_audit_log()` was a public security-definer RPC any authenticated user could call with caller-supplied actor/action — **forgeable audit log**. Fixed by routing all audit writes through a server-only service-role helper + migration 0014 revoking execute. Also: `employee_compensation` RLS was row-level not column-level (employees could select their own sensitive columns); **predictable default password** on employee creation.
- **Review agent (FAIL → fixed):** manager assignment was **UI-filtered only** — Server Actions now validate the manager UUID belongs to a valid admin/manager profile and block self-manager assignment; partial-state cleanup added to employee creation.
- **QA agent (FAIL → partial):** stale E2E for the protected auth flow; employee creation split across Auth Admin API + public tables risking partial state.
- **UI/UX agent:** detail tabs looked interactive but didn't switch; missing loading states; native `window.confirm`; missing live-region semantics + `aria-describedby`. All fixed.

**Narrative use:** "UI hiding is not authorization" and "audit logs must be unforgeable" are
two lessons the multi-agent gate surfaced *before* the feature shipped — exactly the value
proposition of the workflow.

---

## Scan accounting (for completeness)

- **Mined for storyline:** `handover.md` (all 1–159, h2+h3), `MainProjectSteps.md`, `phase-plan.md`, `scaffold-research.md`, `prior-project-patterns.md`, `lessons-learned.md`, `phase-0.md`, `final-handover.md`, `demo-script.md`, `PROJECT_CONTEXT.md`, `ai-built-app-risk-audit.md`, `phase-5-agent-findings.md`, plus `learning.md`/`README.md`/`CLAUDE.md`/`AGENTS.md` (workflow content).
- **Swept (keyword), confirmed reference-only:** the per-phase check files (`phase-3…13.md`), the UAT-flow scripts (`employee-profile-lifecycle.md`, `leave-request-lifecycle.md`, etc. — these are the demo's user flows, already in the demo folder), `qa-report.md`, `security-review.md`, `ultrareview-findings.md/setup.md`, `playwright-suite.md`, `follow-ups.md`, `pending-backlog.md`, `architecture.md`, `database-design.md`, `security-model.md`, `rls-policy-map.md`, `product-requirements.md`, `reporting_module.md`, the research docs, and the notes. Their storyline-relevant content is already reflected above; they remain the authoritative *technical* reference to pull from on demand during drafting.
