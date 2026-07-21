# KushHR — Build Story Beat Sheet (TIGHT, ~2–3 min)

The fast cut. ~10 beats, essence-forward. Read the **Essence** lines in order and you have the
whole story in ~2 minutes; the one-line *Detail* is there if a beat needs grounding. For the
medium (~5 min, 14 beats) or full (~8–10 min) versions, see the companion files.

**Shape:** *Essence* (say this) · *Detail* (one supporting line) · *Visual*.

---

### 1 — The premise
- **Essence:** A single-company HRMS built almost entirely by AI agents — but run like an engineering project, not a vibe-coding session.
- **Detail:** Codex + Claude, working against a written workflow, docs, and agent review gates.
- **Visual:** the live dashboard + tagline "built by AI, run like engineering."

### 2 — Plan and guardrails before code
- **Essence:** Nothing was built until the scope, the models, and the safety rules were written down.
- **Detail:** research → scope → architecture/security models → `systems-thinking.md` + RLS-first schema + a five-agent gate — all before the first feature.
- **Visual:** the "research → scope → agents → plan → build" pipeline.

### 3 — Foundation, then features, each one gated
- **Essence:** Database-with-RLS and auth landed as one locked layer; then one module at a time, each closed by an agent review.
- **Detail:** 13 migrations (RLS on every table + audit log) → auth/RBAC → directory, leave, documents, payroll, onboarding, dashboards, performance.
- **Visual:** the phase ladder (0→13) as a progress bar.

### 4 — The gate caught real bugs
- **Essence:** The agent review wasn't theatre — it failed a phase and stopped real security holes from shipping.
- **Detail:** a forgeable audit log, employee-readable payroll columns, and a predictable default password — all caught and fixed before close.
- **Visual:** red "GATE FAILED" → three bullets → green "fixed."

### 5 — Two AIs, handing off
- **Essence:** The build moved between Codex and Claude, then settled on Claude alone.
- **Detail:** Codex did the foundation; handed to Claude at Phase 7; converged to Claude-only for the final stretch.
- **Visual:** two-lane swimlane merging into one.

### 6 — We audited our own AI-built app
- **Essence:** Twice we turned the lens back on ourselves — and caught what "done" had hidden.
- **Detail:** a systems-thinking re-audit found two silent data bugs after "MVP complete"; a formal AI-built-app risk audit returned "GO" with none of the catastrophic AI failure modes present.
- **Visual:** "MVP ✅" with two cracks → patched; AI-failure-mode checklist all green but one.

### 7 — Independent and human review
- **Essence:** A separate cloud review and rounds of human click-through each found what the build sessions missed.
- **Detail:** cloud `/ultrareview` = 13 findings, all fixed; then multiple manual UAT rounds, one finding at a time.
- **Visual:** "13 → 13 fixed" and "Round 1→2→3→4" shrinking counts.

### 8 — The interface got a system
- **Essence:** Once the features existed, the hand-rolled UI was replaced wholesale with a design system.
- **Detail:** shadcn/ui adopted end-to-end, ending at zero legacy styles with every test still green.
- **Visual:** before/after UI split-screen.

### 9 — Workflow became infrastructure
- **Essence:** The habits that worked got turned into files the harness enforces.
- **Detail:** a change-workflow loop, real sub-agents, a one-command review runner, and a token pass that cut the resume payload ~10x.
- **Visual:** "convention → file" arrow.

### 10 — Flow-by-flow to v1
- **Essence:** Final hardening walked every user journey end-to-end, capped by a new reporting module — v1 complete.
- **Visual:** UAT-flow checklist all ticked → "v1 COMPLETE."

---

## Lessons — the 5-line digest
- **Codify the loop; don't rely on memory** — turn habits into CLAUDE.md rules, slash commands, or sub-agents.
- **Security is column-level, not just row-level** — and "RLS-as-filter" hides rows you forgot about.
- **No silent failures** — pair every denied/failed action with a visible signal and an audit row.
- **Instrument the bug, don't patch the symptom** — after two failed patches, measure the thing the user is complaining about.
- **Serial multi-agent review beats batched** — each pass narrows the next; explore before you plan.

*(Open thread: the "why Claude-only in the end" line in Beat 5 needs your input if you want it.)*
