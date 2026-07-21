# Systems Thinking — KushHR

Three questions that must be answered before touching any part of this system:

1. **Where does state live?** Who owns the truth? If two components both believe they own the same piece of state, there is a latent bug.
2. **Where does feedback live?** How do you know the system is working right now? Logs, metrics, and errors must surface somewhere visible.
3. **What breaks if I delete this?** Trace the blast radius in your head before touching any shared component.

These are not review checkboxes. They are design constraints that must shape decisions during implementation, not after.

---

## 1. Where Does State Live?

### State ownership map

| Truth | Owner | Derived copies | Risk if out of sync |
|-------|-------|---------------|---------------------|
| User identity | `auth.users` (Supabase Auth) | `profiles` row | Profile missing → user authenticated but invisible to app |
| User role | `profiles.role` | JWT `app_metadata.role` (via `sync_role_to_jwt` trigger) | JWT stale → wrong permissions until token refresh |
| Employment status | `employee_records.employment_status` | None — do not duplicate in `profiles` | — |
| Leave balance | `leave_balances` | Displayed in UI | Approved request + no balance update → balance and history disagree |
| Document existence | `documents` (metadata row) | `storage.objects` (file binary) | Metadata deleted, file remains → orphaned unreachable file. File deleted, metadata remains → broken download |
| Compensation | `employee_compensation` | Employee payroll summary view | No duplication allowed — `profiles` and `employee_records` must not carry compensation fields |
| Performance goals | `performance_goals` | Dashboard goal summaries | Goal progress/status lives in the goal row, not in reviews or dashboard cards |
| Performance review score | `performance_reviews.score` | Dashboard/reports | Score must not be duplicated into compensation or employee records |
| Performance cycle submission window | `performance_review_cycles.submission_deadline` + `submission_lock_enabled`, evaluated in `app_settings.timezone` | Validated timezone value passed to client render paths | **Codex update (2026-05-26):** Server Actions read the owning cycle and configured timezone at write time; cached lock state would lag an admin change. Hard-lock protects authored changes and reopens, while acknowledgment remains an audited receipt action after the deadline. |
| App role in session | Server-side `profiles` read | Client receives minimal DTO | Do not pass raw DB rows to Client Components |

### Rules

- **One owner, no exceptions.** If you find yourself writing to the same logical field from two places, stop and consolidate.
- **Derived copies are read caches, not co-owners.** The JWT role claim is a performance optimisation. The DB `profiles.role` is always right. If they conflict, the DB wins.
- **Deletions must be coordinated.** Deleting a `documents` row must also delete the `storage.objects` file in the same Server Action. Wrap both in a try/catch that rolls back or queues a cleanup if either fails. Never delete one without the other.
- **Leave approvals must update balances atomically.** The approval Server Action must decrement `leave_balances` in the same operation as setting `leave_requests.status = 'approved'`. If they are separate round-trips, the system can land in a state where a request is approved but the balance is unchanged.
- **Performance scores are review data, not compensation data.** Appraisal scores may inform a human compensation decision later, but the score is owned by `performance_reviews` and must not update `employee_compensation` automatically.
- **Goal state is not review state.** A goal can be completed without a review being submitted, and a review can be submitted while some goals remain in progress. Keep those statuses separate.
- **`profiles` is the root node.** Everything in the app hangs off a `profiles` row. If a profile is deleted, `employee_records`, `employee_compensation`, `leave_requests`, `documents`, `onboarding_tasks`, `performance_goals`, `performance_reviews`, and `leave_balances` for that user all become orphaned or broken. Decide before Phase 3: does deleting a profile cascade-delete all records, or is it soft-deleted? Document the decision and enforce it via FK constraint behavior (`on delete cascade` vs `on delete restrict`).

---

## 2. Where Does Feedback Live?

### Feedback types in KushHR

| Signal type | What it tells you | Where it should surface |
|-------------|------------------|------------------------|
| Business event | A user did something (approved leave, uploaded doc) | `audit_logs` table — admin-visible |
| Application error | A Server Action or Route Handler threw | Server console (dev) / logging service (prod) |
| Authorization failure | A user reached something they shouldn't | `audit_logs` with action `auth.access_denied` + server log |
| Trigger failure | `handle_new_user` or `sync_role_to_jwt` threw an exception | Supabase dashboard → Database → Logs |
| Storage error | Upload failed, signed URL generation failed | Server Action error response + server log |
| Performance event | Goal or review changed | `audit_logs` with `performance.*` action |
| Migration failure | A migration did not apply | `supabase db reset` output — must be treated as a blocking error |
| RLS policy gap | A query returns zero rows when it should return data (policy too strict) or returns data it shouldn't (policy too permissive) | Only caught by tests — invisible at runtime unless you're looking |

### Mandatory feedback rules

**Audit log for authorization failures.** Every time a Server Action or Route Handler returns early because the user lacks permission, write an audit log entry:

```
actor: current user id
action: 'auth.access_denied'
entity: route or action name
metadata: { attempted_resource, role }
```

This makes the `audit_logs` table useful for both compliance and anomaly detection.

**Server Actions must not fail silently.** Every Server Action that mutates data must:
- Return a typed result object (`{ success: true, data }` or `{ success: false, error: string }`).
- Log the error server-side before returning the safe error message to the client.
- Never expose stack traces, query text, or row data in the error message returned to the client.

**Trigger health is invisible by default.** The `handle_new_user` and `sync_role_to_jwt` triggers can fail silently in production if their security-definer functions encounter a permission error or schema mismatch. Add a Phase 11 check: after each trigger-dependent operation in tests, assert the derived state was actually updated (e.g., after sign-up, assert `profiles` row exists; after role change, assert JWT `app_metadata.role` matches).

**Supabase dashboard is your operational console.** In development and staging, check these regularly:
- Database → Logs: trigger errors, constraint violations, policy errors.
- Auth → Logs: sign-up failures, token refresh failures.
- Storage → Logs: upload/download errors.
- API → Logs: slow queries, RLS-blocked queries (shown as empty result sets, not errors).

**Each phase must ship with its feedback loop.** Before closing a phase, the team must be able to answer: "If something broke in production right now, how would we know?" If the answer is "we'd wait for a user to complain," the phase is not done.

---

## 3. What Breaks If I Delete This?

### High blast-radius components

These are components whose removal or corruption breaks a wide surface area. Handle with extra care and test before and after any change.

#### `handle_new_user` trigger (on `auth.users`)

- **Blast radius:** Every new sign-up. User authenticates successfully but has no `profiles` row. RLS policies that join to `profiles` return empty. The user can log in but the app shows nothing and all mutations fail silently.
- **Detection:** Only caught if you test sign-up after any schema change to `profiles` or `auth` hooks.
- **Rule:** Never drop or replace this trigger without immediately re-creating it. Test sign-up smoke test after every Phase 3+ migration.

#### `sync_role_to_jwt` trigger (on `profiles`)

- **Blast radius:** Role changes. If an admin changes a user's role, the old role persists in their JWT until it expires (default 1 hour). During that window, the user has the wrong permissions in every RLS-protected query.
- **Detection:** Only caught if you test role change + immediate action in the same session.
- **Rule:** If this trigger must be replaced, force-expire existing sessions for the affected user via Supabase Admin API.

#### `insert_audit_log()` function

- **Blast radius:** Every Server Action that calls this function. If the function is dropped or its signature changes, every write path in the app throws a Postgres error. This includes leave approvals, compensation updates, document uploads, and role changes — effectively the entire mutation surface.
- **Detection:** Integration tests on any one write path will catch it, but only if they call the real DB.
- **Rule:** Never rename or change the signature of this function without updating every call site. Treat it as a stable internal API.

#### `storage.objects` RLS policies

- **Blast radius:** Document security. If the RLS policies on `storage.objects` are dropped or misconfigured, all files in the private bucket become accessible to any authenticated user — including payslips, contracts, and ID documents.
- **Detection:** Only caught by Storage access tests. No UI feedback; the file simply downloads when it shouldn't.
- **Rule:** Any Storage migration must be followed immediately by a cross-employee access test.

#### `rls_auto_enable()` + `ensure_rls` event trigger (migration 0052)

- **Blast radius:** Fires on every future `CREATE TABLE` / `CREATE TABLE AS` / `SELECT INTO` and auto-enables RLS on new `public` tables (fail-closed default-deny). The function (`public.rls_auto_enable`, SECURITY DEFINER, runs as the `supabase_admin` superuser) and the event trigger (`ensure_rls`) are a **pair** — the function does nothing without the trigger, and the trigger references the function. If a future migration drops/replaces one without the other, new tables silently lose the auto-RLS safety net. The body is byte-exact from cloud; editing it changes the stored `prosrc` and reintroduces schema-parity drift (see the migration header).
- **Detection:** Invisible at runtime (never fires on DML — only DDL). Caught only by the schema-parity diff (`infra/supabase/checks/schema-parity.sh`) and by RLS cross-access tests on any newly-added public table.
- **Rule:** Never replace the function without verifying `ensure_rls` still references it; never drop the trigger without checking whether any post-`0052` table relies on the auto-enable path. Migrations creating this (or any event trigger) must be applied as `supabase_admin` (superuser). Auto-RLS-on with no policy = deny-all — it is a safety net, NOT a substitute for writing the table's explicit policies.

#### `set_updated_at()` trigger (on any table)

- **Blast radius:** Limited to that table. `updated_at` stops updating on mutations, which breaks any logic that uses `updated_at` for ordering, cache invalidation, or "recently changed" queries.
- **Detection:** Subtle — queries still work, data is still returned, but recency ordering is wrong.
- **Rule:** After adding the trigger to a new table, write one mutation and assert `updated_at` changed.

#### `handle_leave_approval()` + `handle_leave_refund()` triggers (on `leave_requests`, migration 0042)

- **Blast radius:** Every leave approval and every cancel-of-approved flows through these BEFORE UPDATE triggers. They write `leave_requests.deducted_days` (frozen total) and mutate `leave_balances.balance` per-year segment. A drop or signature change silently breaks balance accounting — approval succeeds but the balance doesn't decrement, or cancel succeeds but the refund doesn't fire. Multi-year leaves split per-year working-days; half-day is enforced 0.5.
- **Detection:** Insufficient/missing balance raises `P0001` / `P0002` SQLSTATEs surfaced by the action layer. **Silent drift** (e.g. wrong day count, no refund) is only caught by Playwright leave specs that assert pre/post balance values, plus the UAT scenarios R1–R3 / F1 in `docs/uat-flows/leave-request-lifecycle.md`.
- **Rule:** Trigger is BEFORE UPDATE (not AFTER) so it can write `new.deducted_days`. Any replacement migration MUST preserve both the working-days math (via `working_days(date, date, text)`) AND the legacy calendar-days fallback in the refund path for rows where `deducted_days IS NULL`. Treat as a high-risk component for Systems Thinking gates.

#### `performance_reviews.score`

- **Blast radius:** Appraisal history, manager decisions, and employee trust. If scores are editable without audit logs or role checks, historical reviews become unreliable.
- **Detection:** Only caught by permission-boundary tests that try employee score edits and manager outside-scope edits.
- **Rule:** Score changes require manager/admin authorization and an audit log. Employees may acknowledge or self-comment, but never update manager score or manager feedback.

#### A `profiles` row (deletion)

- **Blast radius:** All data for that user. FK constraints determine whether child rows cascade-delete or become orphaned. This decision must be made in Phase 3 and enforced by the DB constraint, not by application code.
- **Rule:** Use `on delete restrict` on `profiles` FK in employee-data tables by default (prevent deletion if records exist), or `on delete cascade` with explicit acknowledgment that all HR history is destroyed. Document the chosen behavior in `docs/database-design.md`.

#### A `departments` row (deletion)

- **Blast radius:** All `employee_records` rows with that `department_id`. If FK is `on delete set null`, employees lose their department silently. If `on delete restrict`, deletion is blocked when employees exist — safer.
- **Rule:** Use `on delete restrict` and require admin to reassign employees before a department can be deleted.

### Blast-radius checklist — use before any schema change

Before dropping a column, table, trigger, function, or constraint, answer:

- [ ] Which RLS policies reference this?
- [ ] Which Server Actions or Route Handlers query or mutate this?
- [ ] Which UI components depend on data from this?
- [ ] Which other triggers or DB functions call this?
- [ ] What happens to existing rows if this is removed?
- [ ] Is there a test that will catch this breakage?

If any answer is "I don't know," do not proceed until you know.

---

## Applying These Principles Per Phase

| Phase | Primary state risk | Primary feedback gap | Primary blast-radius risk |
|-------|--------------------|---------------------|--------------------------|
| 3 — Schema | Role dual-ownership (profiles vs JWT) | Trigger failures invisible | `handle_new_user` drop breaks all sign-ups |
| 4 — Auth | Session vs DB role drift | Auth failure not in audit log | `sync_role_to_jwt` drop silently stales permissions |
| 5 — Employees | Employment status in two tables | Profile edit error silent | Profile delete cascades unclear |
| 6 — Leave | Balance vs approved request disagreement | Approval error not surfaced | Department delete orphans employee records |
| 7 — Documents | Storage object vs metadata row orphan | Upload/download error silent | Storage RLS drop exposes all files |
| 8 — Payroll | Compensation in wrong table (profiles) | Payroll change audit missing | `insert_audit_log` drop breaks all write paths |
| 9 — Onboarding | Task assigned to terminated employee | Task completion error silent | Direct-report scope not scoped to active employees |
| 10 — Dashboards | Metric query reading stale/wrong source | Dashboard shows zero when it shouldn't | N+1 query per dashboard card |
| 11 — Performance | Goal state vs review state confusion | Appraisal submitted without audit trail | Employee/manager editing score outside scope |
| 12 — Hardening | Final audit of all ownership rules | All feedback loops verified | Full blast-radius map reviewed |
