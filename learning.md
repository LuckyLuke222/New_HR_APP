# KushHR Learnings

Durable lessons to carry into future projects and future agent skills.

## Single-Cookie-Jar Auth Needs A Cross-Tab Listener Or The Chrome Lies

> **TO HIGHLIGHT IN WALKTHROUGH** — good story for the product-walkthrough presentation. Surfaced during manual UAT, *looked like* a critical cross-tenant data leak, turned out to be a Next.js Router Cache + shared-cookie-jar interaction. Useful narrative because (a) the triage path from "this looks catastrophic" to "this is visual only" is a teachable example of how to differentiate symptoms in authenticated apps, and (b) the fix is small and reusable across any cookie-session auth library, so the lesson travels.

**Date:** 2026-05-18
**Source:** Critical1.png finding before UAT in `docs/uat-flows/security-and-rbac-guards.md`
**Issue:** User signed in as Alex in Tab 1, opened a new tab in the same browser profile, signed in as Alice. Returning to Tab 1, the sidebar and user menu still showed Alex while the dashboard body had silently re-fetched and rendered as Alice. Looked like a session cross-contamination but was not.

### What Was Actually Happening

Supabase Auth — like NextAuth, Auth.js, and most cookie-session libraries — uses a single cookie name per project for the auth token. All tabs in a browser profile share one cookie jar, so signing in as a different account in Tab 2 overwrites the cookie globally. Tab 1's rendered DOM is from the previous user. The next partial re-fetch (a click, a prefetch, a Server Action) goes out with the new cookie and returns the new user's page payload. The Next.js Router Cache stitches that fresh page body inside the stale layout chrome that was never re-fetched.

The data is correct end-to-end — at the moment of the re-fetch the cookie and the response match. The visual mix is the bug: the user sees one identity in the chrome and a different one in the body and reasonably concludes the app cannot keep accounts separated.

### Why "It's Just Visual" Is The Wrong Frame

For an authenticated SaaS — especially HR, payroll, healthcare, finance — the chrome is the identity contract. A user looking at a screen does not reason about cookie jars. They reason about whether the company is trustworthy with their data. Even a one-time visual mix between two identities is read as "this software cannot be trusted with HR data," and rebuilding that trust is far more expensive than the original fix. Severity is anchored to the user's perception, not the engineer's mental model.

### Fix That Worked

Two changes:

1. **Client-side cross-tab listener.** A `"use client"` component subscribed to `supabase.auth.onAuthStateChange` (or the equivalent in whichever auth library), comparing the new session's user id to the `serverUserId` prop the layout was rendered with. On `SIGNED_OUT`, or on `SIGNED_IN` with a different user id, call `router.refresh()`. Ignore `TOKEN_REFRESHED` and `USER_UPDATED` — same user, no action.

2. **Layout-segment cache invalidation on logout.** The Server Action that signs out must call `revalidatePath("/", "layout")` before redirecting. Without this, even a single-tab logout-then-login can leave chrome from the previous session.

Both pieces are needed. (1) handles cross-tab cookie changes; (2) handles same-tab sign-out → sign-in.

### Skill Rule For Future Projects

For any Next.js app using cookie-based session auth:

- **Always wire a client-side `onAuthStateChange` listener at the top of the authenticated layout** that re-renders when the user id changes. This is not optional — it's the only cross-tab signal available.
- **Always call `revalidatePath("/", "layout")` on logout.** Path scope alone is not enough; layout scope is what invalidates chrome.
- **Pass the server-rendered user id as a prop** so the listener can detect "the user under me changed" and not just "the session updated."
- **Do not classify visual-only identity bleed as low-severity.** For authenticated apps it ranks alongside data isolation.

### Detection Recipe

Reproducible in 30 seconds with no tooling:

1. Open the app in one browser profile (Chrome or Firefox).
2. Sign in as User A in Tab 1, sit on the dashboard.
3. Open Tab 2 in the same profile, sign in as User B.
4. Switch back to Tab 1 and click anything (a Link, the dashboard refresh).
5. If the sidebar or user menu still shows User A while the body has updated, the listener is missing.

If this test passes the *first time*, the fix is wired correctly. If it only passes after a hard refresh, the layout cache is not being invalidated.

### Playwright Recipe

The scenario is testable with one `BrowserContext` and two `Page` objects — they share a cookie jar, exactly matching the bug condition. Pseudocode:

```ts
const ctx = await browser.newContext();
const tab1 = await ctx.newPage();
const tab2 = await ctx.newPage();
await signIn(tab1, "alex@…");
await tab1.goto("/dashboard");
await signIn(tab2, "alice@…");           // overwrites the cookie
await tab1.bringToFront();
await tab1.locator("a[href='/dashboard']").click();
await expect(tab1.getByText("Alex Admin")).toHaveCount(0);   // chrome refreshed
```

Without the listener, the `expect` fails (Alex still in the chrome). With the listener, `router.refresh()` fires and the chrome re-renders to Alice.

### Process Learning

Diagnosis took one extra turn because the symptom (sidebar says A, body says B) looked like a server-side cross-tenant leak. The differentiator is the *cookie jar test*: if the bug only reproduces inside a single browser profile and disappears across different browser apps, it is a cross-tab/router-cache problem, not a server isolation problem. Asking the user "different browser apps or different tabs in the same browser?" should be the first triage question whenever an identity-mix symptom is reported.

## React 19 / Next 16 Server Actions: Successful Form Actions Can Reset Inputs

> **TO HIGHLIGHT IN WALKTHROUGH** — good story for the product-walkthrough presentation. A "simple" UI bug (Status reverts to Active after saving Terminated) survived multiple Claude Code patches before Codex on Extra High reasoning isolated the root cause. Useful narrative because (a) it shows the limits of pattern-matching coding assistants when the bug lives in a framework-level behaviour (React 19's automatic post-success form reset), and (b) the meta-lesson — *stop patching symptoms, instrument one hypothesis at a time* — is the most reusable rule from the whole project. See also the cross-cutting rule at the bottom of this file.

**Date:** 2026-05-16  
**Source:** UAT A1 in `docs/uat-flows/employee-profile-lifecycle.md`  
**Issue:** Admin set Employment status to Terminated, clicked Save, saw "Employee updated.", but the edit form immediately showed Status = Active again while the database and other pages correctly showed Terminated.

### What Was Actually Happening

The database write was correct. The lie entered in the UI after the successful form action.

React form actions can reset form fields after a successful action. In this edit form, the success message from `useActionState` stayed visible, while the native Status `<select>` reset back to its initial Active option. The screen therefore mixed two different states:

- `useActionState`: "Employee updated."
- Native form reset / initial DOM state: Status = Active
- Database truth: `employee_records.employment_status = terminated`

This is why the user saw a contradictory screen: the save was real, but the form feedback was false.

### Failed Fixes To Avoid Repeating

- Adding `revalidatePath("/employees/[id]/edit")` fixed reload/navigation confidence but did not fix the in-place post-save render.
- Removing a stale `employee` prop resync was necessary but not sufficient.
- Switching the Status and End date fields to uncontrolled `defaultValue` made the reset hazard worse, because uncontrolled fields are exactly what successful form actions reset.
- Removing edit-route self-revalidation alone was tested and still failed the in-place A1 assertion with Status = Active.

### Fix That Worked

- Keep business-critical edit fields controlled when the page must stay in place after save.
- Return canonical saved values from the Server Action on success.
- Do not self-revalidate the current edit route when the already-mounted edit form should preserve the just-saved state.
- For the hydrated admin edit form, prevent the default native form-action submit and dispatch the existing `useActionState` action manually:

```tsx
const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  startTransition(() => {
    action(formData);
  });
};
```

This preserves the form after save and avoids React's automatic post-success form reset. Keep the native `action` prop as the progressive-enhancement fallback where useful.

### Skill Rule For Future Projects

For React 19 / Next 16 forms using Server Actions:

- Create forms may safely reset after success.
- Edit forms that remain on the same page must be audited for post-success reset behavior.
- If an edit form shows a success message and keeps the user on-page, pin an in-place assertion between the toast/status message and any reload/navigation.
- Do not assume `revalidatePath` gives read-your-write behavior for the current mounted form.
- Be suspicious when one field reverts but persistence is correct elsewhere; the bug is likely a UI feedback/reset/source-of-truth issue, not a database issue.

### Process Learning

This bug took multiple failed attempts from Claude Code and Codex before the root cause was isolated. The successful diagnosis required upgrading Codex reasoning to Extra High and explicitly testing each hypothesis:

1. Removing edit-route self-revalidation alone failed.
2. Preventing the native post-success form reset passed the targeted A1 Playwright regression.

When a "simple" UI state bug survives several patches, stop patching symptoms and instrument/test one hypothesis at a time.

## Form Row Alignment: Shared Field Contracts Beat Grid Tweaks

**Date:** 2026-05-16  
**Source:** UAT L3 in `docs/uat-flows/employee-profile-lifecycle.md`  
**Issue:** `/leave/admin` balance form showed Employee, Leave type, Balance, Year, and Save slightly misaligned even after multiple layout fixes.

### What Was Actually Happening

Claude Code fixed several real layers but missed the final one:

- grid row alignment (`items-end` vs `items-start`)
- Save button alignment by pixel nudge, then by structural spacer
- redundant empty-state caption below `SearchableSelectField`

The remaining offset came from the shared component contract. `SearchableSelectField` used an inline label, `mt-1` on the input, and older slate border/focus classes, while the neighboring native fields used `label.mb-1.block + h-10 control` with app tokens. The fields were not built from the same visual grammar, so the row could still look wrong even when the grid was technically correct.

### Fix That Worked

Normalize the shared field component to the same contract as native fields:

- label is block-level with `mb-1`
- control is `h-10`
- border/background/focus/error classes use the same app tokens
- empty captions are not rendered when the input placeholder already conveys the empty state

Then pin the layout with a DOM-measured Playwright assertion: compare the rendered top edges of all controls and fail if they drift beyond a small tolerance.

### Skill Rule For Future Projects

When a layout bug survives two or three CSS/grid attempts, inspect the component contract before adding more container tweaks:

- label display and margin
- control height
- border and focus styles that can affect rendered box metrics
- captions, hints, and validation branches below the control
- whether repeated fields share the same primitive

For visual alignment bugs, add a browser-measured regression. A screenshot can reveal the problem, but a bounding-box assertion prevents it from returning.

### Process Learning

Same shape as the React 19 form-action reset bug above: three symptom-patches landed (grid alignment → pixel nudge → structural spacer → empty caption) before the actual cause was diagnosed. Each patch made some real improvement but none measured the thing the user was complaining about (the top-edge delta between cells). A 5-line bounding-box assertion (`page.locator('#field').boundingBox().y` for each control, fail if delta > 2px) would have killed the bug after attempt 1 by forcing diagnosis onto whichever cell's top-anchor was off — instead of patching whatever visible artifact happened to be at the bottom of the cell.

### Cross-Cutting Rule

For both UI bugs of this kind — invisible state drift (form reset) and invisible geometry drift (row alignment) — the rule is the same:

> When a UI bug survives two or three patches, stop patching the visible symptom and add an instrumented assertion that measures the thing the user is actually complaining about. The failing assertion drives diagnosis to the right layer; without it, you keep guessing at layers in the wrong stack.

Symptom patches are cheap individually but compound into wasted cycles when the diagnosis is wrong. The instrumentation cost (one Playwright assertion, a few minutes) is paid back on the first wrong guess avoided.

---

## Workflow-as-infrastructure: codify the loop, don't rely on memory

### Context

Mid-project, the team had agent responsibilities defined as a doc-only convention (`docs/agent-responsibilities.md`) and Systems Thinking as a CLAUDE.md instruction. In practice this meant:

- Plan mode entry depended on the user remembering to Shift+Tab.
- Systems Thinking only ran when Claude remembered to apply the instruction.
- Post-change agents (QA / Review / UI/UX) ran when the user remembered to ask for them.
- Doc updates (handover.md, current-phase.md, pending-backlog.md) happened ad-hoc and frequently lagged.

Each gap individually was minor; together they produced unreliable traceability and risked silently-broken changes — exactly the failure mode `docs/systems-thinking.md` exists to prevent.

### Fix

Promote workflow from convention to infrastructure:

1. **One canonical loop in CLAUDE.md** — Plan mode → Systems Thinking → approve → execute → Post-change recommendation → Doc updates. Step 2 has explicit edge-case triggers (high-risk-component touch, mid-execution scope widening) so it doesn't depend on plan-mode discipline alone.
2. **Slash commands for post-change agents** (`/user-qa`, `/user-review`, `/user-uiux`) — turn three multi-sentence prompts into three keystrokes. Scope defaults to "what was changed in this session," so no arguments are needed in the common case.
3. **Subagents for the heavyweight roles** (Systems Thinking, Security) — separate `.claude/agents/` files with read-only tool allowlists and structured output formats. The remaining agents stay as in-thread checklists because they need to see the same context Claude just produced.
4. **One-word nudges** (`systems thinking?` / `post-change?` / `docs?` / `wrap up`) — the user can correct slips in one word instead of restating the rule.
5. **README muscle-memory section** — the workflow lives at the front door, not buried in CLAUDE.md.

### Skill Rule For Future Projects

When a process is "we'll just remember to do X" — at least one of (X, the trigger for X, the place X writes to) needs to be turned into a file the harness or the user can point at. Specifically:

- If the trigger is a user action → bind it in CLAUDE.md (or equivalent project memory) with an explicit edge case list, so the assistant pushes back when the action is skipped.
- If the action is repeated and parametric → make it a slash command. Multi-sentence prompts that recur become per-session friction; one keystroke removes it.
- If the action requires isolated context or different tool access → make it a subagent with a typed output format.
- If the artifact needs to be discoverable by future contributors → put a pointer in the README, not just in internal docs.

The cost is one-time (a few small files) and the saving compounds — every future change in the project follows the same loop without re-deriving it. Frictionless processes get followed; high-friction ones get skipped.

### Cross-Cutting Rule

The same principle as the UI bug-instrumentation rule above: **stop relying on memory; make the system measure or enforce the thing you care about.** For UI bugs, that means a bounding-box assertion. For workflow, it means a slash command, a CLAUDE.md trigger, or a subagent contract. In both cases, the cheapest path is to invest once in the instrumentation and let it pay back on every subsequent occurrence.

## Context Management: Clear Between Batches, Resume From The Pointer

### Trigger

UAT remediation runs as a long queue of independent batches (B1 → B9). Each batch is self-contained — plan, code, agents, tests, docs. Holding context across batches inflates the conversation transcript with finished work that no longer informs the next decision, and the model pays for re-reading it on every turn. The harness compresses older messages, but compression is lossy and consumes tokens in its own right.

### Symptom

- Token-per-turn cost creeps up across a multi-batch session. Late-batch responses become slower and more expensive than early-batch ones doing the same kind of work.
- The model occasionally re-derives earlier decisions because the compressed summary lost the load-bearing detail.
- Forgetting to clear means the next session starts with phantom context the user has to manually unwind.

### Fix

Two-part discipline, both load-bearing:

1. **Clear context between independent batches.** Once a batch closes (code merged or staged, docs updated, agents/tests run), the conversation that produced it is no longer useful input for the next batch. Use `/clear` (or the IDE equivalent) at the batch boundary. The fresh context starts cheap and the model loads only what the next batch actually needs.

2. **`/user-resume` is the safety net — but only if the handover "Next" pointer is precise.** The `wrap-up` skill writes a dated `handover.md` entry whose final `### Next` line is what `/user-resume` reads first. If the pointer is vague ("continue UAT"), the resume costs more tokens (the model has to read more files to triangulate) and risks restarting the wrong thing. If the pointer is precise (batch name + blocking question + sequencing context), resume is one file read plus one operational doc — minimal context, immediate productivity.

### Skill Rule For Future Projects

- **Clear early, clear often.** The cost of `/clear` is zero (the work is on disk). The cost of *not* clearing compounds every turn.
- **The handover `Next` line is the API contract between sessions.** Treat it like a function signature — load-bearing, must be precise, must include enough specificity that a cold session can re-enter without guessing. If you can't write a precise Next line, the batch isn't actually done.
- **Memory is for facts that persist; conversation is for work-in-flight.** The auto-memory system (`MEMORY.md` + per-fact files) holds user preferences, project facts, and references. The conversation holds active work. Don't conflate them — putting work-in-flight into memory creates stale notes; leaving facts in the conversation makes them die when context clears.

### Cross-Cutting Rule

Same shape as the two rules above: **stop relying on memory** (in this case the literal LLM context window) **and codify the handoff.** For UI bugs → bounding-box assertion. For workflow → slash command. For context → `/clear` + a precise `Next` pointer. The instrumentation pays back every cycle.

## State-transition expansions: RLS + action layer must move in lockstep with the trigger

### Trigger

Session 143 (2026-05-28). Adding cancel-of-approved as a new state transition for leave_requests, with a refund trigger to mirror the new path. The trigger worked, the action layer authorised the call, the audit row was written — yet the row stayed `approved` and the balance never refunded. UAT R1 caught it.

### What Was Actually Happening

The RLS policy `employee_cancel_own_leave` (migration 0006) had `using (... status = 'pending')`. It was authored when cancel was *only* a pending-only operation. With cancel-of-approved as the new behaviour, that RLS clause silently dropped the matching row from the UPDATE. PostgREST returned success with **0 rows affected, no error**. The Server Action didn't check `rowsAffected`, so it cheerfully wrote a `leave.cancelled` audit row claiming `refunded_days: 2`. The BEFORE UPDATE refund trigger never fired because the row was never updated.

The Systems Thinking pass for the change covered state ownership (frozen `deducted_days`), blast radius (every approval/refund flows through the trigger), and feedback loops on the submit form. But the feedback question on the cancel path was framed as "does the user see the refund prompt?" — not the deeper question: *"if the cancel silently fails, will anyone notice?"*

### Fix That Worked

Three-layer fix, must move together:

1. **RLS** — migration 0043 relaxed both `employee_cancel_own_leave` and `manager_cancel_own_leave` to `status IN ('pending', 'approved')`. The `with check (... status = 'cancelled')` clause stayed, so the target state is still pinned.
2. **Action layer** — `cancelLeaveRequest` now does `.select("id").maybeSingle()` on the UPDATE so a 0-row result is visible. 0 rows now returns a real error and writes an `auth.access_denied` audit row instead of a misleading `leave.cancelled`.
3. **Trigger** — unchanged; was already correct. The fix was getting the UPDATE to actually reach it.

### Skill Rule For Future Projects

- **State-transition expansions touch three layers, not one.** When a feature adds or relaxes a state transition (e.g. cancel-of-pending → cancel-of-pending-or-approved), the matching RLS policy was likely written against the *old* transition set. RLS rejection is the canonical silent-failure mode: PostgREST returns success-with-0-rows by design. Always re-read the RLS for that table and confirm both `using` and `with check` cover the new transition. Then audit every Server Action UPDATE/DELETE against that table for `rowsAffected` detection.
- **Server Action writes against RLS-scoped clients must `.select(...).maybeSingle()` (or check count).** If the action assumes "no error = success," it can't tell an empty result set apart from a permission denial. The pattern: chain `.select("id")` (or another cheap column) so a 0-row outcome can be distinguished from a real error and converted into a visible failure path *with* the right audit row (`auth.access_denied`, not a misleading "success" event).
- **Systems Thinking must ask the deeper feedback question.** "Does the user see this work?" is necessary but not sufficient. The right question is: *"Each layer this transition passes through — RLS, action, trigger, audit — if it silently failed, would anyone notice?"* If the answer for any layer is no, that's a missing feedback loop; instrument it before shipping.

### Process Learning

The plan's Systems Thinking section is a forcing function, not a checkbox. I wrote it, the user approved it, and I still missed the RLS layer because my mental model was anchored on the new code I was writing (trigger + action) rather than the *existing* code the change would interact with. The lesson: when planning a state-machine expansion, the Systems Thinking pass should explicitly enumerate every layer the new transition crosses — including the ones that already exist and look fine in isolation.

### Cross-Cutting Rule

State transitions are not point-in-time changes — they're paths through a stack. RLS + action + trigger + audit each gate or witness the path. When the path expands, every gate has to be checked against the new shape, not just the new code being added. Silent rejection at any layer is a feedback-loop bug, not "the database working correctly." The fix is always the same shape: surface the failure, audit it, and align the layer's contract with the new transition set.

## Negative side-effect assertions must be scoped by identity, not by a time window, under fullyParallel

### What happened
A Playwright test asserting "selecting a report does NOT write a `report.generated` audit" queried `audit_logs` with `.eq("action","report.generated").gte("created_at", since)` and expected 0 rows. With `playwright.config.ts fullyParallel: true`, sibling tests in the same file were clicking **Run** at the same instant, writing exactly those rows within the same `created_at` window. The negative test caught *other tests'* audits and failed intermittently. It passed in isolation (`-g`) and failed only in the full parallel run — the classic flake signature. Adding more report-generating tests this session raised the collision probability until it tripped.

### Root cause
The assertion's scope (`action` + time window) is shared by every parallel sibling that performs the same action as the same seeded actor. A time window does not isolate one test's side effects from another's when tests share a global table, a single seeded user, and an identical action vocabulary.

### Fix that worked
Scope the negative assertion to a value only this test could have produced, and drop the time window: the test selects the report with a **sentinel** `asOf=2099-12-31` and queries `.eq("metadata->>asOf", SENTINEL)`. The test never clicks Run and no other test generates with that date, so the expected count is deterministically 0 regardless of what runs concurrently. (`audit_logs.metadata` is jsonb — PostgREST/`supabase-js` support `.eq("metadata->>key", value)`.)

### Skill rule for future tests
- **A "this action did NOT happen" assertion is only safe if scoped to something unique to the test** — a sentinel input value, a per-test entity id, or a row the test alone could have created. `gte(created_at, since)` is *not* isolation under `fullyParallel` when siblings share the actor + action.
- **Positive assertions can use a time window; negative ones generally cannot.** For "X happened," any matching row proves it. For "X did not happen," every sibling's matching row is a false positive — pin the query to identity.
- **The flake tell:** green with `-g "<one test>"`, red in the full run. That's almost always shared-state contamination, not a logic bug — look for a global query that isn't scoped to the test's own identity before touching app code.

## Authenticated Route-Handler tests: drive the browser, not `page.request`, behind a proxy

### What happened
A Playwright test for the admin CSV-export Route Handler used `page.request.get("/reports/export?…")` and asserted `200 text/csv`. It got `200 text/html` — the auth middleware (`updateSession`) saw no session, redirected `307`→`/login`, and `page.request` followed the redirect to the HTML login page. The route was provably correct: an authenticated `curl` with the stored admin cookie returned a perfect `text/csv` body + filename.

### Root cause
The session cookie is a ~2.6 KB Supabase auth token. It rode real page *navigations* (`page.goto`) fine, but was dropped on the non-navigational API fetch (`page.request`) as it passed through the local `nginx` proxy fronting the dev server. No cookie → middleware treats the request as unauthenticated → redirect. `page.request` shares the context cookie jar in principle, but a proxy in front of the dev server can still strip/mishandle a large cookie on a bare fetch.

### Fix that worked
Test Route Handlers through the **browser**, which is the path proven to carry auth:
- **Attachment/download responses** — navigate to a page that surfaces the link, click it, capture `page.waitForEvent("download")`; assert `download.suggestedFilename()` (proves Content-Disposition) + the file body read from `download.path()`.
- **Status-only assertions (e.g. 403 denial)** — `await page.goto(routeUrl)` returns the `Response`; assert `response.status()`. Navigation carries the cookie; `page.request` may not.

### Skill rule for future tests
- **Don't assume `page.request` is authenticated just because the context has a storageState** — verify, especially when a proxy fronts the dev server. If a Route-Handler test returns `text/html`/`200` where you expected the handler's content type, suspect an auth redirect that got followed, not a handler bug.
- **Diagnose the server before the code:** a direct authenticated `curl` to the route on a clean port isolates "route bug" from "test-harness/auth bug" in seconds.
- **Route Handlers are not wrapped by the `(app)` error boundary** — `requireRole`'s `AccessDeniedError` only renders the in-place denial UI for pages; a Route Handler must catch it and return its own `403` (the `auth.access_denied` audit is still written before the throw).

## Self-hosted Supabase keeps Postgres in a bind mount — `down -v` does NOT wipe it

### What happened
While standing up the off-cloud self-host stack (`infra/supabase/`, from official `supabase/docker`), we rotated all demo secrets in `.env`, then ran `docker compose down -v && docker compose up -d` to re-init. The `db` came up "healthy" and `psql -U postgres` accepted the new password — but `auth`, `rest`, and `storage` crash-looped on `FATAL: password authentication failed ... (SQLSTATE 28P01)` for `supabase_auth_admin` / `supabase_storage_admin`. `app.settings.jwt_secret` still read the old demo value and `PG_VERSION` mtime was the *original* init time — the cluster had never re-initialized.

### Root cause
The official compose bind-mounts Postgres data at `./volumes/db/data` (not a named volume), so `docker compose down -v` — which only removes *named* volumes — leaves the cluster intact. The custom db entrypoint silently re-passwords *some* roles on every boot (e.g. `authenticator`, and the `postgres` superuser — which is why `psql -U postgres` misleadingly worked), but `supabase_auth_admin` / `supabase_storage_admin` passwords and `app.settings.jwt_secret` are set **only by the init scripts** (`roles.sql`, `jwt.sql`), which run **only when the data dir is empty**. So secret rotation silently half-applied.

### Fix that worked
Physically delete the bind-mount data dir so initdb + init scripts re-run under the new env:
```
docker compose down
rm -rf volumes/db/data
docker compose up -d
```
All 11 services then came up healthy under the new secrets.

### Skill rule for future infra
- **For the self-host stack, a "clean re-init" means deleting `volumes/db/data`, not `down -v`.** Same applies to the eventual on-prem deploy and any future secret rotation.
- **Verify a re-init actually happened, don't trust "healthy":** `stat -c %y /var/lib/postgresql/data/PG_VERSION` (mtime must be ~now) and `show app.settings.jwt_secret` (must equal the new secret). A passing `psql -U postgres` is a false signal — the superuser password is reset every boot regardless.
- **The crash-loop tell:** `db` healthy but `auth`/`rest`/`storage` restarting with `28P01` for the `*_admin` roles = stale init-time credentials, i.e. the data dir wasn't actually wiped.

### Corollary: switching the Postgres MAJOR version needs `down -v` AND `rm -rf volumes/db/data`
The `db` service ALSO mounts a **named volume** `db-config:/etc/postgresql-custom`, and `command:` runs `postgres -c config_file=/etc/postgresql/postgresql.conf`, whose conf `include`s version-specific fragments (pgsodium key, generated memory-tuning GUCs) from that volume. A named volume survives plain `down` (only `down -v` removes it). So bumping the db image (e.g. PG15→17, to match cloud) while leaving a stale `db-config` makes the new engine load 15-era GUCs → `FATAL: configuration file "/etc/postgresql/postgresql.conf" contains errors`, crash-loop. The image itself is fine (it boots clean standalone). **A major-version switch = `docker compose down -v` (clears `db-config` + other named vols) PLUS `rm -rf volumes/db/data` (the bind mount `-v` misses), then `up -d`.** Diagnose by running the new image standalone first (`docker run --rm -e POSTGRES_PASSWORD=… -v /tmp/x:/var/lib/postgresql/data <image>`) — if it reaches "ready to accept connections," the fault is your compose/volumes, not the engine.

## Data-only migration cloud→self-host: `pg_dump -t` overrides `-n`, and disable triggers via `session_replication_role`
Two traps hit while migrating real cloud data into the self-host stack (schema already applied from repo migrations, so **data-only**):
1. **`pg_dump -t <table> --schema=public` silently dumps ONLY the `-t` tables.** Combining `-t` (table) with `-n`/`--schema` (schema) does NOT union them — the `-t` patterns win and the schema's other tables are dropped from the dump. Tell: a suspiciously tiny dump. Fix: **separate `pg_dump` invocations** — one `-t auth.users -t auth.identities`, one `--schema=public` — then concatenate.
2. **`pg_dump --disable-triggers` needs table ownership at restore** (`ALTER TABLE auth.users DISABLE TRIGGER ALL` → `must be owner of table users`, since `auth.users` is owned by `supabase_auth_admin`). Instead, load as the `postgres` superuser with **`SET session_replication_role = replica;`** at the top of the (single-transaction) load — a session GUC that disables BOTH user triggers (e.g. `handle_new_user` racing the `profiles` insert) AND FK constraint checks, needing no per-table ownership. Reset to `origin` after.
- **Reference tables that migrations pre-insert** (`app_settings` singleton, `leave_types`, `public_holidays`, …) collide on PK with the cloud rows. For an "exactly as cloud" load, `TRUNCATE` every `public` table first (a `DO` loop, CASCADE), then load — all under `session_replication_role=replica`.
- Sanity: cloud may legitimately have **orphan rows** (e.g. soft-deleted `documents` whose storage blob was already removed). Diff orphan counts cloud-vs-self-host before calling it a bug — equal counts = faithful.

## Self-host Storage on a macOS bind mount fails with "filesystem does not support extended attributes"
storage-api writes xattrs on stored files; the `./volumes/storage` **bind mount on macOS Docker Desktop (virtiofs) can't store them** → uploads 500 with `The file system does not support extended attributes or has the feature disabled`. Fix: mount storage (the `storage` AND `imgproxy` services both mount `/var/lib/storage`) on a **named volume** (`storage-data:`) which lives on the VM's ext4 → xattrs work. On a real Linux on-prem host a bind mount on ext4/xfs is fine; this is a macOS-dev-only artifact, but the named-volume form also matches the dockerize plan and is portable.

## Dockerizing the Next app against self-hosted Supabase: keep ONE shared URL, don't split internal/public
When the app moves into a container next to the Supabase stack, the instinct is to give the **server** the internal Docker address (`http://kong:8000`) while the **browser** keeps the public URL. Resist it at small scale — the split is a net-negative:
- **The auth cookie name is derived from the URL host.** `@supabase/supabase-js` computes `storageKey = sb-${baseUrl.hostname.split(".")[0]}-auth-token` (verified in `node_modules/@supabase/supabase-js/dist/index.cjs`). Browser-on-public-host and server-on-`kong` derive **different cookie names → sessions silently break**. A split only works if you **pin** `cookieOptions.name` (ssr clients) / `auth.storageKey` (the supabase-js admin client) to one constant across all four factories — a standing footgun (drift = every request unauthenticated) and it invalidates existing sessions + saved Playwright `storageState`.
- **Server-generated signed URLs embed the client's base URL.** `storage-js` returns a *relative* `signedURL` and the client prepends its own base; the token is bound to the object **path**, not the host. So a server signing with `kong:8000` hands the browser an unreachable link unless you rewrite the origin — another thing every future `createSignedUrl` site must remember. (Our stack already sets `STORAGE_PUBLIC_URL` + `REQUEST_ALLOW_X_FORWARDED_PATH`, so with a single shared URL signed links are already public-origin — nothing to do.)
- **`NEXT_PUBLIC_*` are inlined at `next build`** (Next 16 `environment-variables.md`), so the public URL is frozen into the image. Fine when the on-prem URL is fixed per install; only worth a runtime-config endpoint if one image spans environments with different public URLs.

**The single-URL way (Option A), no app code change:** one `NEXT_PUBLIC_SUPABASE_URL` used by browser + server. Make the public host resolve **inside** the container with Docker-native `extra_hosts: ["<public-host>:host-gateway"]` (NOT an in-image `/etc/hosts` edit) so it reaches the Docker host's published Kong port; the host browser resolves the same alias via its own `/etc/hosts` (local) or real DNS (prod). Matches Supabase's "one public domain via reverse proxy" production guidance. The server→gateway hairpin is negligible at ~15–20 users. (Session 164; decision recorded in `docs/pending-backlog.md` §0 workstream 2.)

## Internal-TLS single front door: Caddy `tls internal` + path routing, and trust the CA on BOTH sides
On-prem deploy of the self-host stack behind one HTTPS origin (`https://kushhr.internal`, internal-only LAN — no public DNS / Let's Encrypt). One Caddy service does it:
- **Path routing keeps Option A intact.** Caddy terminates TLS and routes the Supabase prefixes (`/auth /rest /storage /realtime /functions /graphql /pg`, mirrored from `volumes/api/kong.yml`) to `kong:8000` and everything else to `web:3100`. Browser and server-side app both use the same `https://kushhr.internal`, so the `@supabase/ssr` cookie name (derived from the URL host) stays identical — no split, no pin. Verify the app has no top-level routes colliding with those prefixes (KushHR pages are `/login`, `/dashboard`, `/api/*`, … — clear).
- **`tls internal` mints a private CA** in Caddy's data volume (`/data/caddy/pki/authorities/local/root.crt`), generated at first boot. That CA must be trusted by **both** consumers or TLS fails closed: the **browser** (macOS keychain / OS trust store) **and** the **server-side `web` container** — Node does NOT use the OS store, so export the root CA and point `NODE_EXTRA_CA_CERTS` at it (mounted RO). Forgetting the container side is the silent trap: the browser works, but SSR/admin `fetch` to `https://kushhr.internal` throws cert errors.
- **Bootstrap ordering / cycle.** `web` mounts the CA that Caddy generates, so Caddy must start first → do NOT make `caddy` `depends_on web` (a reverse proxy tolerates a down upstream anyway). Sequence: bring up Caddy → `docker cp` the root CA out → build/up `web`.
- **Repoint the public-URL env or auth/storage break.** GoTrue + storage emit absolute URLs from `API_EXTERNAL_URL` / `SUPABASE_PUBLIC_URL` (→ `STORAGE_PUBLIC_URL`) — set them (plus `SITE_URL`, `ADDITIONAL_REDIRECT_URLS`) to the FQDN, else email/redirect links and signed-URL origins point at the old `localhost`.
- **Internal hops stay plain http** on the Docker network (Caddy→kong, Caddy→web); TLS only terminates at the edge. At real deploy: swap the FQDN, drop `extra_hosts` (real internal DNS resolves), distribute the CA to clients. (Session 165; `docs/pending-backlog.md` §0 workstream 2/3, plan `valiant-mixing-lemur.md`.)

## Schema-parity gate: "rebuilt from migrations" is "exactly as cloud" ONLY to the extent migrations are complete
The self-host DB schema is **rebuilt from `supabase/migrations/*`, not cloned** from cloud — so it matches cloud only where migrations are the complete source of truth. They usually aren't: anything added via the cloud dashboard's SQL editor (manual RLS, grants, indexes, event triggers) never enters the repo. **Prove parity, don't assume it** before cutover — `pg_dump --schema-only` both ends, normalize, `diff`.
- **Run both dumps with the SAME client version** to kill noise. Host `pg_dump` was 15.x vs PG17 servers; running both via `docker exec supabase-db pg_dump` (the in-container PG17 client) eliminated client-version diff artifacts. Tool: `infra/supabase/checks/schema-parity.sh` (read-only; archives to `docs/checks/schema-parity-cloud-vs-selfhost.md`; durable human classification in the sibling `schema-parity-notes.md` since the archive is regenerated each run).
- **What the first run caught (real out-of-band cloud drift, verified absent from migrations):** `public.rls_auto_enable()` + event trigger `ensure_rls` (auto-enables RLS on any new public table), and 4 `auth.users` perf indexes. Decision: port both into a new idempotent migration. **Benign noise to expect:** `storage.iceberg_*` tables exist only on self-host because its storage-api image is newer than cloud's — classify supabase-managed schema (`auth`/`storage`) diffs as image-version noise, make the **`public` diff the primary verdict**.
- **Event triggers are top-level, not schema-scoped** — `pg_dump --schema=public` dumps the trigger's *function* but not the `CREATE EVENT TRIGGER` itself; confirm the trigger via `pg_event_trigger` directly. (Session 166; `docs/pending-backlog.md` §0 workstream 3.)

## Running the cloud-authored Playwright suite against self-host: constrain workers, expect cloud-shaped assertions
The E2E suite was written/tuned against Supabase **cloud**. First full-suite run against the self-host stack (single dev-sized container behind Caddy) exposed two non-defect classes — read failures through this lens before treating them as regressions:
- **Concurrency: cloud's pooled/auto-scaled backend absorbed `fullyParallel`; one self-host node can't.** Full-parallel = 34 failures (the entire `employee` project, while admin/manager — same auth path — passed); `--workers=1` = 4. Every "failure" passed when run serially or in isolation → cross-project contention (e.g. manager tests mutating Alice while employee tests read her), not broken behavior. **Run the self-host gate with `--workers=1`** (or a low cap). Irrelevant to 15–20 real users — real usage isn't 30 destructive browser contexts on overlapping fixtures.
- **Behavioral deltas baked into assertions.** `admin.spec.ts:248` expects the cloud reset redirect `/login?message=password-updated` (anchored `$`); self-host appends `&next=/dashboard`. Reset *functionally works* — the regex is cloud-shaped. Such deltas → reconcile in `docs/follow-ups.md`, don't fix blindly.
- **Cookie origin must follow the test target, not `.env.local`.** To run the suite against the Caddy FQDN, `tests/e2e/auth.setup.ts` derives the minted cookie's name (`sb-<host>-auth-token`), domain, and `secure` from `PLAYWRIGHT_BASE_URL` (set `ignoreHTTPSErrors` for the internal CA; env-guard `webServer` so an external target doesn't spawn host-dev). The cookie name is **single-label-host only** (`hostname.split(".")[0]`) — a subdomain origin would derive the wrong name and silently log every auth test out. (Session 166; `docs/playwright-suite.md`, `docs/follow-ups.md`.)

## Porting cloud-only DB objects into a migration: superuser is `supabase_admin`, and don't touch the function body
Closing schema-parity drift = writing a migration that recreates the cloud-only objects. Two traps:
- **On the self-host Supabase stack, `postgres` is NOT a superuser — `supabase_admin` is** (Supabase strips superuser from `postgres`). Anything needing superuser — `CREATE EVENT TRIGGER`, `CREATE INDEX` on `auth.users` (owned by `supabase_auth_admin`) — must be applied as `supabase_admin`: `docker exec -i supabase-db psql -U supabase_admin -d postgres < migration.sql`. Earlier app migrations (`0001-0051`) create only ordinary public objects so they ran fine as a non-superuser, but the parity migration (`0052`) is the first that needs superuser → the cutover migration-apply step must run as `supabase_admin`. (No app-level migration-tracking table exists; migrations are applied by raw psql.)
- **Idempotency:** `CREATE OR REPLACE FUNCTION` + `CREATE INDEX IF NOT EXISTS` + a `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname=…) … $$` guard (there is no `CREATE EVENT TRIGGER IF NOT EXISTS`). Safe to re-run and a no-op on cloud.
- **A comment inside a `CREATE FUNCTION` body changes the stored `prosrc`** → it would re-open the very schema-parity diff you closed (pg_dump/`pg_get_functiondef` emit the body verbatim, comments included). When recreating a function byte-exact for parity, keep ALL explanatory comments OUTSIDE the `$$ … $$` body. Owner differences don't matter (the parity diff uses `--no-owner`). (Session 166; `supabase/migrations/0052_*.sql`, `docs/checks/schema-parity-notes.md`.)

## A Server Action that `revalidatePath`s its OWN heavy route wedges `useActionState` — and how to diagnose "Saving… forever" fast

> **TO HIGHLIGHT IN WALKTHROUGH** — a long, expensive bug hunt that resolved to a small client-side change. The teachable part is the *diagnostic method*: a one-line "Saving… stuck" symptom cost most of a session because the evidence that instantly localizes this class of bug (the browser **Network tab**) was gathered late. Good cautionary tale about leading with the cheapest highest-signal check instead of theorizing up the stack.

**Date:** 2026-06-15 (Session 173). **Files:** `src/server/actions/performance.ts`, `src/components/performance/performance-forms.tsx`.

**Symptom:** an employee saved a self-review on `/performance`; the submit button stuck on **"Saving…" forever**. Refresh recovered; data persisted correctly (row + audit written).

### Root cause
The Server Action (`submitSelfReview`) called `revalidatePath("/performance")` — **the route the form is on**. In the App Router, revalidating the current route inside a Server Action makes the action's **response carry a full re-render of that page's RSC tree**, and React commits that tree **in the same update as the `useActionState` result**. On a *large* page packed with many `useActionState` client forms (here: a `SelfReviewForm` per review + an `EmployeeGoalProgressForm` per goal), that combined commit **wedges the dispatching form's `pending` transition** — it never flips to `false`. The HTTP POST itself returns **200 with `{"success":true}` in the body**; the hang is purely the client-side commit. A plain GET of the same page renders fine, and lighter pages (leave, a single-form page) don't wedge — which is why it looked action-specific.

### Fix
Don't revalidate the current route from inside these employee actions. Remove `revalidatePath` from the action and have the form call **`router.refresh()` on success** (client) — a *separate* navigation that runs after `pending` has already cleared, so it brings fresh server props without folding the re-render into the action commit. This is the established repo pattern (`compensation-form.tsx`). Key the success effect off the **`useActionState` state object** (`[state]`), not `state.success` — the boolean stays `true` across consecutive resubmits and the effect wouldn't re-fire (same trap as the render-time collapse guard). Pages here are dynamic (cookie-based Supabase client) so dropping server revalidation costs no cross-user freshness — a later navigation re-fetches anyway.

`after(revalidatePath)` was tried first and **rejected**: it cleared the hang but broke every post-submit UI that depended on the in-response prop refresh (the collapse lost its Edit button; acknowledge stopped swapping to its summary). Deferring revalidation leaves stale props everywhere; `router.refresh()` keeps props fresh.

### Diagnostic method — what would have found this in minutes
- **"Action succeeds server-side but the button never leaves its pending label" is a CLIENT-COMMIT problem. Open the browser Network tab FIRST.** The single capture that cracked this — POST = **200**, response body contains the success payload, request fully downloaded — instantly rules out transport/proxy/server/streaming and points at React not committing. We instead theorized server-side (Caddy headers, Supabase, Next-version bisect, RSC-stream hang) for most of a session before getting that capture. The symptom *was* the signpost: the pending **label** is client state.
- **`docker stats` during the hang: CPU ~0% = awaiting/commit-wedge, CPU pegged = infinite loop.** Cheap, decisive split.
- **Bisect with one server marker + one toggle:** `console.error` markers proved the action reached `return` and the page re-render completed; then *removing* `revalidatePath` and re-testing isolated the wedge to the in-response re-render in one rebuild.
- **A red-herring graveyard worth remembering so you don't re-walk it:** not Caddy (reproduced on `:3100` direct), not the Caddy security-header block (predated it), not the Next 16.2.9 bump (reproduced identically on 16.2.4), not the Radix tab `key`/identity (reproduced with `?view=reviews` so the key was stable). Each was ruled out with evidence, but cheaply — with the Network capture they'd never have been entered.
- **Codex (a second AI) was the turning point — credit where due.** After a session of server-side theories, the Codex rescue independently ran the flow, captured **`POST … 200` with `{success:true}` in the body**, and said plainly: *stop investigating Caddy/Supabase/Next/`revalidatePath` as the primary cause — the confirmed problem is client-side.* That direction-correction is what got us to pull the browser **Network capture**, which localized the wedge within minutes. Codex also independently re-derived the separate latent boolean-edge collapse bug. **How to use a second model well, from this:** escalate it for a **fresh, unanchored read / direction check** when you've been down one path too long — it has no sunk cost in your wrong theory. Then **verify its claims against your own evidence rather than adopting them whole**: Codex's *specific* mechanism (tab remount) was wrong (disproved — `?view=reviews` still hung), and its "I couldn't reproduce the hang" was because its clean headless client completed the POST and never saw the real-browser wedge. Operationally: a forked/write-enabled rescue job can **stall silently** (ours looked "running" for ~45 min while its log mtime was frozen) — **poll the job's log mtime, not just its status**, and cancel + re-prompt if frozen.
- **Playwright can't see this bug.** In a clean headless browser the Server Action POST completes and `pending` clears — the wedge only manifested in the user's real browser. So the hang fix is verified by **manual smoke**, and Playwright only guards the surrounding flow.

## CI's `eslint .` lints the whole tree — the local pre-smoke gate (changed files only) won't catch pre-existing violations

**Date:** 2026-06-17 (Session 175). **Files:** `.github/workflows/ci.yml`, three pre-existing components.

The CI gate added in Session 174 runs `npx eslint .` (whole tree) on every push to `main`; the local pre-smoke gate runs `eslint <changed files>` only. Consequence: the **first** CI run after the workflow landed (commit `2f9ff98`) failed on **pre-existing** `react-hooks/set-state-in-effect` errors in files nobody had touched recently — invisible locally because those files were never re-linted under the current `eslint-plugin-react-hooks` version. **Guardrail:** when a push fails CI but local was green — or after changing CI lint scope — run `npx eslint .` (not just changed files) to see what CI sees. `tsc --noEmit` is already whole-program, so it has no such gap; eslint does.

Two mechanical gotchas from the fix:
- `react-hooks/set-state-in-effect` reports **once per effect** (the first synchronous setState). A per-line `eslint-disable-next-line` just moves the report to the *next* setState in the same effect → use a block `/* eslint-disable react-hooks/set-state-in-effect */ … /* eslint-enable … */` around the whole effect.
- `reportUnusedDisableDirectives` is **on** (Next flat config), and a `// eslint-disable-next-line` applies only to the *immediately* following line — a two-line justification comment breaks it (the directive lands on the comment continuation → "unused directive" warning, and the real line still errors). Keep the directive single-line, or use the block form with the reason in a plain comment above.

## `to_regclass('public.x')` renders as the minimal name, not the schema-qualified string

**Date:** 2026-06-17 (Session 175). **File:** `scripts/db-bootstrap.mjs`.

A "is the schema applied?" probe compared `select to_regclass('public.profiles')` output to the literal `"public.profiles"` — **always false**, because a `regclass` renders as the *minimal unambiguous* name (just `profiles` when `public` is on the search_path). The guard therefore read a populated DB as fresh and tried to re-apply (halted harmlessly on `ON_ERROR_STOP=1` at the first existing object — no data mutation, exactly the fail-safe the design predicted). **Fix:** probe a search-path-independent boolean — `select to_regclass('public.profiles') is not null` → `t`/`f` — not the qualified-name string. Caught by manual smoke (MS2) against a real populated DB; would not have surfaced without running the no-op path against an initialized database.

## An optional env var in a docker-compose `environment:` block is never `undefined` — it arrives as `""`

**Date:** 2026-06-17 (Session 176). **Files:** `src/lib/env.ts`, `infra/supabase/docker-compose.app.yml`.

Added an optional `APP_URL` (`z.string().url().optional()`) to the server env schema and wired `APP_URL: ${APP_URL}` into the compose `environment:` block. On the next `up`, **every** service-role operation crashed (`/dashboard` → "Something went wrong"): Zod `ZodError: Invalid URL` on `APP_URL`. Root cause: Docker Compose interpolates an **unset** `${APP_URL}` to an **empty string**, not absent — so the var is *present* in the container env as `""`. `.url().optional()` only skips `undefined`; `""` reaches `.url()` and is rejected. Because `getServerEnv()` is shared with `createAdminClient()`, the throw took down all service-role paths, not just the reset-link one. **Guardrails:**
- Coerce blank → unset at the parse boundary: `process.env.APP_URL?.trim() || undefined` (the `.trim()` also catches whitespace-only values, which are truthy and would otherwise hit `.url()`).
- Use `${VAR:-}` (not `${VAR}`) in compose `environment:` so the "not set" WARN is silenced and the empty-default is explicit.
- A failure digest shown in the UI ("ref: 1485917452") matches the server-log error `digest` — `docker logs <web> | grep <digest>` (or grep the exception) jumps straight to the throwing line. The error boundary survived on `/login` because that route uses `getPublicEnv` (no secret), only `getServerEnv` callers threw — a useful signal that the fault is in the server-env parse, not the public one.

## The `server-only` sentinel belongs on the module that OWNS a secret, not only on its current consumer

**Date:** 2026-06-17 (Session 176). **Files:** `src/lib/env.ts`, `src/lib/env.public.ts` (new), `src/lib/email-env.ts`.

`env.ts` exported `getServerEnv()` (reads `SUPABASE_SERVICE_ROLE_KEY`) with **no** `import "server-only"`, so a future `"use client"` import would bundle the key into the browser with no build error — the only guard was convention. Fix = split the module along the existing public/server schema seam: public getters (`NEXT_PUBLIC_*` only) → new `env.public.ts` (no fence), secret-bearing getter stays in `env.ts` **with** `import "server-only"`; repoint the public importers. **Lessons:**
- `import "server-only"` only throws when *that* module is pulled into a client graph. Putting it on a consumer (`src/server/email.ts`) does **not** protect the secret-owning module (`email-env.ts`) from a *different* future client importer. Fence the owner. A security sweep found exactly this second instance (`email-env.ts` reads `RESEND_API_KEY`, no sentinel) — fixed the same way.
- The fence is **bundle-time, not type-time**: `tsc --noEmit` passes a violation; only `next build` fails it. So the real verification for a `server-only` change is a production build, not the pre-smoke type/lint gate.
- Import direction is one-way safe: a fenced module (`env.ts`) importing a public one (`env.public.ts`) does **not** drag the fence into the public module's client consumers — graphs are directed, no back-edge.
