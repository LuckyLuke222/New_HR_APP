@AGENTS.md

## Communication style

Terse. Answer first, no preamble. Bullets > prose. Cut filler, keep clarity.

## Project memory index

- `docs/current-phase.md` — current phase status and next target (lean status board; no session prose).
- `docs/systems-thinking.md` — state ownership, feedback loops, blast-radius rules.
- `handover.md` — append-only session log; update after every phase.
- `docs/pending-backlog.md` — single source of truth for open items.

Cadence: `current-phase.md` is forward-looking only. `handover.md` is the only place per-session narrative goes. `MainProjectSteps.md` updates on phase boundaries only. Putting session prose into `current-phase.md` or `MainProjectSteps.md` is a regression.

## Mindset (apply throughout)

Four habits underneath the Change Workflow — apply inside every step, not as a parallel checklist.

1. **Think before coding.** State assumptions. Surface multiple interpretations — don't pick silently. If unclear, stop and ask before writing code.
2. **Simplicity first.** Minimum code that solves the problem. No unrequested features, abstractions, or flexibility.
3. **Surgical changes.** Touch only what the task requires. No adjacent refactors, reformatting, or unrelated lint. Every changed line traces to the request; remove only orphans your own changes created.
4. **Goal-driven execution.** Before coding, name the verifiable condition that proves the change worked — it lives in the plan's Verification section (exact `tsc`/`playwright`/manual-smoke commands the user runs after approval). If you can't write that section, you don't understand the task yet. Don't run full suites yourself. Example: *"Add manager-field validation"* → Verification names `npx playwright test admin.spec.ts -g "manager field"` and lists the manual-smoke steps; code until those pass.

## Change Workflow

Every code change follows this loop. No exceptions. Detailed tiering and routing tables live in the `change-workflow` skill (`.claude/skills/change-workflow/SKILL.md`), which fires at steps 4–5; the skeleton is mandatory and lives here.

1. **Plan mode first.** Non-trivial changes start in plan mode (Shift+Tab → Plan). If asked to change code without it, push back and request plan mode. Trivial exceptions (typos, doc-only edits, one-line config): call out and proceed.

2. **Systems Thinking is part of the plan.** Every plan MUST include a `### Systems Thinking` section answering the three questions from `docs/systems-thinking.md`: where state lives (owner + derived copies), where feedback lives (visible signal on failure), what breaks if changed (blast radius). A plan missing these is incomplete — don't present it.
   Also fires when a high-risk component is touched (`handle_new_user`, `sync_role_to_jwt`, `insert_audit_log()`, `storage.objects` RLS, FK on `profiles`) even for otherwise-trivial changes. If execution scope exceeds the plan, stop and re-run Systems Thinking on the new scope.

3. **Execute only after explicit approval.** Use ExitPlanMode; wait for accept.

4. **End every executed change with a Post-change agents block** covering a pre-smoke gate, manual smoke, `/user-qa`, `/user-review`, `/user-uiux`, and Playwright. **Invoke the `change-workflow` skill** to pick each tier (skip / recommend / strongly recommend / full suite) per its heuristics, and quote the **exact targeted command** for the user. The **pre-smoke gate** (`npx tsc --noEmit` + `npx eslint <changed files>`) is run BY YOU before the block is posted — fix any reds caused by this change, then mark the gate line passed. Never run full suites yourself — the user decides what to run for everything below the gate. After manual smoke passes, the user invokes `/smoke-done` and you run the targeted Playwright command quoted in the agents block under the loop contract in the `smoke-done` skill (classify each failure, fix only what this session caused, cap at 3 retries). The user can run sub-agents individually (report-only) or batch all `recommend`/`strongly recommend` ones via `/user-check` (auto-applies unambiguous BLOCKER/NEEDS-FIX, routes NITs to follow-ups, stashes ambiguous items for a single end-of-run decision block before manual smoke).

5. **Update relevant docs as part of execution — don't wait to be asked.** Doc updates build this project's knowledge base. Update at the right cadence (immediate / end-of-session / phase-boundary) per the routing rules in the `change-workflow` skill, and add a `### Docs updated` line to the agents block for traceability.

6. **End of session: `wrap up`.** Invokes the `wrap-up` skill (`.claude/skills/wrap-up/SKILL.md`): produces the Cross-Session Doc Evaluation, applies flagged updates, and appends a dated `handover.md` entry with a load-bearing **Next** pointer (what `/user-resume` reads first).

## File-loss safeguards

- Never delete files, branches, or working-tree contents without explicit user approval — including ignored files, `.env*`, and anything outside git history.
- Before any destructive git operation (`git clean`, `git reset --hard`, `git switch --orphan`, `git rm`, branch deletion), state what will be lost (including ignored/untracked files) and wait for confirmation. `git clean -fd` removes untracked files — flag it.
- After any operation that rewrites the working tree, verify `.env.local` and other ignored secrets are still present before proceeding. If absent, stop and report.
