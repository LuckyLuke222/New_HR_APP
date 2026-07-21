# KushHR — Build Story Beat Sheet

Modular, format-agnostic. Each beat is self-contained so it can become a **narration line**, a
**slide**, or a **flowchart node**. Target run time ≈ 5 min (the 14 arc beats). Every beat cites
its source sessions in `source-index.md` so claims stay verifiable.

**Per-beat shape:** *Essence* (the one spoken takeaway) · *Detail* (2–3 supporting facts) ·
*Sources* · *Visual hook* (what to show).

---

## Part A — The Build Story (14 beats)

### Beat 1 — The premise
- **Essence:** A single-company HRMS, built almost entirely by AI agents — but run like an engineering project, not a vibe-coding session.
- **Detail:** Admin / Manager / Employee roles; leave, documents, payroll, onboarding, performance, dashboards, audit, reporting. Two AI systems (Codex + Claude) working against a written workflow, docs, and agent gates.
- **Sources:** `PROJECT_CONTEXT.md`, `final-handover.md`.
- **Visual hook:** the product in one frame (dashboard) + a tag line: "built by AI, run like engineering."

### Beat 2 — Research first, not code first
- **Essence:** Nothing was built until the problem, scope, and rules were written down.
- **Detail:** Researched HRMS/Supabase/Next/OWASP patterns → locked scope → wrote architecture, data-model, security-model, phase plan — *before* the first migration.
- **Sources:** S1–S5; `MainProjectSteps.md` 1–7; `scaffold-research.md`.
- **Visual hook:** the linear "Reusable Pattern" pipeline (research → scope → agents → plan → …).

### Beat 3 — Guardrails before features
- **Essence:** The safety scaffolding was poured before any feature stood on it.
- **Detail:** `systems-thinking.md` born (state-ownership / feedback / blast-radius). RLS-first schema rule. A five-agent gate (Research, QA, Review, UI/UX, Security) operating from the scaffold.
- **Sources:** S2 (5-agent gate), S9 (systems-thinking), S7/S10 (RLS-first).
- **Visual hook:** the three systems-thinking questions + the five agent badges.

### Beat 4 — The foundation
- **Essence:** Database, security, and auth came as one locked layer.
- **Detail:** 13 migrations — schema + RLS on every table + triggers + an append-only audit helper + JWT role sync. Then cookie-based auth/RBAC with `requireRole()` and `auth.access_denied` logging.
- **Sources:** S10–S12.
- **Visual hook:** layer diagram — Postgres+RLS → auth → app.

### Beat 5 — Features, phase by phase
- **Essence:** One module at a time, each closed by an agent gate.
- **Detail:** Directory → Leave → Documents → Payroll → Onboarding → Dashboards → Performance. Read slices before write slices, to avoid half-secured mutations.
- **Sources:** S13a–S23; `phase-plan.md`.
- **Visual hook:** the phase ladder (0→13) as a progress bar.

### Beat 6 — The gate that caught real bugs
- **Essence:** The agent review wasn't theatre — it failed a phase and stopped real security holes shipping.
- **Detail:** Phase 5 gate FAILED on three findings: a **forgeable audit log** (public RPC), **employee-readable sensitive payroll columns**, and a **predictable default password**. All fixed before close.
- **Sources:** S17a–S18a; `phase-5-agent-findings.md`.
- **Visual hook:** a red "GATE FAILED" card → three bullets → green "fixed."

### Beat 7 — Two AIs, handing off
- **Essence:** The build moved between Codex and Claude, then settled on Claude alone.
- **Detail:** Codex did planning + Phases 0–6; handed to Claude at Phase 7 (the handover numbering literally restarts there); alternated through remediation; converged to Claude-only from S136 onward. *(Why it ended Claude-only is left out for now.)*
- **Sources:** Multi-AI timeline in `source-index.md`.
- **Visual hook:** two-lane swimlane with handoff arrows, merging into one lane.

### Beat 8 — "MVP complete" wasn't
- **Essence:** Re-running the systems-thinking lens after "done" found two silent data bugs.
- **Detail:** Leave approval never decremented balances; soft-deleting a document orphaned the Storage file. Fixed with an atomic SECURITY DEFINER trigger + coordinated Storage cleanup.
- **Sources:** S24 / `MainProjectSteps.md` step 24.
- **Visual hook:** "MVP ✅" with two cracks → patched.

### Beat 9 — Auditing our own AI-built app
- **Essence:** We deliberately audited the app against the *known failure modes of AI-built software* — and it held.
- **Detail:** Verdict "GO with residual external watch." None of the catastrophic AI smells present: no exposed service-role key, no public bucket, no missing role-check across 35 Server Actions, no hallucinated imports. Two unused deps found and removed.
- **Sources:** S25–S27; `ai-built-app-risk-audit.md`; `deep-research-report-summary.md`.
- **Visual hook:** AI-failure-mode checklist, all green except one amber watch item.

### Beat 10 — An independent set of eyes
- **Essence:** A separate cloud review pass found issues the build sessions hadn't.
- **Detail:** Staged the whole codebase as a single PR for Claude Code's `/ultrareview`; 13 confirmed findings, all remediated with regression coverage; tests restored to green.
- **Sources:** S33–S34; `MainProjectSteps.md` 29–30.
- **Visual hook:** "13 findings → 13 fixed" counter.

### Beat 11 — Then humans walked it
- **Essence:** Automated and AI review still missed what a human clicking through caught.
- **Detail:** Multiple rounds of manual UAT remediation — confusing role/title pairings, silent-failure toasts, searchable selects, dashboard gaps — fixed one finding at a time with docs synced after each.
- **Sources:** S36–S99 (Rounds 3–4 / 8-May batches).
- **Visual hook:** "Round 1 → 2 → 3 → 4" with shrinking finding counts.

### Beat 12 — The interface got a system
- **Essence:** The hand-rolled UI was replaced wholesale with a design system, after the features existed.
- **Detail:** shadcn/ui adopted in sequence — unauthenticated pages → dashboards → forms → lists → stragglers — ending at zero legacy `slate-*`/`teal-*` classes, with every test selector preserved.
- **Sources:** S100–S105.
- **Visual hook:** before/after UI split-screen.

### Beat 13 — Workflow became infrastructure
- **Essence:** The habits that worked got turned into files the harness enforces.
- **Detail:** A canonical change-workflow loop; Systems-Thinking + Security promoted to real sub-agents; QA/Review/UI-UX as slash commands; a `/user-check` batch runner; and a token-efficiency pass that cut the resume payload ~72 KB → ~7 KB (token discipline that started as early as S11's "inline checks, no subagents").
- **Sources:** S123, S126, S136, S137, S138; S11 (early).
- **Visual hook:** "convention → file" arrow (memory → CLAUDE.md / slash command / sub-agent).

### Beat 14 — Flow-by-flow to v1
- **Essence:** Final hardening was a disciplined UAT walk of each user journey, ending with a new reporting module.
- **Detail:** Performance, leave, leave-admin, documents, onboarding, password-reset, payroll each walked end-to-end and closed; payroll reshaped to self-service + a manager RPC; admin reporting module built across 4 phases (a `research` sub-agent kicked it off) → **v1 complete**.
- **Sources:** S139–S159.
- **Visual hook:** UAT-flow checklist all ticked → "v1 COMPLETE."

---

## Part B — Lessons (the takeaway block)

Grouped for a closing segment or a separate "what we'd carry forward" slide. Each is a portable
rule, not a KushHR-only fact.

### Process / workflow
- **Codify the loop; don't rely on memory.** A process that's "we'll remember to do X" gets skipped. Turn the trigger, the action, or its output into a file the harness or the user can point at (CLAUDE.md rule, slash command, sub-agent). *(learning.md; S123/S126/S137)*
- **Keep project memory in repo files, not the chat.** A root contract (`PROJECT_CONTEXT.md`), an always-visible current-phase, append-only handover, and written agent-check artifacts beat conversation context every time. *(lessons-learned.md, prior-project-patterns.md)*
- **Don't mark a phase done without QA notes** — and keep handover/current-phase current, or you lose context. *(prior-project-patterns.md)*
- **File-loss safeguard.** Before any destructive step, back up gitignored files (`.env*`), confirm blast radius with the user, and guard `git clean` / `reset --hard` / `switch --orphan`. Leave orphaned code in place rather than risk deletion. *(MainProjectSteps.md; S110/S111)*

### Engineering
- **Security is column-level, not just row-level.** RLS row scope still leaked sensitive columns; the fix for read-scope at the DB layer is a SECURITY DEFINER RPC + revoking base-table SELECT. *(S155; phase-5 findings)*
- **"RLS-as-filter" creates invisible-row bugs.** A name-resolution join silently drops rows the viewer can't see, surfacing as a "missing → Unknown" gap; the right fix depends on whether the entity should be visible at all. *(S150, S151)*
- **Kill the silent-failure anti-pattern.** "Generic toast + console.error" hides the cause from the person who needs it; pair every denied/failed action with a visible signal and an audit row. *(S59, S66)*
- **Instrument the bug, don't patch the symptom.** When a UI bug survives two or three patches, stop guessing layers and add an assertion that measures what the user is complaining about (e.g. a DOM bounding-box check). *(S120; learning.md)*
- **Controlled vs uncontrolled forms is load-bearing.** React 19 resets uncontrolled fields after a form action; edit forms that must persist state need controlled fields or explicit preservation. *(S116; S64/S65 form-preservation)*
- **Server health gates the whole failure picture.** "Many tests failing" is usually a stale cache / orphaned dev server — kill the port + clean test data before debugging code. *(S152)*

### AI collaboration
- **Serial multi-agent review beats batched.** Running QA → Review → UI/UX in sequence (fixing between) lets each pass narrow the next; the three converge on *different* layers. *(S136)*
- **Explore before you plan.** A short exploration pass found half a feature was already shipped — halving the planned rework. *(S133)*
- **Cheap-first for big reads.** Condense large logs to load-bearing lines (and/or use a cheaper model) before the expensive synthesis pass — the method behind this very index, and a token-discipline thread from S11 through S138.

---

## Notes for turning this into the final artifact
- For a **flowchart**: Beats 2→14 already form a linear spine; the "Reusable Pattern" pipeline in `source-index.md` is the verbatim node sequence. Beat 7 (Codex/Claude) is the one place to branch into a swimlane.
- For **slides**: each beat = one slide (title = Essence, body = Detail, image = Visual hook).
- For **narration**: read the *Essence* lines in order for a ~2-min tight cut; add *Detail* for the ~5-min version.
- Keep this distinct from `demo-script.md` — that walks what the product *does*; this tells how it was *built*.
- Open thread: the "why Claude-only in the end" reasoning (Beat 7) still needs your input if you want it in the narrative.
