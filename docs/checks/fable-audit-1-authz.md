# Fable Audit — Run 1 of 5: Authorization, RLS↔App Agreement, Data Exposure

> **Authorship (verified from session transcripts):** all findings below authored by **Opus 4.8** on 2026-07-08 — spawned as a Fable 5 `general-purpose` agent but ran majority-Opus (26 Fable / 66 Opus turns), and the report file was written by an Opus turn. Despite the "Fable Audit" title, this is an Opus-authored pass. Later passes append findings tagged `[Model · date]`.
> **Pass 2 (2026-07-10):** independent authz re-audit authored **entirely by Fable 5** (single-agent `general-purpose` run, no Opus turns). Source-only Phase-1 findings formed before this file was opened. Outcome: F1 independently corroborated against migration text; one net-new NIT added (**F6**, rls-policy-map shorthand doc drift); all other Fable-5 candidates deduped into Opus's F2–F5. Fable-5 additions tagged `[Fable5 · 2026-07-10]`.
> Provenance: `[Fable5 · date]` = Fable 5 · `[Opus · date]` = Opus · untagged = original pass above.

**Scope:** Every Server Action (`src/server/actions/`), both Route Handlers (`src/app/**/route.ts`), the DAL layer (`src/server/dal/`), and the RLS migrations they depend on. Traced end-to-end for authentication, role authorization, object-level scope (IDOR), service-role reachability, and RLS-vs-app agreement.

**Method:** Source-only. Findings cite `file:line` with a concrete state→exposure path. Items I could not confirm without a running DB are marked UNVERIFIED.

---

## 1. Executive Summary

**Is the authz model sound for real HR/payroll data? — Broadly yes.** This is an unusually disciplined codebase for AI-authored work. The core boundaries hold:

- `get_user_role()` and `is_direct_report()` (migrations 0002/0003) read from the **`profiles`/`employee_records` tables, not the JWT** — so RLS role decisions are always current and a stale/forged `app_metadata.role` claim cannot mis-scope RLS. This closes the single most common Supabase authz mistake.
- Compensation is well-locked: manager base-table SELECT was removed (0050) and replaced by a hard-projected SECURITY DEFINER RPC that cannot return bank/tax/national-id/passport. Employee self-edit is column-grant + action-guard defended (0049 + `ADMIN_ONLY_FIELDS`).
- Every Server Action calls `requireRole(...)` first, writes an `auth.access_denied` audit row on early exit, and validates input with Zod. Sensitive downloads go through an RLS-scoped session-client fetch *before* the service-role signing step (`getSignedDownloadUrl`), which is the correct order.
- Object-scope on service-role mutation paths is generally re-checked in the app layer (`canManageEmployee`, `getDirectReportIds`, hard-coded `eq("employee_id", user.id)`).

**Top 5 risks (ranked):**

1. **NEEDS-FIX — Draft manager appraisals are readable by the subject employee at the RLS layer** before the manager submits. `employee_select_own_performance_reviews` has no status gate; the UI hides pre-submission feedback but RLS (the "final authorization layer") does not. Score + written feedback leak via a direct PostgREST call with the employee's own token. (Finding F1)
2. **NIT (systemic) — Service-role DAL helpers enforce scope in the *caller*, not the DAL.** `getAllTasks()`/`getOnboardingProgress()` bypass RLS entirely and return company-wide data unless the page remembers to pass a direct-report filter. Correct today, but one forgetful future caller = full leak. (Finding F2)
3. **NIT — PostgREST `.or()`/`.ilike()` filter-string injection** from user-supplied search text in the admin resolver helpers. Admin-gated, so no privilege escalation, but the pattern is fragile and unnecessary. (Finding F3)
4. **NIT — `approveLeaveRequest`/`rejectLeaveRequest` delegate direct-report scope entirely to RLS** with no app-layer scope check, contrary to the security model's "check record scope before mutation." Not a hole (RLS holds) but a defense-in-depth deviation from the stated design. (Finding F4)
5. **NIT — Peer/name RPCs disclose slightly more than the "active directory" baseline** (`get_profile_display_names` returns names/emails for terminated & admin profiles to any authenticated caller; `get_peer_employee_profile` exposes phone). Documented as intended, but worth confirming against the privacy intent. (Finding F5)

No BLOCKER-class holes were found: no unauthenticated data mutation, no cross-employee IDOR, no service-role path driven by unsanitized user-controlled row selectors that bypasses RLS.

> `[Fable5 · 2026-07-10]` **Independent second-pass concurrence.** A full source-only re-trace (every Server Action `requireRole` gate, all 22 `createAdminClient()` sites, all RPCs, and the leave/documents/onboarding/performance/compensation RLS migrations) reached the same top-of-house conclusion: the model is sound and F1 is the only non-NIT. **F1 is corroborated** — I read `0018_performance_appraisals.sql:147-149` directly: `employee_select_own_performance_reviews` = `using (employee_id = auth.uid())` with no status predicate, and `submitManagerReview(intent="draft")` (performance.ts:974-983) populates `score`/`manager_*` while `status` stays `draft`/`self_reviewed` — so the draft-score leak is real at the DB layer, UI gating notwithstanding. One net-new NIT this pass: **F6** — `rls-policy-map.md`'s shorthand legend claims RLS role checks read the JWT (`jwt_role = auth.jwt() ->> 'role'`), but **zero** policies do; every one calls `get_user_role()` (reads `profiles`). Safe direction, but it misrepresents the enforcement mechanism in the very doc this run must cross-check.

---

## 2. Findings

### F1 — NEEDS-FIX · Draft manager appraisal (score + feedback) exposed to employee via RLS

- **Where:** `supabase/migrations/0018_performance_appraisals.sql:147` (`employee_select_own_performance_reviews` = `employee_id = auth.uid()`, no status predicate). Draft manager fields are written by `src/server/actions/performance.ts:974-983` (`submitManagerReview`, `intent==="draft"` writes `score`, `manager_strengths`, `manager_improvements`, `manager_next_steps` while `status` stays `draft`/`self_reviewed`). UI gate that *does* respect status: `src/components/performance/performance-lists.tsx:292-296` (`managerFeedbackVisible = !canSelfReview || status === "manager_submitted" || status === "acknowledged"`).
- **Defect:** The application's intended workflow reveals manager score/feedback to the employee only at `manager_submitted`. That gate exists **only in the UI**. RLS lets the employee SELECT their own review row in any status, including `draft`/`self_reviewed`, which already carries the populated `score` and `manager_*` columns.
- **Exploit scenario:** Manager saves a draft appraisal for employee E (score 2/5, critical written feedback). Status is `draft`. E — who has a valid session — copies their Supabase access token from the cookie and issues `GET /rest/v1/performance_reviews?select=score,manager_strengths,manager_improvements,manager_next_steps&employee_id=eq.<self>`. RLS authorizes it; E reads the not-yet-delivered score and feedback before the manager submits. In an HR/appraisal context this is a real premature-disclosure and dispute risk.
- **Fix:** Add a status predicate to the employee SELECT policy so manager-authored columns are only visible post-submission, e.g. split into (a) a policy exposing employee-owned columns (`self_review`, acknowledgement, status) always, and (b) manager columns gated on `status in ('manager_submitted','acknowledged')`. Column-level RLS in Postgres requires either a view/RPC projection (mirror the compensation 0050 pattern) or splitting reads through a SECURITY DEFINER function that nulls manager fields pre-submission. Simplest: route employee review reads through a projection RPC that omits `score`/`manager_*` unless `status in ('manager_submitted','acknowledged')`.
- **Confidence:** High that RLS permits the read (policy text is unambiguous). Medium on real-world exploitability — requires the employee to make a direct API call rather than use the UI, but RLS is explicitly designated the final authorization boundary in `docs/security-model.md:26`, so "the UI hides it" is not an acceptable mitigation by the project's own standard.
- `[Fable5 · 2026-07-10]` **Corroborated + sibling location.** Confirmed the exact policy text (`0018:147-149`, no status predicate) and the draft-write path independently. **Adjacent instance of the same root defect:** `employee_select_own_performance_goals` (`0018:98-100`) is likewise `using (employee_id = auth.uid())` with no `goal_definition_submitted_at` predicate, so an employee can also SELECT a manager's **unsubmitted (draft) goal definition** — title / description / due date the manager is still drafting — via a direct PostgREST call before it is locked/submitted. Lower severity than F1 (goals are collaborative objectives, not confidential scores), but it is the same "UI-only draft gate, RLS exposes all statuses" pattern and should be fixed in the same projection-RPC pass. Whatever fix lands for F1 (SECURITY-DEFINER projection that nulls manager-authored columns pre-submission) should cover both tables.

### F2 — NIT (systemic) · Service-role DAL functions rely on caller-supplied scope

- **Where:** `src/server/dal/onboarding.ts:124` (`getAllTasks(filterEmployeeIds?)`), `:190` (`getOnboardingProgress(filterEmployeeIds?)`), `:55` (`getTemplates`) — all use `createAdminClient()` (RLS-bypassing). Scope is applied by the page: `src/app/(app)/onboarding/page.tsx:24-41` passes `getDirectReportIds(user.id)` for managers and calls the unfiltered form only in the admin branch.
- **Defect:** The scoping decision lives in the page, not the DAL. The DAL functions default to **company-wide** when `filterEmployeeIds` is omitted. There is no in-DAL role assertion. A future page/action that calls `getAllTasks()` from a manager or employee context would silently return every employee's onboarding tasks + completion notes, bypassing RLS.
- **Exploit scenario:** Latent — not reachable today. Becomes a full onboarding-data leak the moment a second caller forgets the filter argument (a classic multi-session-AI regression pattern).
- **Fix:** Make scope non-optional and derived inside the DAL from the authenticated role, or add an explicit `assertScope(role, filterEmployeeIds)` guard that throws when a non-admin calls without a filter. At minimum, add a loud comment + a lint/test that fails on unfiltered calls.
- **Confidence:** High (structural observation). No live exploit.

### F3 — NIT · PostgREST filter-string injection via user-supplied search text

- **Where:** `src/server/actions/employees.ts:639` (`resolveManagerId`: `.or(\`display_name.ilike.%${search}%,work_email.ilike.%${search}%\`)`), `:607` (`resolveDepartmentId` `.ilike`), `src/server/actions/leave.ts:1332` (`resolveBalanceEmployeeId` `.or(...)`), `src/server/actions/documents.ts:333` (`resolveUploadEmployeeId` `.or(...)`, admin branch only).
- **Defect:** The raw `search` string is interpolated directly into a PostgREST filter expression. PostgREST parses `.or()` operands as a mini-DSL; commas/parentheses/operator tokens in `search` can alter the filter (add clauses, change matched columns).
- **Exploit scenario:** All four call sites are reachable only after `requireRole(["admin"])` (or, for `resolveUploadEmployeeId`, the `role === "admin"` search branch — non-admins short-circuit to `return userId` at `documents.ts:323`). An admin already has full read access, so injecting extra filter clauses grants no new data and the resolved id is re-validated downstream (`validateManager`, RLS on the mutation). Impact is therefore limited to query malfunction / mis-resolution, not privilege escalation.
- **Fix:** Use structured builders instead of interpolated filter strings (`.ilike("display_name", \`%${search}%\`)` chained, or `.textSearch`), or escape/strip PostgREST metacharacters from `search`. This also hardens against the pattern being copy-pasted into a non-admin path later.
- **Confidence:** High on the injection surface; low on severity (admin-gated).

### F4 — NIT · Leave approve/reject scope is RLS-only, no app-layer direct-report check

- **Where:** `src/server/actions/leave.ts:529-625` (`approveLeaveRequest`), `:688-756` (`rejectLeaveRequest`). Both load the request with the **session client** (RLS-scoped) and update with the session client. The only explicit app check is self-approval (`req.employee_id === user.id`). Direct-report scope is enforced solely by `manager_update_direct_report_leave` (`0006_leave.sql:152`).
- **Defect:** `docs/security-model.md:17-24` requires the server layer to "Check role and record scope before mutation." Here a manager's direct-report scope is not verified in application code; it is delegated to RLS. This works because `manager_select_leave_requests` and `manager_update_direct_report_leave` both require `is_direct_report(employee_id)`, so a non-report request loads as `null` ("not found") and the update matches zero rows. But it is a single-layer guard where the design calls for defense-in-depth.
- **Exploit scenario:** None with current RLS intact. The risk is regression: if the `manager_update_direct_report_leave` policy is ever weakened, there is no second gate.
- **Fix:** Add a `canApprove` app-layer check (mirror `canManageEmployee` in performance.ts) that verifies `is_direct_report`/admin before the update, matching the pattern already used for onboarding and performance.
- **Confidence:** High (design-consistency observation, not a live hole).

### F5 — NIT · Name/peer RPCs disclose beyond the active-directory baseline

- **Where:** `supabase/migrations/0046_profile_display_names_rpc.sql` (`get_profile_display_names` returns `display_name`/`work_email` for **any** profile id — including terminated, inactive, and admin — to any authenticated caller). `0037_peer_employee_profile.sql` (`get_peer_employee_profile` returns `work_email` **and `phone`** for any active employee to any peer).
- **Defect:** `get_people_directory` (the stated baseline) exposes only **active** employees. `get_profile_display_names` widens that to all-status profiles, and `get_peer_employee_profile` adds phone number. Both are documented as intentional, but the disclosure surface is broader than "active colleague directory."
- **Exploit scenario:** A plain employee enumerates arbitrary UUIDs against `get_profile_display_names` to harvest names/emails of terminated staff and admins; or reads any active colleague's phone via the peer RPC. Low impact (no salary/bank/tax), but it is PII beyond the directory.
- **Fix:** If terminated/admin name resolution is only needed for admin-facing joins (uploader column), scope those callers to admin; drop `phone` from the peer projection unless product explicitly wants colleague phone numbers company-wide.
- **Confidence:** High on the disclosure; the "is this intended" question is a product decision (hence NIT).

### F6 — NIT · `[Fable5 · 2026-07-10]` · rls-policy-map shorthand claims JWT-based role checks; no policy uses the JWT

- **Where:** `docs/rls-policy-map.md:12-16` — Policy shorthand legend defines `jwt_role = (auth.jwt() ->> 'role')::user_role`, `admin = jwt_role = 'admin'`, `manager = jwt_role = 'manager'`, `employee_role = jwt_role = 'employee'`, and every table grid below is written in those terms. Also reinforced by `docs/security-model.md:133` ("JWT `app_metadata.role` is a derived cache … DB always wins on conflict"). The actual policies: `supabase/migrations/0002_profiles_departments.sql:26-32` defines `get_user_role()` as `select role from public.profiles where id = auth.uid()`, and a grep of all 55 migrations shows **every** role check is `public.get_user_role() = '…'` — **zero** occurrences of `auth.jwt()` / `app_metadata` / `->> 'role'` in any RLS `using`/`with check`.
- **Defect:** The database-layer authorization doc misdescribes its own enforcement mechanism. RLS never reads the JWT role claim; it reads `profiles.role` through a SECURITY DEFINER function. This is a **code-vs-doc disagreement in the exact cross-check doc this audit run is required to reconcile.**
- **Why it matters (and why only NIT):** The real mechanism is *stricter/safer* than the documented one — reading the DB directly means there is no JWT-staleness window to reason about, so the role-sync trigger (0013) is not actually load-bearing for RLS and the whole "DB wins on conflict" narrative describes a conflict that RLS can never see. Not exploitable. But a future reviewer (human or AI) trusting the shorthand would (a) mis-model a non-existent stale-JWT attack surface, and (b) potentially "fix" a phantom by wiring a policy to `auth.jwt()`, which *would* introduce the staleness hole the current code avoids. Precisely the kind of drift this audit exists to catch.
- **Fix:** Rewrite the `rls-policy-map.md` shorthand so `admin`/`manager`/`employee_role` are defined as `get_user_role() = '…'` (DB read), and correct the `security-model.md:133` assumption to state RLS reads `profiles.role` directly (JWT role is not consulted by any policy). No code change.
- **Confidence:** High — grep-verified across every migration; the function body is unambiguous.

### Non-findings verified (documented so the next run can skip them)

- **Compensation manager leak (prior F4, Session 154):** Confirmed closed. `manager_select_direct_report_compensation` dropped in 0050; manager scope is RPC-only with a hard-coded summary projection. Base-table SELECT for a manager returns only their own row (`employee_select_own_compensation`, role-agnostic). No bank/tax reachable.
- **Employee salary self-write:** Blocked twice — column grant (0049) for session-client writes, and `ADMIN_ONLY_FIELDS` + hard-coded `updatePayload` (compensation.ts:405-415) for the service-role self-update path. Salary is never in the writable payload.
- **JWT role desync → RLS mis-scope:** Not exploitable; RLS reads role from `profiles` via `get_user_role()` (0002:26-32), not the JWT.
- **Signed-URL IDOR:** `getSignedDownloadUrl` (documents.ts:377-406) fetches the doc row with the session client (RLS) before signing with service-role, so a manager cannot sign a direct report's `payslip`/`contract`/`id_document` (excluded by `manager_select_direct_report_documents`, 0014).
- **Peer/self employee detail IDOR:** `/employees/[id]` classifies non-admin/non-manager-of-subject viewers as `peer` mode (page.tsx:70-74) → 5-field RPC only; `getCompensation` on that page is gated behind `viewerRole === "admin"` (page.tsx:191).

---

## 3. Service-Role-Key Usage Inventory

`createAdminClient()` / `SUPABASE_SERVICE_ROLE_KEY` call sites and verdicts. Service-role bypasses RLS, so each must justify scope in the app layer.

| # | Site | Purpose | Scope guard | Verdict |
|---|------|---------|-------------|---------|
| 1 | `lib/supabase/admin.ts` | Factory | n/a | OK (fenced `server-only`) |
| 2 | `server/audit.ts:18` | Insert audit rows | audit_logs is service-role-INSERT-only by design (0014); actor/metadata only | OK |
| 3 | `actions/compensation.ts:194` `upsertCompensation` | Admin comp write | `requireRole(["admin"])` | OK |
| 4 | `actions/compensation.ts:371` `selfUpdateCompensation` | Employee non-salary write | Hard-coded `eq("employee_id", user.id)` + `ADMIN_ONLY_FIELDS` reject + payload whitelist | OK |
| 5 | `actions/leave.ts` (multiple: 116, 220, 961, 1015, 1121, 1242, 1408, 1531) | Type/balance/holiday lookups & admin writes | Reads scoped to `user.id` or to an employee_id already loaded via RLS-scoped session client; writes `requireRole(["admin"])` | OK |
| 6 | `actions/employees.ts:141` etc. | Auth admin create/update, profile/record writes, resolver lookups | `requireRole(["admin"])`; resolver search interpolation → **F3** | OK (see F3) |
| 7 | `actions/documents.ts:94` upload, `:401` sign, `:450` delete | Storage upload/sign/soft-delete + resolver | Upload scope-checked (self / direct-report categories); sign fetches row via **session client** first; delete `requireRole(["admin"])` | OK |
| 8 | `actions/onboarding.ts` (multiple) | Template/task admin ops; assign; complete | Admin ops `requireRole(["admin"])`; assign scope via `getDirectReportIds`; complete checks `employee_id`/`assignee_id === user.id` + status gate | OK |
| 9 | `actions/performance.ts` (all writes) | Goal/review mutations | `canManageEmployee` (admin/direct-report, self excluded) or ownership check for employee actions | OK |
| 10 | `actions/app-settings.ts:115` | Settings write | `requireRole(["admin"])` | OK |
| 11 | `dal/compensation.ts:49,79` | `getCompensation`/`getCompensationSummary` | Callers: admin payroll view, own-id (employee/manager self), admin-only branch of employees/[id]. `getManagerVisibleCompensation` uses **session client** for the RPC (correct) | OK |
| 12 | `dal/performance.ts:208,253,288,310` | Name/title hydration only | Row fetch uses **session client** (RLS); admin client only resolves display names for already-authorized rows | OK |
| 13 | `dal/onboarding.ts:59,111,128,150,195,243,289` | Templates/tasks/progress/reports/direct-report ids | RLS-bypassing; scope applied by caller → **F2** | OK today, latent (F2) |
| 14 | `dal/employees.ts:414,552` | Manager upload options; needs-attention | Upload options scoped to `[managerId, ...reportIds]`; needs-attention admin-gated at page (`attentionMode`) | OK |
| 15 | `dal/app-settings.ts` | Settings/timezone reads | Non-sensitive config | OK |
| 16 | `server/email.ts` | Recipient email resolution | Server-only, read-only notification addressing | OK |

**Verdict:** No service-role path is driven by a user-controlled *row selector* that escapes RLS. The highest-risk pattern (user-supplied id → service-role write) is consistently re-scoped in the app layer. The one structural weakness is F2 (scope-in-caller for onboarding DAL).

---

## 4. RLS ↔ App Disagreement Table

| Table / object | DB (RLS) allows | App intends / does | Direction | Finding |
|----------------|-----------------|--------------------|-----------|---------|
| `performance_reviews` (employee SELECT) | Own row, **any status**, incl. `score`+`manager_*` | Reveal manager feedback only at `manager_submitted`+ | **DB looser than app** | **F1 (NEEDS-FIX)** |
| `onboarding_tasks` (via admin-client DAL) | RLS bypassed by service-role | Manager sees direct reports only; scope enforced in page, not DAL | DB stricter, app relies on caller | F2 (NIT) |
| `leave_requests` (manager UPDATE) | `is_direct_report` enforced in RLS | No app-layer scope check on approve/reject | App looser than DB (single-layer) | F4 (NIT) |
| `profiles` (employee/manager own UPDATE) | Column-grant to (display_name, phone, avatar_url); role self-escalation blocked by WITH CHECK | **No app write path exists** (admin-client only) | DB looser than app (latent, safe) | Already logged in rls-policy-map §profiles note; confirmed unreachable |
| `employee_compensation` (employee own UPDATE) | Column-grant non-salary cols | Self-update uses service-role + action guard (grant not the backstop) | Consistent (guards align) | None |
| `profiles`/`employee_records` name resolution | `get_profile_display_names` returns all-status; `get_peer_employee_profile` returns phone | Directory baseline = active only, email only | DB looser than directory baseline | F5 (NIT) |
| _(doc)_ role-check mechanism | Policies use `get_user_role()` → `profiles.role` | `rls-policy-map.md` shorthand documents `jwt_role = auth.jwt() ->> 'role'` | Doc ≠ code (code is stricter) | `[Fable5 · 2026-07-10]` F6 (NIT) |

Every `##` table header in `rls-policy-map.md` maps to an implemented policy set; the two latent-grant notes already documented there (profiles finding 1, documents finding 2) were re-verified as app-unreachable and safe.

---

## 5. What I Could Not Verify (needs runtime / data)

1. **F1 exploitability end-to-end** — I confirmed the RLS policy text permits the read and the draft fields are populated, but I did not execute a direct PostgREST call with an employee token against a live DB to observe the returned columns. Confirm by: create a draft manager review, then `curl` `/rest/v1/performance_reviews?select=score,manager_strengths...` with the subject employee's JWT. `[Fable5 · 2026-07-10]` Policy text re-verified by a second model; the runtime curl (and the equivalent `performance_goals` draft-visibility check from the F1 sibling note) remains the only unproven step.
2. **PostgREST `.or()` injection impact (F3)** — I did not run a crafted `search` (e.g. `x,role.eq.admin`) against a live instance to confirm PostgREST parses the injected clause vs. rejecting it. Needs a running DB to characterize exact behavior; severity stays NIT regardless (admin-gated).
3. **Live schema vs. migrations** — the cross-check gate compares docs to docs, not docs to the live DB (per `rls-policy-map.md:7`). I read migrations as the source of truth; I could not confirm the deployed self-host/cloud DB actually matches (a hand-applied dashboard change could diverge, as 0052 shows has happened before).
4. **`get_company_approved_leave` (0045) scope** — company-wide approved-leave visibility to all authenticated users is documented as an intentional Session-148 product decision; I did not independently confirm it exposes no note/approver fields beyond the stated projection (the migration comment claims it does not).
