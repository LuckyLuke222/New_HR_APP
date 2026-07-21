# KushHR — The Build in Simple Terms

A plain-language guide to the eras (as grouped in the deck) and the overall mental model.
Short sentences. For explaining the build out loud.

## The mental model (one line)

Build on a plan → find out "done" wasn't done and harden it → get outside and self audits →
fix what ad-hoc review found → standardize the UI → then do systematic flow-by-flow testing
(building the agent workflow midway) → finish with reporting. **v1.**

The thing to stress: the rigor that caught the most started *early* — right after it looked finished.

## The eras

**Era 0 · Foundation (S1–23).**
Research the domain. Lock the scope and roles. Design the data and security models. Set the guardrails (security rules, a 5-agent review) before any feature. Then build the modules one by one.

**Era 1 · Hardening & self-audit (S24–32).**
"Hardening" = a tighten-everything pass after features existed (clean builds, no leaked errors, every route protected).
Fixed a login blocker: the seeded demo users couldn't log in until their database rows matched what Supabase's auth service expected. That unblocked the automated tests (47/47).
Then the big one: the app had just been called "MVP complete" — but a re-audit found two silent bugs (leave approval never subtracted days; deleting a document orphaned the file). So "done" wasn't done.
Also audited the app against known AI-built-app failure modes → clean (GO).

**Era 2 · Independent review (S33–35).**
An automated review of the whole codebase at once. 13 findings, all fixed.

**Eras 3–5 · Early human review (S36–69).**
The *informal* testing. Click through the app as admin / manager / employee, spot issues, log them in one checklist, fix them one at a time.
Covered: profile fixes, leave feedback, role/title clarity, searchable dropdowns, sensible defaults, mandatory-field validation.
*(Not the structured flow docs — those come later.)*

**Era 6 · Batched remediation (S70–99).**
Same informal review, but a bigger round — ~30 findings organized into 13 batches.
Renamed "Employees" → "People," added a colleague directory, made things clickable, redesigned the manager appraisal.

**Era 7 · Design system (S100–105).**
The hand-built UI had drifted. Adopted shadcn/ui across the whole app. Zero leftover old styles. No tests broken.

**Era 8 · Systematic UAT begins (S106–118).**
Now the *structured* testing starts — one business journey end to end, using the flow docs (employee-profile-lifecycle first). Fix findings, then a visual polish pass.

**Era 9 · Workflow becomes tooling (S119–138).**
Mid-testing, the working habits were turned into real tools: a systems-thinking gate, sub-agents, a one-command review (`/user-check`), and a token-saving cleanup. Everything after this is more disciplined. (Security testing ran here too.)

**Eras 10–11 · Core-journey UAT (S139–155).**
More structured flow-by-flow testing, now using the new workflow: performance, leave, documents, onboarding, password reset, payroll. Payroll was reshaped to employee self-service + a manager view.

**Era 12 · Reporting module (S156–159).**
The recent work. Built the admin reporting module (started by a research sub-agent), in four phases. Reached **v1 complete**.

## The one clarification worth remembering

There were **two kinds of testing**:
- **Early & informal** (Eras 3–6): skim the app by role, log issues, fix in rounds.
- **Later & systematic** (Eras 8, 10–11): walk one full user journey at a time, using the flow docs.

The agent workflow (Era 9) was built *between* them — which is why the later testing was tighter.
