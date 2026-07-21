# KushHR — Build Story Beat Sheet (FULL, ~8–10 min)

The long cut. 18 beats with richer detail, more session citations, on-screen direction, and the
complete lessons set. Use this when the build story *is* the talk (not a 2-min intro). For
shorter cuts see `build-story-beatsheet.md` (medium, ~5 min) and `…-tight.md` (~2–3 min).

**Per-beat shape:** *Essence* (the spoken takeaway) · *Detail* (the facts) · *On screen* (visual
direction / live-demo cue) · *Sources* (sessions in `source-index.md`).

---

## Part A — The Build Story (18 beats)

### Beat 1 — The premise
- **Essence:** A single-company HRMS, built almost entirely by AI agents — but deliberately run like an engineering project, not a vibe-coding session.
- **Detail:** Roles: Admin / Manager / Employee. Modules: leave, documents, payroll, onboarding, performance, dashboards, audit logs, reporting. Two AI systems — Codex and Claude — working against a written workflow, living docs, and agent review gates. The thesis of the talk: AI changes the *defect profile*, so the discipline around it is what makes it production-grade.
- **On screen:** the live dashboard; tagline "built by AI, run like engineering."
- **Sources:** `PROJECT_CONTEXT.md`, `final-handover.md`, `deep-research-report-summary.md`.

### Beat 2 — Research first, not code first
- **Essence:** Nothing was built until the problem, the scope, and the rules were written down.
- **Detail:** Day one was research — HRMS MVP patterns, Supabase security, Next.js security, OWASP Top 10 2025 — feeding `PROJECT_CONTEXT.md`. Then scope was locked (single-company, three roles, payroll-as-admin-capability not a separate role), then architecture / data-model / security-model / phase-plan docs. The stack was chosen here and held: Next 16 App Router + TypeScript + Tailwind, Supabase (`@supabase/ssr`), Zod, Playwright at scaffold time so permission tests had a home from Phase 1.
- **On screen:** the verbatim "Reusable Pattern" pipeline from `MainProjectSteps.md`.
- **Sources:** S1–S5; `MainProjectSteps.md` 1–7; `scaffold-research.md`; `prior-project-patterns.md`.

### Beat 3 — Standing on prior projects
- **Essence:** The project didn't start from zero — it imported hard-won patterns from three earlier builds.
- **Detail:** From sibling projects (BlockchainIntelligence, Moove, Risk Analytics Module): append-only handover, always-visible current-phase, migration-first DB, explicit permission-boundary review every phase, UUID PKs, commit `.env.example` never `.env`. Plus an explicit "mistakes observed" list — don't let docs lag, don't use UI hiding as authorization, don't introduce real HR data before RLS + negative tests, don't blindly apply forced audit fixes that downgrade the framework.
- **On screen:** "carried forward" list, three source-project chips.
- **Sources:** `prior-project-patterns.md`, `scaffold-research.md` (Prior-Project Lessons Applied).

### Beat 4 — Guardrails before features
- **Essence:** The safety scaffolding was poured before any feature stood on it.
- **Detail:** `systems-thinking.md` was written as a cross-cutting gate — three questions (who *owns* this state? where's the *feedback*/audit? what's the *blast radius*?) applied to a high-risk component map (the auth triggers, the audit function, Storage RLS, FK delete behavior). Rules set up front: leave approval must update balance atomically; document delete must coordinate metadata + Storage; DB role always beats JWT claim; authorization failures must write `auth.access_denied`.
- **On screen:** the three systems-thinking questions; the blast-radius component map.
- **Sources:** S9.

### Beat 5 — Five agents at every gate
- **Essence:** Every phase was reviewed by five specialized agents before it could close.
- **Detail:** Research, QA, Review, UI/UX, and Security — each recording PASS / PASS-WITH-RESIDUAL-RISK with written notes, from the scaffold pass onward. This convention predates the formal `.claude/agents/` files by months; the later infrastructure just codified an existing habit.
- **On screen:** five agent badges; a sample gate report (Phase 0).
- **Sources:** S2, S3; `phase-0.md`.

### Beat 6 — The foundation
- **Essence:** Database, security, and auth landed as one locked layer — not bolted on later.
- **Detail:** 13 migrations: enums, every table with RLS enabled in the same migration, indexes on RLS columns, triggers (`handle_new_user`, `sync_role_to_jwt`), an append-only audit helper, and JWT role sync. `employee_compensation` has *no* manager policy — manager zero-access is enforced at the DB layer, not the UI. Then cookie-based auth/RBAC with `requireRole()` writing `auth.access_denied` before any forbidden redirect.
- **On screen:** layer diagram — Postgres+RLS → auth → app; a migration count ticker (0001→0013).
- **Sources:** S10–S12.

### Beat 7 — Features, phase by phase
- **Essence:** One module at a time, read-slice before write-slice, each closed by an agent gate.
- **Detail:** Directory → Leave → Documents (private bucket + signed URLs) → Payroll (compensation + change requests, employee-safe summary DTO) → Onboarding → Dashboards + audit viewer → Performance (cycles, goals, manager appraisal, self-review, acknowledgement). Mutations were deliberately deferred behind reads so nothing shipped half-secured.
- **On screen:** the phase ladder (0→13) as a progress bar; quick montage of each module.
- **Sources:** S13a–S23; `phase-plan.md`.

### Beat 8 — The gate that caught real bugs
- **Essence:** The agent review wasn't theatre — it *failed* a phase and stopped real security holes shipping.
- **Detail:** Phase 5's gate failed on three findings: a **forgeable audit log** (a public security-definer RPC any authenticated user could call with caller-supplied actor/action), **employee-readable sensitive payroll columns** (row-level RLS doesn't scope columns), and a **predictable default password** on employee creation. Also: manager assignment was UI-filtered only. All fixed before close — audit writes moved behind a server-only helper, execute revoked by migration 0014, server-side manager validation added.
- **On screen:** red "GATE FAILED" card → the three findings → green "fixed" with the migration number.
- **Sources:** S17a–S18a; `phase-5-agent-findings.md`.

### Beat 9 — The auth saga
- **Essence:** The hardest plumbing wasn't a feature — it was making seeded users actually log in.
- **Detail:** Authenticated end-to-end tests kept failing at login: GoTrue rejected SQL-seeded users because raw `auth.users` inserts don't match its expected row shape (missing `auth.identities`, nullable token columns). The fix — compatible identities + token defaults + correct password hashes — unblocked 47/47 Playwright tests. Lesson logged: prefer the Auth Admin API over raw seed SQL.
- **On screen:** "0/47 → 47/47" once the seed was fixed.
- **Sources:** S25–S30; S26 key learning.

### Beat 10 — Two AIs, handing off
- **Essence:** The build moved between Codex and Claude through the project, then settled on Claude alone.
- **Detail:** Codex did planning + Phases 0–6; handed to Claude at Phase 7 — the handover log's numbering literally restarts there, which is itself the handoff evidence. They alternated through searchable-select work and the "8 May" remediation batches (Codex closed Batches 9–13); Codex landed the React-19 form-reset fix Claude's two attempts couldn't; and from S136 onward it's Claude-only. *(Why it ended Claude-only is deliberately left out for now.)*
- **On screen:** two-lane swimlane with handoff arrows, merging to one lane at S136; call out the React-reset fix by name.
- **Sources:** the Multi-AI timeline in `source-index.md`; S116a.

### Beat 11 — "MVP complete" wasn't
- **Essence:** Re-running the systems-thinking lens *after* "done" surfaced two silent data bugs.
- **Detail:** Leave approval never decremented `leave_balances`; soft-deleting a document left the Storage binary orphaned. Both were invisible in the UI. Fixed with an atomic SECURITY DEFINER trigger (`trg_leave_balance_on_approval`) and coordinated `storage.remove()` on soft-delete.
- **On screen:** "MVP ✅" with two cracks → patched.
- **Sources:** S24 / `MainProjectSteps.md` step 24.

### Beat 12 — Auditing our own AI-built app
- **Essence:** We deliberately audited the app against the *known failure modes of AI-built software* — and it held.
- **Detail:** Verdict: "GO with residual external watch." None of the catastrophic AI smells present — no exposed service-role key, no public Storage bucket, no missing role-check across the 35 Server Actions, no hallucinated imports (two genuinely unused deps were found and removed). Classification: AI-specific smell *limited*; generic smell amplified by AI *yes* (inconsistent denied-action logging, large action files); autonomy-control failure *not observed*. The one open item: an upstream Next/PostCSS advisory with no acceptable force-fix.
- **On screen:** AI-failure-mode checklist, all green except one amber watch item; the positive-evidence table as a "what done-right looks like" slide.
- **Sources:** S25–S27; `ai-built-app-risk-audit.md`; `deep-research-report-summary.md`.

### Beat 13 — An independent set of eyes
- **Essence:** A separate cloud review pass found issues the build sessions hadn't.
- **Detail:** The whole codebase was staged as a single PR (orphan empty base + full snapshot branch) so Claude Code's `/ultrareview` would see everything as one diff. Result: 13 confirmed findings, all remediated with regression coverage and three new remote migrations; Playwright restored to green.
- **On screen:** "13 findings → 13 fixed" counter; the PR-diff trick as a diagram.
- **Sources:** S33–S34; `MainProjectSteps.md` 29–30.

### Beat 14 — Then humans walked it
- **Essence:** Automated and AI review still missed what a human clicking through caught.
- **Detail:** Multiple rounds of manual UAT remediation — confusing role/title pairings, silent-failure toasts, friction in entity pickers (systematized into one shared searchable-select component), dashboard gaps, terminology ("Employees" → "People"). Fixed one finding at a time with docs synced after each; full Playwright suite re-run at batch boundaries.
- **On screen:** "Round 1 → 2 → 3 → 4" with shrinking finding counts.
- **Sources:** S36–S99.

### Beat 15 — Test-data hygiene as a discipline
- **Essence:** Running real E2E against a shared database created its own mess — so cleanup became instrumented.
- **Detail:** Playwright runs left journey employees, noisy leave types, and orphaned rows that polluted manual review. The fix evolved into a dry-run/execute cleanup script with five layers of defence (continue-past-errors, broadened patterns, FK-cascade handling, per-user delete loop, try/finally in journey tests). Recurring lesson: a cleanup list only works if it stays in lockstep with the tests.
- **On screen:** "75 failures → 10 → 0" (server-health + cleanup) as a debugging-order lesson.
- **Sources:** S35, S60, S112, S152.

### Beat 16 — The interface got a system
- **Essence:** Once the features existed, the hand-rolled UI was replaced wholesale with a design system.
- **Detail:** shadcn/ui adopted in sequence — unauthenticated pages → three role dashboards → four big forms → list/queue pages → stragglers + chrome — ending at *zero* legacy `slate-*`/`teal-*`/`bg-white` classes. Hard constraints held throughout: no react-hook-form, native `<form>` + `useActionState` + `state.values` round-trip, native `<select>` (Playwright contract), every test selector preserved. Semantic accent colors (approved/pending/rejected) kept as meaning, not decoration.
- **On screen:** before/after UI split-screen; "0 legacy classes" badge.
- **Sources:** S100–S105.

### Beat 17 — Workflow became infrastructure
- **Essence:** The habits that worked got turned into files the harness enforces — so they couldn't be skipped.
- **Detail:** A canonical change-workflow loop (plan → systems-thinking → approve → execute → post-change review → doc update); Systems-Thinking and Security promoted to real sub-agents with read-only tool allowlists; QA/Review/UI-UX as slash commands; a `/user-check` one-command batch runner that auto-applies unambiguous fixes and routes the rest. And a token-efficiency pass that cut the per-resume payload ~72 KB → ~7 KB by turning a bloated status doc into a lean board and de-duplicating CLAUDE.md/AGENTS.md — token discipline that traces all the way back to S11's "inline checks, no subagents — token conservation."
- **On screen:** "convention → file" arrow (memory → CLAUDE.md rule / slash command / sub-agent); the 72KB→7KB bar.
- **Sources:** S123, S126, S136, S137, S138; S11 (early).

### Beat 18 — Flow-by-flow to v1
- **Essence:** Final hardening was a disciplined UAT walk of each user journey, capped by a new reporting module.
- **Detail:** Performance, leave, leave-admin, documents, onboarding, password-reset, and payroll each walked end-to-end and closed. Payroll was reshaped from a change-request workflow to direct employee self-service + a manager view-only RPC (sensitive columns unreachable at the DB layer). An admin reporting module was built across four phases — a reusable `research` sub-agent kicked it off — reaching **v1 complete**.
- **On screen:** UAT-flow checklist all ticked → "v1 COMPLETE"; the reporting module's themed chart.
- **Sources:** S139–S159.

---

## Part B — Lessons (full set)

### Process / workflow
- **Codify the loop; don't rely on memory.** "We'll remember to do X" gets skipped. Turn the trigger, the action, or its output into a file the harness or user can point at — a CLAUDE.md rule, a slash command, a sub-agent. *(learning.md; S123/S126/S137)*
- **Keep project memory in repo files, not the chat.** A root contract (`PROJECT_CONTEXT.md`), an always-visible current-phase, append-only handover, written agent-check artifacts. *(lessons-learned.md, prior-project-patterns.md)*
- **Phase gates with written QA notes.** Don't mark a phase done without them; keep handover/current-phase current or you lose context. *(prior-project-patterns.md)*
- **File-loss safeguard.** Before any destructive step: back up gitignored files (`.env*`), confirm blast radius with the user, guard `git clean` / `reset --hard` / `switch --orphan`. Leave orphaned code in place rather than risk deletion. *(MainProjectSteps.md; S110/S111)*
- **A status doc that grows is a token leak.** Prune it to a board; archive history elsewhere; don't load the same content twice across CLAUDE.md/AGENTS.md. *(S138)*

### Engineering
- **Security is column-level, not just row-level.** Row RLS still leaks sensitive columns; DB-layer read-scope needs a SECURITY DEFINER RPC + revoking base-table SELECT. *(S155; phase-5 findings)*
- **"RLS-as-filter" creates invisible-row bugs.** A name-resolution join silently drops rows the viewer can't see → a "missing → Unknown" gap; the right fix depends on whether the entity should be visible at all. *(S150, S151)*
- **Kill the silent-failure anti-pattern.** "Generic toast + console.error" hides the cause; pair every denied/failed action with a visible signal and an audit row. *(S59, S66)*
- **Instrument the bug, don't patch the symptom.** After two or three failed patches, add an assertion that measures the actual complaint (e.g. a DOM bounding-box check). *(S120; learning.md)*
- **Controlled vs uncontrolled forms is load-bearing.** React 19 resets uncontrolled fields after a form action; edit forms that must persist need controlled fields or explicit preservation. *(S116; S64/S65)*
- **Keep state mutation in one owner.** Leave-balance decrement belongs in the DB trigger (atomic), not the UI; the UI shows advisory context only. *(S41, S42, step 24)*
- **Server health gates the whole failure picture.** "Many tests failing" is usually a stale cache / orphaned dev server — kill the port + clean test data before debugging code. *(S152)*
- **A test-data cleanup list must track the tests.** `uniqueName(prefix)` + `LIKE` cleanup only works if every new prefix is registered. *(S60, S112)*

### AI collaboration
- **Serial multi-agent review beats batched.** QA → Review → UI/UX in sequence (fixing between) lets each pass narrow the next; the three converge on *different* layers. *(S136)*
- **Explore before you plan.** A short exploration pass found half a feature already shipped — halving the planned rework. *(S133)*
- **Cheap-first for big reads.** Condense large logs to load-bearing lines (and/or use a cheaper model) before the expensive synthesis pass — the method behind this index, and a token thread from S11 to S138.
- **AI changes the defect profile, not just the speed.** It's strong on scaffolded tasks and weak on production-readiness, security defaults, and independent verification — which is exactly why the gates, the self-audit, and the human UAT mattered. *(deep-research-report-summary.md; ai-built-app-risk-audit.md)*

---

## Notes for turning this into the final artifact
- **Flowchart:** Beats 2→18 form a linear spine; the "Reusable Pattern" pipeline in `source-index.md` is the verbatim node sequence. Beat 10 (Codex/Claude) branches into a swimlane.
- **Slides:** one beat per slide — title = Essence, body = Detail, image = On screen.
- **Narration:** Essence lines = the spine; add Detail for the full read. Beats 9 and 15 are optional cuts if you need to trim toward the medium version.
- **Keep distinct from `demo-script.md`** — that walks what the product *does*; this tells how it was *built*.
- **Open thread:** the "why Claude-only in the end" line (Beat 10) needs your input if you want it in the narrative.
