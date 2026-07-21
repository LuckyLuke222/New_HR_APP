# Fable Audit 4 — Performance & Optimization

> **Authorship (verified):** all findings below authored by **Opus 4.8** on 2026-07-10 — run inline in a Claude Code session (no subagent). Despite the "Fable Audit" title, this is an Opus-authored pass. Later passes append findings tagged `[Model · date]`.
> **[Fable5 · 2026-07-11]** Second pass authored by **Fable 5**, run as a Claude Code subagent (single Fable 5 turn; no Opus turns in this pass). Independent audit from source only, then merged/deduped here. Entries `F1–F9` and bullets tagged `[Fable5 · 2026-07-11]` are Fable 5's.
> Provenance: `[Fable5 · date]` = Fable 5 · `[Opus · date]` = Opus · untagged = original pass above.

**Scope:** Performance recommendations (not correctness blockers, except where flagged).
**Method:** Static read of `src/`, `supabase/migrations/`, design docs. No profiling/runtime data — latency/byte figures are reasoned estimates, ranked by impact-per-effort. Items needing an `EXPLAIN`/build to confirm are in §3.
**Stack verified:** Next.js **16.2.9** (App Router, RSC + Server Actions), self-hosted Supabase, `@supabase/ssr`, `recharts@3`, React `cache()` available (`typeof React.cache === "function"`).

Independence: I did not read the parallel reviewer's files or the prior audits.

---

## 1. Exec summary — biggest wins

1. **Auth is re-resolved 2–3× per page with zero memoization.** `getSessionUser()` runs `auth.getUser()` (a GoTrue round-trip that validates the JWT server-side) **plus** a `profiles` select, and it's invoked independently by the layout *and* the page on every navigation — on top of the middleware's own `auth.getUser()`. Wrapping `getSessionUser` in React `cache()` collapses the layout+page duplication for ~zero effort. **Top win.**
2. **Several dashboard/report queries over-fetch whole tables to display 5 rows or 2 counts** — `getPerformanceDashboardSummary` pulls every `performance_reviews` row, `getAuditLogs()` pulls 100 rows for a 5-row panel, `getLeaveRequests({status:"pending"})` pulls the entire pending queue (+3 name-lookup queries) then `slice(5)`. All bounded only by RLS, so cost grows with company size.
3. **The DAL does app-side joins everywhere** — each list is 1 base query + 2–4 follow-up `IN()` lookups. Correct and N+1-free (batched, not per-row), but 3–5× the round-trips of a single PostgREST embedded select. Architectural recommendation.
4. **`recharts` ships to every `/reports` visitor** via a static import, even for the 6 of 8 reports with no chart. Lazy-load it.
5. **[Fable5 · 2026-07-11]** **Mutating Server Actions block on outbound email HTTP with no timeout.** 14 call sites `await sendEmail(...)` (leave submit/approve/reject, onboarding, performance) — each a `fetch` to `api.resend.com` with **no AbortSignal**, run as *two sequential* sends per action plus an audit insert per send. Adds hundreds of ms to every leave/onboarding/appraisal mutation; on a network hang the action blocks indefinitely (timeout/correctness flag, F1).
6. **[Fable5 · 2026-07-11]** **Redundant round-trips inside single requests**: `submitLeaveRequest` fetches `leave_types` 3× and `public_holidays` 2× per submission (F2); `/performance` queries `performance_review_cycles` twice per render (F4); the manager dashboard runs an `onboarding_tasks` count and the employee dashboard a compensation-summary query whose results are **never rendered** (F5).

Good news that narrows the surface: **indexing is solid** (FK/filter columns on `leave_requests`, `onboarding_tasks`, `audit_logs`, `employee_records`, `profiles`, `performance_*` all have `create index` in their table migrations); dashboards are **already well-parallelized** with `Promise.all`; list hydration is **batched, not per-row N+1**. *[Fable5 · 2026-07-11]: two caveats to the "well-parallelized" note — the employee dashboard runs a second serialized query wave, and several pages serialize an options fetch ahead of the main data fetch; see F8.*

---

## 2. Optimization list (ranked by impact / effort)

### P1 — Memoize `getSessionUser()` with React `cache()`
- **File:** `src/lib/supabase/helpers.ts:33` (called at `src/app/(app)/layout.tsx:12` and by `requireRole` → every `page.tsx`, e.g. `src/app/(app)/dashboard/page.tsx:36`).
- **Issue:** `getSessionUser` = `supabase.auth.getUser()` (GoTrue HTTP call — `@supabase/ssr`'s `getUser()` always revalidates against the auth server, unlike `getSession()`) + a `profiles` row select. In the App Router, the layout and the page render in the **same** RSC pass but each calls it fresh, so every page load does **2× `auth.getUser()` + 2× `profiles` query**. Add the middleware's own `auth.getUser()` (`src/lib/supabase/proxy.ts:52`) and you're at **3 GoTrue round-trips per navigation**.
- **Concrete scenario:** Load `/dashboard` as admin → middleware `getUser` (1) → layout `getSessionUser` `getUser`+`profiles` (2) → page `requireRole`→`getSessionUser` `getUser`+`profiles` (3). Two of the three GoTrue calls and one `profiles` query are pure duplication.
- **Impact:** −1 GoTrue round-trip and −1 `profiles` query on **every** authenticated page (more on any route where a Server Action or DAL later re-checks the role in the same request). On a self-hosted GoTrue each `getUser` is a network hop + JWT verify; this is the highest-frequency redundant call in the app.
- **Effort:** Trivial. `export const getSessionUser = cache(async () => { … })` (React `cache`, stable API — not affected by the "modified Next" caveat). Dedup is per-request, so it cannot leak identity across users.
- **Note:** The middleware call is a separate request context and won't be deduped by `cache()` — that one is inherent to SSR auth and should stay.

### F1 — [Fable5 · 2026-07-11] Server Actions block on outbound email HTTP with no timeout (also a timeout-correctness risk)
- **Files:** `src/server/email.ts:124` (`fetch(RESEND_ENDPOINT, …)` — no `AbortSignal`, no timeout); awaited at 14 call sites: `src/server/actions/leave.ts:486,501` (submit), `:649,667` (approve), `:780,798` (reject), `src/server/actions/onboarding.ts:325,341,440,455`, `src/server/actions/performance.ts:1040,1054,1365,1377`.
- **Issue:** The comment in `email.ts:9–13` says "fire-and-forget", but every caller **awaits** `sendEmail` — twice, sequentially (notification then confirmation) — before returning to the user. Each send is: 1 external HTTPS request to `api.resend.com` + 1 `audit_logs` insert (`email.sent`/`email.failed`), so a leave submission pays 2 WAN round-trips + 2 audit inserts *after* the row is already committed.
- **Concrete scenario:** Employee submits leave while Resend is slow (or DNS to `api.resend.com` stalls). `fetch` has no `AbortSignal` and Node's default has no request timeout → the Server Action response hangs for the duration of the OS TCP timeout (minutes). The user sees a stuck pending form for a mutation that already succeeded; retrying risks a confusing duplicate-overlap error. This is the run's "also causes a correctness/timeout bug" case.
- **Impact:** +200–1000 ms typical (2 sequential WAN calls + 2 audit inserts) on every leave/onboarding/appraisal mutation; unbounded worst case.
- **Effort:** Low. (a) Add `signal: AbortSignal.timeout(5000)` to the fetch; (b) run the two sends via `Promise.all`; (c) ideally move the whole notify block off the response path with `next/server`'s `after()` (verify against `node_modules/next/dist/docs/` per AGENTS.md) — the emails' audit rows keep the feedback loop, so nothing observable is lost.

### P2 — `getPerformanceDashboardSummary` fetches the entire `performance_reviews` table
- **File:** `src/server/dal/performance.ts` (`getPerformanceDashboardSummary`, the `.from("performance_reviews").select("id, status")` branch, ~line 172).
- **Issue:** Runs on **every** dashboard render for all three roles. It selects **all** review rows (RLS-scoped: admin sees the whole company) with no limit, then computes `openReviews`/`submittedReviews` by filtering in JS.
- **Concrete scenario:** Admin with 5,000 historical reviews loads the dashboard → 5,000 rows pulled over the wire every visit to produce two integers.
- **Impact:** Unbounded row transfer that grows with review history; on the hot dashboard path.
- **Effort:** Low. Replace with count-only queries (`select("id",{count:"exact",head:true})` with the two status predicates), matching how `activeGoals` is already counted two lines above — or a small `SECURITY DEFINER` count RPC.

### P3 — Dashboard pulls 100 audit rows + a 100-actor name lookup for a 5-row panel
- **Files:** `src/server/dal/dashboard.ts:158` (`getAuditLogs()`), `src/server/dal/audit-logs.ts:34` (`.limit(100)` + `fetchProfileNames` over every distinct actor), consumed at `src/server/dal/dashboard.ts:238` (`auditResult.logs.slice(0, 5)`).
- **Issue:** The admin dashboard only shows 5 recent audit events but `getAuditLogs()` always fetches 100 and then resolves display names for up to 100 distinct actors via a second `profiles IN()` query.
- **Impact:** ~95 wasted rows + one oversized `profiles` lookup on every admin dashboard load.
- **Effort:** Low. Add an optional `limit` param to `getAuditLogs` and pass `5` from the dashboard; the audit-logs *page* keeps 100.

### P4 — Admin/manager dashboard fetches the full pending-leave queue to show 5 items
- **File:** `src/server/dal/dashboard.ts:181` (admin) and `:361` (manager) call `getLeaveRequests({ status: "pending" })`; result is `slice(5)`'d in `buildAdminActionItems` (`:731`) / `buildManagerActionItems`.
- **Issue:** `getLeaveRequests` (`src/server/dal/leave.ts:242`) fetches **all** matching rows **and** fires 3 follow-up lookups (`fetchProfileNames` ×2 + `fetchTypeNames`) to hydrate names for the entire set — then the dashboard keeps 5.
- **Impact:** For admin, the whole company pending queue + 3 name-resolution round-trips over that full set, every dashboard load. Scales with backlog size.
- **Effort:** Medium. Either add a `limit` to `getLeaveRequests`/`LeaveRequestFilters` (hydrate only the truncated set) or a dedicated "top-N pending" query.
- *[Fable5 · 2026-07-11] Corroborating detail:* the manager path pays this **twice** — `dashboard.ts:353–362` runs a head-count of pending requests for the direct reports *and* `getLeaveRequests({status:"pending"})` for the same queue in the same `Promise.all`; the count is derivable from the (limited) list, or vice versa.

### F2 — [Fable5 · 2026-07-11] `submitLeaveRequest` re-fetches the same reference data up to 3× per submission
- **File:** `src/server/actions/leave.ts` — `leave_types` name looked up at `:221` (admin client), again at `:309` (session client, urgent-leave branch), and a third time inside `getLeaveBalanceSetupError` at `:963–969`; `public_holidays` fetched at `:340` (`calculateWorkingDays` → `fetchActiveHolidayDates` `:1014`) and **again** at `:958` (`getLeaveBalanceSetupError` internally calls `calculateWorkingDays` a second time).
- **Issue:** Copy-paste-twin drift across a long sequential action: the same leave-type `name` and the same holiday set are re-queried instead of threaded through. A single submission runs ~10 serialized DB round-trips before the insert; at least 4 are duplicates of data already in hand (`requestedTypeName` at `:244` already answers the `:309` check verbatim).
- **Concrete scenario:** Any leave submission: `:309`'s urgent-leave lookup re-asks the DB for the name compared at `:248`; `getLeaveBalanceSetupError(:362)` recomputes `calculateWorkingDays` that `:340` just computed, re-fetching all holidays.
- **Impact:** −4 DB round-trips per submission (~10–40 ms self-host, more under load); shortens the longest serialized action chain in the app.
- **Effort:** Low. Pass `requestedTypeName` and the `perYear` result of the first `calculateWorkingDays` into `getLeaveBalanceSetupError` (optional params keep the approve-path caller unchanged).

### F3 — [Fable5 · 2026-07-11] `/leave` page: unbounded full-history fetch + all-company balance fetch for row annotations
- **File:** `src/app/(app)/leave/page.tsx:54–80`; `src/server/dal/leave.ts:242–311` (`getLeaveRequests`, no `.limit()`), `:174–238` (`getMyLeaveBalances`).
- **Issue:** Default view is `status=all` with no date filter and no pagination — for an admin that is **every leave request ever recorded**, hydrated with 3 `IN()` lookups, rendered as one table. Then `getMyLeaveBalances(balanceYears)` — despite the `My` name — fetches **every visible employee's** balances for every year touched by any listed request (admin: whole company × years), only to annotate pending rows with per-approver balance context and render the viewer's 3 cards.
- **Concrete scenario:** Company with 3 years of history (~2–5k requests) — every admin visit to `/leave` transfers the full table + company-wide balances; `leaveBalanceContext` then does an O(rows × balances) `Array.find` per pending row.
- **Impact:** Grows linearly with tenure; the single heaviest page at scale. Fine at 15–20 users today — scalability recommendation.
- **Effort:** Medium. Default the status filter to `pending` or add `.limit(100)` + "load more"; fetch balance context only for pending rows' `(employee, type, year)` tuples; index `leave_requests(created_at desc)` if the ordered scan shows in `EXPLAIN`.

### P5 — Leave-usage report triggers 3 name-lookups it never reads
- **File:** `src/server/dal/reports.ts:385` → `getLeaveRequests({ status: "approved", from })`.
- **Issue:** The report only consumes `startDate` and `deductedDays` (`:393–401`), but `getLeaveRequests` unconditionally resolves employee names, approver names, and leave-type names (3 extra `IN()` queries in `leave.ts:277`). Pure waste on this path.
- **Impact:** 3 unnecessary round-trips (+ their row transfer) per leave-usage report run, scaling with approved-leave volume in range.
- **Effort:** Low–medium. Add a lean projection (e.g. a `hydrate: false` option or a `getApprovedLeaveDays(from,to)` selecting only `start_date, deducted_days`).

### P6 — App-side joins instead of PostgREST embedding (whole DAL)
- **Files:** `src/server/dal/leave.ts:209/277/336`, `employees.ts:465/578`, `onboarding.ts:157`, `audit-logs.ts:48`.
- **Issue:** Every list = 1 base query + 2–4 batched `IN()` follow-ups for profile/type/department/template names. This is **not** per-row N+1 (it's correctly batched), but PostgREST supports embedded resources (`select("…, leave_type:leave_types(name), employee:profiles(display_name)")`) that return the same shape in **one** round-trip.
- **Impact:** 3–5× fewer DB round-trips per list on `/leave`, `/employees`, `/onboarding`, `/audit-logs`, and the dashboards that reuse these DALs. Round-trip count, not row volume, is the win.
- **Effort:** Medium, with real risk — embedded selects run under the embedded table's RLS, and some hydration encodes policy logic (e.g. `leave.ts:221–226` treats a missing leave-type lookup as "inactive, hide the row"). Migrate one DAL, verify RLS parity + those derived flags, then fan out. Recommendation, not a quick win.

### P7 — `getVisibleEmployees` loads the whole table and filters/paginates in memory
- **File:** `src/server/dal/employees.ts:164` (+ `filterEmployees` at `:657`).
- **Issue:** Fetches **all** `employee_records`, hydrates **all** profiles + departments, then applies query/status/role/department filters in JS. No DB-side `WHERE`, no `LIMIT`, no pagination. Reused by the `/employees` page and the headcount/starters/leavers reports (`reports.ts:266/307/329`), each of which reloads the entire dataset.
- **Impact:** O(company size) transfer + hydration on every employees-page navigation and report run. Fine at hundreds; degrades linearly toward thousands. No timeout risk at expected scale — a scalability recommendation.
- **Effort:** Medium. Push `status`/`role`/`departmentId` to the query and add keyset/offset pagination; keep free-text search in memory or move to `ilike`.

### F4 — [Fable5 · 2026-07-11] `/performance` queries the cycles table twice per render
- **File:** `src/app/(app)/performance/page.tsx:71–81` runs `getPerformanceCycles()` **and** `getActiveOrVisibleCycles()` in the same `Promise.all`; `src/server/dal/performance.ts:107–116` shows the latter just calls `getPerformanceCycles()` again and filters `status !== "closed"` in JS.
- **Concrete scenario:** Every `/performance` visit issues two identical `performance_review_cycles` selects; one is pure duplication.
- **Impact:** −1 DB round-trip per `/performance` render.
- **Effort:** Trivial. Derive `activeCycles = cyclesResult.cycles.filter(c => c.status !== "closed")` in the page (the closed-filter already exists in the DAL to copy from).

### F5 — [Fable5 · 2026-07-11] Dashboards run queries whose results are never rendered (orphan fetches)
- **Files:** `src/server/dal/dashboard.ts:363–369` — manager `openTasks` head-count on `onboarding_tasks`; `src/server/dal/dashboard.ts:515` — employee `getCompensationSummary(employeeId)`.
- **Issue:** `ManagerDashboardData.openTasks` and `EmployeeDashboardData.compensationSummary` are populated but **no consumer reads them**: `src/app/(app)/dashboard/page.tsx` renders neither (the comment at `page.tsx:216–218` says payroll summary was deliberately removed from the employee dashboard — the fetch outlived the feature). Verified by grep: both fields appear only in `dal/dashboard.ts`. Classic multi-session-AI orphan: the UI was removed, the data plumbing wasn't.
- **Impact:** −1 query per manager dashboard load, −1 (service-role, salary-touching) query per employee dashboard load. The compensation one is also a needless service-role read of salary data on a high-traffic path — minor hardening win too.
- **Effort:** Trivial. Delete the two fetches + type fields.

### F6 — [Fable5 · 2026-07-11] Admin dashboard pulls every `onboarding_tasks` row to compute two counts
- **File:** `src/server/dal/dashboard.ts:156–157` (`.from("onboarding_tasks").select("status")` — unbounded), consumed at `:223–236` (`total` / `completed` / `pending`).
- **Issue:** Same shape as P2 on a different table: all task rows fetched (admin RLS = whole company, all history) to compute an onboarding progress percentage.
- **Impact:** Unbounded row transfer growing with task history, on every admin dashboard load.
- **Effort:** Low. Two head-count queries (`status=completed`, total), matching the count pattern already used at `:147–150`.

### F7 — [Fable5 · 2026-07-11] RLS policies evaluate `get_user_role()` per row (auth_rls_initplan)
- **Files:** `supabase/migrations/0002_profiles_departments.sql:26–32` (`get_user_role()` = SECURITY DEFINER subselect on `profiles`), used **bare** in `using`/`with check` across nearly every policy — e.g. `0002:41–44` (`admin_all_profiles`), `0006_leave.sql:24–31` (`leave_types`), `0006:57–73` (`leave_balances`), plus the `employee_records`/`documents`/`performance_*`/`audit_logs` equivalents. Same for bare `auth.uid()` and the inherently per-row `is_direct_report(employee_id)` (`0003:40–52`).
- **Issue:** This is the standard Supabase `auth_rls_initplan` lint: a bare stable function call in a policy qual may be re-evaluated **per row scanned**, and `get_user_role()` is itself a subquery on `profiles` — so a sequential scan of N `leave_requests` rows can execute N profile lookups inside the policy. Wrapping as `(select public.get_user_role())` (and `(select auth.uid())`) makes it an InitPlan evaluated once per statement.
- **Concrete scenario:** Admin `/leave` default view (see F3) scans the full `leave_requests` table; each row evaluates `admin_all_leave_requests`' `public.get_user_role() = 'admin'`. Cost is invisible at 15–20 users, and grows with the largest-scanned tables (`leave_requests`, `audit_logs`).
- **Impact:** Scale-dependent DB CPU on every RLS-filtered scan; the fix is the single cheapest DB-side win available when row counts grow. UNVERIFIED at runtime — needs `EXPLAIN (ANALYZE)` on seeded volume to quantify (see §3).
- **Effort:** Low–medium. One migration rewriting policy quals to `(select …)` form; no behavior change. Coordinate with the security-model docs since it touches every policy (blast-radius per `docs/systems-thinking.md`).

### P8 — `recharts` statically bundled into the `/reports` client payload
- **File:** `src/app/(app)/reports/page.tsx:21` imports `ReportChart` (`src/components/reports/report-chart.tsx:1`, `"use client"`, pulls `recharts`).
- **Issue:** Static import means `recharts` (~100KB+ gzipped) is in the `/reports` route's client JS for **all** admins, including the 6 of 8 reports with no `meta.chart` and before any report is even run.
- **Impact:** Meaningful bundle/TTI cost on the reports route. Mitigated by it being admin-only and low-traffic → lower priority than P1–P5.
- **Effort:** Low. `const ReportChart = dynamic(() => import(...), { ssr: false })` so it loads only when a chart report renders. (Verify `next/dynamic` semantics against `node_modules/next/dist/docs/` per AGENTS.md before applying.)

### F8 — [Fable5 · 2026-07-11] Page-level sequential awaits that could parallelize (assorted, one wave each)
- **Files / issues:**
  - `src/app/(app)/employees/page.tsx:92` — `await getDepartmentOptions()` fully serialized ahead of the main directory fetch (`:103–121`); only the limited-projection branch needs the department *label* before querying.
  - `src/app/(app)/payroll/page.tsx:134→141` — admin path awaits `getAllEmployeeOptions()` then `getCompensation(selectedEmployeeId)`; independent.
  - `src/server/dal/dashboard.ts:125–130` — admin-profiles query serialized ahead of the 13-query `Promise.all` (`:146`); only the post-fetch filters need it, so it can join the batch.
  - `src/server/dal/dashboard.ts:532` (`getEmployeeRecentUpdates`) — its three `leave_requests`/`performance_reviews` queries (`:568–599`) depend only on `employeeId`+`sinceIso`, but run as a second wave after the first `Promise.all` (`:498–518`); only the in-memory merge needs the first wave's results.
- **Concrete scenario:** Employee dashboard = 3 serialized DB waves (batch 1 → recent-updates batch → name-lookup batch) where 2 suffice; each page above pays one extra round-trip of latency.
- **Impact:** −1 round-trip-time of latency per affected page (employees, payroll-admin, both dashboards). Small individually; these are the only real waterfalls found — everything else parallelizes well.
- **Effort:** Low each. Move the leading fetch into the existing `Promise.all` (employees page needs a tiny reorder of the label lookup).

### P9 — Near-static reference tables re-queried every request
- **Files:** `leave.ts:125/148` (`leave_types`), `employees.ts:434` (`departments`), `leave.ts:78` (`public_holidays`).
- **Issue:** These change rarely (admin edits) but are re-fetched per request because every page is dynamically rendered (cookie-backed `createClient`). At minimum `getLeaveTypes`/`getActiveLeaveTypes` are called on multiple leave/dashboard paths within one request with no dedup.
- **Impact:** A handful of avoidable small queries per request. Low individually; adds up across the leave surface.
- **Effort:** Medium. Cheap step: React `cache()` for per-request dedup. Bigger step: `unstable_cache` with a tag invalidated from the admin edit actions (which already call `revalidatePath`, so the pattern exists) — but the per-role RLS on `leave_types` (inactive hidden from non-admins) means a cross-request cache must be keyed by role. Verify `unstable_cache` behavior in the modified Next before adopting.

### F9 (micro) — [Fable5 · 2026-07-11] `getVisibleEmployeeById` re-queries `profiles` for a column it already fetched
- **File:** `src/server/dal/employees.ts:243–247` — after `hydrateEmployeeRows` (whose `getProfilesById`, `:512–517`, already selects `avatar_url`), the function issues a second `profiles` select for `avatar_url` alone.
- **Issue:** Copy-paste divergence: the hydration DTO drops `avatar_url`, so the detail page refetches it instead of threading it through.
- **Impact:** −1 query per employee-detail view. Micro.
- **Effort:** Trivial. Expose `avatarUrl` from the already-fetched `ProfileRow`.

### P10 (micro) — `createClient()` re-invoked per DAL call within a request
- **Files:** e.g. `dashboard.ts` sub-helpers `:259`, `:490`, `:567`, `:700`; each DAL fn opens its own client.
- **Issue:** `createClient()` (`src/lib/supabase/server.ts:7`) `await cookies()` + rebuilds the SSR client on every call. No network, so cheap — but repeated dozens of times per dashboard render.
- **Impact:** Minor CPU/allocation only. Listed for completeness.
- **Effort:** Low. `cache()` on `createClient` would dedup the cookie read per request. Optional.

---

## 3. Could-not-verify (needs profiling / runtime data)

- **Actual query plans.** Indexes exist on the common filter/FK columns, but a few hot dashboard queries **sort/filter on un-indexed columns**: `leave_requests.approved_at` (`dashboard.ts:187`, `.gte(approved_at).order(approved_at desc)`), `performance_reviews.submitted_at` (`:408`), `onboarding_tasks.completed_at` (`:397`). These are pre-filtered by an indexed `status`/`employee_id` predicate, so the planner likely index-scans then sorts a small set — probably fine. Needs `EXPLAIN ANALYZE` on seeded volume to decide whether a composite/partial index (e.g. `leave_requests(status, approved_at desc)`) is worth it. **Do not add speculatively.**
- **Bundle sizes.** P8's recharts cost and the 45 `"use client"` boundaries' aggregate JS need `next build` + a bundle analyzer to quantify. The `"use client"` count looks proportionate (forms/interactive widgets); I found no obviously misplaced boundary, but didn't measure.
- **GoTrue latency.** P1's payoff scales with per-`getUser` latency. On a co-located self-hosted GoTrue this is a LAN hop + JWT verify (small but non-zero, and it's on every render); worth confirming with a timed request before/after.
- **Whether P2/P4 over-fetch actually hurts today** depends on current row counts in `performance_reviews` / pending `leave_requests`. The code cost is unbounded-by-design; the *present* impact needs prod row counts.
- **[Fable5 · 2026-07-11] F1's real-world latency** needs a timed mutation in the deployed environment: how long the two sequential Resend calls take from the server (and whether the deployed box actually reaches `api.resend.com` — project memory says production email moved to Gmail, so the Resend fetch may be failing/skipping fast via `email.failed` audit rows; check `audit_logs` for `email.*` actions to see which path is live). Either way the no-timeout `fetch` stands.
- **[Fable5 · 2026-07-11] F7 (RLS initplan)** needs `EXPLAIN (ANALYZE, BUFFERS)` on a seeded `leave_requests`/`audit_logs` scan comparing bare vs `(select …)`-wrapped policy quals; I did not run against the live DB (read-only run, DB state unknown).
- **[Fable5 · 2026-07-11] Half-open verification of F5:** grep confirms `openTasks`/`compensationSummary` have no reader in `src/`; a Playwright/manual check that no test asserts on them is prudent before deleting (per project memory: grep the test suite before removing surface).

---

## Notes on what I did **not** flag
- No per-row N+1: every hydration path batches IDs into a single `IN()` (`unique(...)` helpers throughout).
- Dashboards already parallelize independent reads with `Promise.all` (`dashboard.ts:132`, `:352`, `:498`) — no obvious sequential-await waterfalls to unwind there.
  - *[Fable5 · 2026-07-11] Partial correction:* two dashboard waterfalls do exist — the admin-profiles pre-query at `dashboard.ts:125` and the employee recent-updates second wave at `:532` — plus page-level ones on `/employees` and `/payroll`. Details in F8; the broader point (main batches are parallel) stands.
- Indexing on FK/filter columns is present and matches the query shapes (contrary to a first grep for `CREATE INDEX` — the migrations use lowercase `create index` inline in each table's DDL).
- `payroll_change_requests` indexes (`0005`) are dead (table dropped in `0048`) but that's schema hygiene, out of scope for this run.
