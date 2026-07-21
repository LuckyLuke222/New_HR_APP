# KushHR — AI Workflow & Safeguards (deliverable iii + iv)

Reconstructed from `CLAUDE.md`, `AGENTS.md`, `README.md`, `learning.md`, and the `.claude/`
references in `handover.md`. *(The `.claude/` skill/agent/command files aren't in this snapshot,
so the tier tables inside the `change-workflow` skill are described, not quoted.)*

---

## 1. The established workflow

### 1.1 The change-workflow loop (the spine)
Every code change ran through one mandatory loop, defined in `CLAUDE.md`:

1. **Plan mode first.** Non-trivial changes start in plan mode; if asked to code without it, the agent pushes back. Trivial exceptions (typos, one-line config) are called out and proceeded.
2. **Systems Thinking is part of the plan.** Every plan must answer the three questions — where state lives (owner + derived copies), where the failure feedback is, what the blast radius is. Also force-fires when a high-risk component is touched (`handle_new_user`, `sync_role_to_jwt`, `insert_audit_log()`, `storage.objects` RLS, FK on `profiles`) even for trivial edits, and re-fires if execution scope outgrows the plan.
3. **Execute only after explicit approval** (ExitPlanMode → wait for accept).
4. **Post-change agents block** — a pre-smoke gate the agent runs itself (`tsc --noEmit` + `eslint <changed files>`), then manual smoke, then the review agents, then targeted Playwright. The agent quotes the *exact* command; the human decides what to run.
5. **Update docs as part of execution** (immediate / end-of-session / phase-boundary cadence) with a `### Docs updated` line for traceability.
6. **`wrap up`** at session end — produces a cross-session doc evaluation and appends a dated `handover.md` entry with a load-bearing **Next** pointer.

Underneath it, four always-on habits: think before coding (surface interpretations, don't pick silently), simplicity first, surgical changes (every changed line traces to the request), and goal-driven execution (name the verifiable pass condition before coding).

### 1.2 The agent fleet (`.claude/agents/`)
Specialized sub-agents, each with a scoped tool allowlist and a structured output format:

- **systems-thinking** — pre-planning gate; answers the three questions. *(spawned by name)*
- **security** — security-sensitive review; severity-tiered output. *(spawned by name)*
- **qa** — post-change correctness (lint/types/targeted tests/checklist).
- **review** — architecture / quality / scope.
- **uiux** — visual / accessibility walk.
- **research** — read-only, web+codebase-grounded research brief → plan-mode hand-off (added late, for the reporting module; `model: opus` while the rest of the fleet was sonnet).

### 1.3 Commands and skills
- **Slash commands** (`.claude/commands/`): `/user-qa`, `/user-review`, `/user-uiux` (report-only), `/user-research`, and `/user-check` — the batch runner that fires the recommended agents in sequence, **auto-applies unambiguous BLOCKER/NEEDS-FIX inline**, routes NITs to follow-ups, and stashes ambiguous items for one end-of-run decision block.
- **Skills** (`.claude/skills/`): `change-workflow` (tier/routing heuristics for step 4–5), `smoke-done` (the post-smoke Playwright loop — classify each failure, fix only what this session caused, cap at 3 retries), `wrap-up` (session close + handover append).
- **One-word nudges** the human used to correct slips: `systems thinking?` / `post-change?` / `docs?` / `wrap up`.

### 1.4 Token-minimization techniques
- Inline checks instead of spawning subagents when context was tight ("no subagents — token conservation," from the earliest schema phase).
- A lean, forward-only `current-phase.md` status board; all per-session narrative confined to `handover.md`; de-duplicated `CLAUDE.md`/`AGENTS.md` — the resume payload dropped from ~72 KB to ~7 KB.
- Clear-context-between-batches during long remediation queues; resume from the handover **Next** pointer.
- Cheap-first reading of large logs (condense to load-bearing lines before the expensive pass) — the method behind the demo index itself.

---

## 2. Safeguards / change-workflow guardrails

- **The systems-thinking gate** is the central safeguard — it's what caught the post-MVP silent data bugs (un-decremented leave balances, orphaned Storage files) and what every plan is measured against.
- **File-loss safeguards** (`CLAUDE.md`): never delete files/branches/working-tree (including `.env*` and ignored files) without explicit approval; before any destructive git op (`clean`, `reset --hard`, `switch --orphan`, `rm`, branch delete) state exactly what will be lost and wait; after any tree-rewriting op, verify `.env.local` still exists or stop. In practice the team even left orphaned components in place rather than risk deletion.
- **Security baseline as standing constraints** (not per-task decisions): RLS on every table in the same migration; `getUser()` server-side (never trust the cookie alone); private Storage + server-only signed URLs; Server Actions as public endpoints (authenticate → authorize-from-DB → Zod → mutate → safe error); service-role key behind `server-only`; `profiles.role` as the single role source mirrored to JWT; append-only audit log.
- **Verification discipline:** the agent never runs full suites itself; targeted runs while iterating, full suites at human-run boundaries; the pre-smoke `tsc`+`eslint` gate is mandatory before the post-change block posts.
- **The Next.js guard** (`AGENTS.md`): "this is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before coding, because the framework version had breaking changes vs. training data.

---

## 3. Was it agentic? (honest assessment)

**Short answer: it was *agent-assisted with strong human gates* — not autonomously agentic — and it became more agentic over time without ever crossing into autonomy.**

On an autonomy spectrum — autocomplete → copilot → **agent-assisted (human-gated)** → supervised-autonomous → fully autonomous — KushHR sits squarely at *agent-assisted*, drifting toward *supervised-autonomous* only inside its verification sub-loops by the end.

**What was genuinely agentic:**
- Specialized sub-agents spawned with their own tool allowlists and structured outputs (a real multi-agent pattern, not one model role-playing).
- A bounded autonomous fix-verify loop (`smoke-done`: classify → fix only session-caused failures → re-run → cap at 3 retries).
- `/user-check` **auto-applying** unambiguous fixes and auto-routing NITs — the most autonomous single piece.
- Multi-step plan-then-execute within a session, with the agent choosing review tiers via the `change-workflow` skill.

**What kept it from being autonomously agentic — by design:**
- A human **approval gate** on every non-trivial change (plan mode → accept).
- The human **ran the tests** ("never run full suites yourself"), **applied every migration** (`supabase db push`), and **drove manual UAT** (≈140 scenarios as the safety net).
- Bookkeeping depended on **human nudges** (`wrap up`, the one-word corrections).
- The **Codex↔Claude switching was human-orchestrated**, not an agent routing decision.

So the honest framing for the talk: *the agency was in the **review and remediation**, not in the **execution and deployment**.* And that ceiling was appropriate — for an HR app touching payroll and PII, human approval on plans, security-sensitive changes, and DB migrations is a feature, not a gap. The gates earned their keep (Phase 5's gate caught a forgeable audit log; manual UAT caught scope drift the plans missed).

---

## 4. What a more-agentic setup would look like

Split into "removes toil, keep the judgment" (worth doing) and "where to deliberately keep the human."

### Worth doing — automate verification + bookkeeping
1. **A CI pipeline is the single biggest lever.** The reason "never run full suites yourself" exists is that there's no CI and full runs are slow/expensive in-session. GitHub Actions running lint/type/build/**full Playwright** on every PR — against an **ephemeral Supabase branch** — removes the human from the regression loop entirely and dissolves that constraint.
2. **Sandboxed self-verification.** Give the agent a throwaway DB + dev server so it can apply migrations and run the full suite itself, extending the existing `smoke-done` loop from targeted tests to full verification. Today the human is the test runner and deployer; this is what makes the loop close without them.
3. **Guard hooks instead of remembered rules.** Encode the file-loss safeguard and the pre-smoke gate as actual git/pre-action hooks that *block* `git clean`/`reset --hard` and fail the commit on red `tsc`/`eslint`. `learning.md` already gestures at this; moving it from "the agent states what will be lost and waits" to an enforced hook is strictly more agentic-safe.
4. **Auto-bookkeeping.** Replace the `wrap up` nudge and doc cadence with a commit/post-action hook that appends the handover entry and updates `current-phase.md`, so memory maintenance isn't human-triggered.
5. **A planner/orchestrator agent.** Instead of the human sequencing remediation batches and choosing models, an orchestrator that decomposes a UAT triage into batches and dispatches the right sub-agent — with a single human checkpoint per batch rather than per step.
6. **A spec-driven layer — the tools the project already flagged.** `MainProjectSteps.md` ends with "look into Spec Kit and Archon." That's exactly the upgrade path: **Spec Kit** makes plans executable, machine-checkable specs (spec → plan → tasks) so "Plan mode" output is verifiable rather than prose; **Archon** externalizes the handover/current-phase memory into a queryable knowledge store and coordinates multi-agent runs — turning the doc-as-memory pattern into agent-managed state.

### Keep the human (don't over-automate)
- **Plan approval** on non-trivial, security-sensitive, and migration changes — the gate caught real bugs.
- **Product decisions** (the AskUserQuestion calls — leave taxonomy, lock policy, peer-view fields).
- **Model selection / the decision to consolidate on one model.**

**Net:** the cheapest, highest-value path to "more agentic" is **CI + sandboxed self-verification + enforced hooks** (close the test/deploy/bookkeeping loops), while keeping the human on plan-approval and product/security gates. Spec Kit + Archon are the structural next step if the goal is multi-agent orchestration rather than a single agent in a loop.

---

## Talk hooks (for deliverable iii)
- "The agency was in the *review*, not the *execution*" — one-line framing of the honest answer.
- The `/user-check` auto-apply + `smoke-done` retry loop = the two most autonomous pieces; show them as the leading edge.
- The 72KB→7KB resume payload = the concrete, quotable token win.
- "Convention → file" — the moment a remembered habit became an enforced sub-agent/command is the workflow's maturation beat (S123 → S126 → S137).
- The honest "what would make it more agentic" list doubles as a roadmap slide — and it lands better *because* it admits the current ceiling.
