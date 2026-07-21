# Narration 2 — "How KushHR was built"

**Voice:** Male. Measured, confident, documentary tone — steady forward momentum.
**Estimated runtime:** ~3:10–3:40 (≈ 470 words at 130–150 wpm). Comfortably under 5 min.
**Covers:** the objective build story end to end — the parts that were impactful and travel to other projects.
*Spoken text only below. Suggested visuals listed at the end so the read stays clean for voiceover/TTS.*

---

KushHR is a single-company HR platform — leave, payroll, documents, onboarding, performance reviews, dashboards, audit logs.

What makes it worth a closer look isn't the feature list. It's how it was built: almost entirely by AI agents — but run like a real engineering project.

It started with research, not code. Before a single feature, we locked the scope, chose the stack, and wrote the security and data models. We wrote down one governing rule for every change — name who owns the data, where it fails visibly, and what it could break. And we set up five review agents — research, quality, code review, design, and security — to sign off on every phase.

Then came the foundation: the database, with row-level security on every table, an append-only audit log, and authentication — all as one locked layer. Manager access to payroll isn't hidden in the interface; it's denied at the database itself.

From there, one module at a time — directory, leave, documents, payroll, onboarding, dashboards, performance. Each one closed out by those review agents before the next began. Reads before writes, so nothing shipped half-secured.

When we thought we were finished, we kept testing the work against itself. A second design-principles pass caught silent data bugs the demo would never have revealed. We ran a formal audit against the known failure modes of AI-built software — and it came back clean: no exposed keys, no public storage, no missing permission checks. An independent review found thirteen more issues; we fixed all thirteen. Then humans walked every screen — round after round — fixing real-world friction one finding at a time.

Once the features were solid, the interface got a full design system, replacing the hand-built screens end to end — without breaking a single test.

And the workflow itself matured along the way. The habits that worked became permanent tools: review sub-agents, one-command checks, and a leaner setup that made every working session more efficient. The process became part of the product.

The result is one codebase that becomes a different, scoped application for every role — admin, manager, employee. An action by one person surfaces on exactly the right dashboards. And every sensitive action leaves an entry in an audit trail that can't be edited.

Version one: complete.

Built with AI. Verified like it mattered — because it does.

---

## Suggested visuals (editor cues, not read aloud)
- Open on the dashboard; quick montage of the modules as they're named.
- The "research → scope → models → agents" pipeline as a simple flow.
- Layered diagram: database + row-level security → auth → app.
- Phase ladder (0→13) filling as a progress bar during the "one module at a time" line.
- Self-audit checklist: all green, one amber watch item.
- "13 findings → 13 fixed" counter; then "Round 1 → 2 → 3 → 4" shrinking.
- Before/after UI split-screen for the design-system line.
- Same screen shown three times (admin / manager / employee) for "one codebase, scoped per role."
- Close on "v1 COMPLETE."
