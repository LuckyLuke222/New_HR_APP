# Sol Audit 4 — Performance and Optimization

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## 1. Executive summary — biggest wins

At the stated 15–20-user scale, most database inefficiencies will not be user-visible, and the code often parallelizes independent reads. The best low-risk win is request-scoped authentication memoization: every protected page currently repeats an external GoTrue validation and profile lookup already performed by its layout. The most urgent performance issue is actually a correctness/availability bug: an authenticated caller can make `previewWorkingDays` iterate across almost 10,000 years.

Recommended order:

1. Bound date inputs in `previewWorkingDays` (**correctness/DoS**, tiny change).
2. React-`cache` the DB-validated session helper within a render pass (about two network round-trips saved per navigation).
3. Replace the admin dashboard's many independent reads with a small number of aggregate RPCs.
4. Push report filtering/aggregation into SQL as data grows.
5. Lazy-load the charting client island and paginate unbounded operational tables.

## 2. Optimizations ranked by impact/effort

### 1. Bound working-day preview ranges

**Evidence:** `src/server/actions/leave.ts:1515-1529` validates only string shape/order; `:1553-1579` allocates one entry per year and loops every day.

**Issue / trace:** any authenticated employee calls the Server Action directly with `0001-01-01` to `9999-12-31`. It performs roughly 3.65 million date iterations plus a 9,999-entry result and database range query. Repeated calls can occupy the Node worker and cause timeouts for other users.

**Expected impact:** removes an unauthenticated? No—authenticated but low-privilege CPU-exhaustion path; changes worst case from millions of iterations to a bounded few hundred.

**Effort:** XS (hours).

**Change:** use the same Zod date/year bounds as submission, impose a maximum span (for example 366 or a product-approved multi-year limit), and reject impossible `Date` values. Ideally expose the DB `working_days` function/RPC rather than maintain a JS day loop.

### 2. Memoize session verification for the React render pass

**Evidence:** layout calls `getSessionUser` at `src/app/(app)/layout.tsx:12`; each protected page calls `requireRole` again (for example `src/app/(app)/dashboard/page.tsx:36`); each helper call performs `auth.getUser()` and a profile query at `src/lib/supabase/helpers.ts:33-45`. The installed Next auth guide recommends React `cache` for this pattern.

**Issue:** a protected navigation normally performs **2 GoTrue `getUser` calls + 2 profile queries** before page data, because layout and page each build a client and verify the same session. These are cross-service/network round-trips, not local function calls.

**Expected impact:** roughly two upstream requests saved per protected render; likely the highest latency-per-line improvement, especially on self-hosted Compose cold paths.

**Effort:** XS.

**Change:** wrap the DB-validated `getSessionUser` in React `cache` for server rendering, keeping authorization close to each page/action. Confirm behavior for Server Actions separately; do not use persistent cross-user caching.

### 3. Consolidate dashboard aggregates

**Evidence:** the admin dashboard first loads admin IDs, then launches 13 logical operations at `src/server/dal/dashboard.ts:109-190`, followed by additional leave-type hydration (`:214+`). Several nested DAL operations make their own queries; `getAuditLogs`, for example, performs log + profile reads (`src/server/dal/audit-logs.ts:26-89`).

**Issue:** parallelization reduces waterfall latency but does not reduce connection/query count. A single dashboard view causes at least 14 top-level calls and more nested calls, many scanning related leave/employee/task data independently.

**Expected impact:** at current scale, modest latency and materially lower PostgREST/DB chatter; under load, fewer connections and snapshots. A well-shaped RPC could reduce roughly 15–20 requests to 3–5.

**Effort:** M (2–4 days including parity tests).

**Change:** build role-specific aggregate RPCs/views returning counts and bounded recent rows in one consistent snapshot. Keep detailed list DALs separate and paginated.

### 4. Push report predicates and aggregation into the database

**Evidence:** headcount/starters/leavers all call `getVisibleEmployees()` and filter/group in memory (`src/server/dal/reports.ts:265-353`); onboarding completion loads all task progress (`:468-504`); review completion loads all reviews (`:507-535`). Leave usage narrows only the lower bound then aggregates in JS (`:377-425`).

**Issue:** query cost and response bytes scale with total history rather than report output. CSV export repeats the full computation on a second request (`src/app/(app)/reports/export/route.ts:58-84`).

**Expected impact:** negligible at 20 users, high once history reaches tens of thousands of tasks/reviews/leaves. SQL aggregation can reduce O(all rows) transfer to O(groups/output rows).

**Effort:** M–L, per report.

**Change:** use parameterized SQL functions/views for date-range counts and aggregates; paginate detail reports; share the same typed report query for HTML and CSV. Keep spreadsheet-safe serialization.

### 5. Lazy-load Recharts only when a generated report needs a chart

**Evidence:** reports statically imports `ReportChart` at `src/app/(app)/reports/page.tsx:21`, even when no report is selected/generated; the chart is a client component importing Recharts (`src/components/reports/report-chart.tsx:1-11`).

**Issue:** the route's client graph can include charting code on visits that only render the report selector or a table.

**Expected impact:** likely tens to low hundreds of compressed KB avoided on initial `/reports`; exact value requires bundle analysis.

**Effort:** S.

**Change:** dynamically import the chart island only for chart-capable generated reports, or render simple bars server-side/CSS at this product scale.

### 6. Bound onboarding operational reads

**Evidence:** `getAllTasks` has no limit at `src/server/dal/onboarding.ts:124-142`, hydrates profiles/templates in two further queries at `:145-185`; `getOnboardingProgress` loads every task then groups in Node at `:190-234`.

**Issue:** completed task history grows without bound and is repeatedly transferred for admin pages/reports.

**Expected impact:** low today; linear growth in rows/bytes and Node memory over years.

**Effort:** S for pagination, M for aggregate RPC.

**Change:** paginate task lists with stable `(status, created_at, id)` ordering; aggregate progress with `GROUP BY employee_id`; default admin views to active/pending or a date window.

### 7. Restrict holiday fetches to the requested date range

**Evidence:** `fetchActiveHolidayDates` loads every active Mauritius holiday at `src/server/actions/leave.ts:1014-1025`; every submit/approval precheck calls the TS working-day calculation (`:951-1006`, `:1047-1073`). The preview path already performs range predicates (`:1531-1538`).

**Issue:** full holiday history is reloaded for each relevant action. The table is small, but the implementation disregards the date range it already has.

**Expected impact:** small now; one smaller result set and less allocation per leave action.

**Effort:** XS.

**Change:** pass start/end into the holiday query, or delete the TS mirror and call the SQL owner once.

### 8. Avoid repeated hydration clients where joins/RPC projections suffice

**Evidence:** performance goals/reviews are fetched, then service-role clients hydrate profiles and cycle names in separate parallel queries (`src/server/dal/performance.ts:203-285`). Employee records similarly fan out to profile/manager/department queries (`src/server/dal/employees.ts:458-503`).

**Issue:** this is batched, not an N+1, which is good; however each page pays 3–4 PostgREST requests and crosses authorization boundaries to hydrate labels.

**Expected impact:** small latency/query-count reduction; greater benefit is simpler authorization/typing.

**Effort:** M.

**Change:** create fixed projection RPCs/views with viewer scope enforced in SQL, or use supported embedded relations where RLS semantics remain correct. Do not replace batched reads with per-row lookups.

### 9. Add pagination/index strategy only when search volume warrants it

**Evidence:** audit is sensibly capped at 100 (`src/server/dal/audit-logs.ts:31-42`), while several employee/task pickers use `ILIKE`/`OR`; migration indexes are primarily B-tree exact/status/date indexes. No trigram search indexes exist.

**Issue:** `%term%` search will not use ordinary B-tree indexes. At 20 employees this is the right simple choice; adding extensions/indexes now may cost more than it saves.

**Expected impact:** none meaningful at present; potentially large if directory/audit tables grow by orders of magnitude.

**Effort:** S when justified.

**Change:** record slow-query evidence first. Then add `pg_trgm` GIN indexes only to demonstrated hot search columns and enforce server-side limits.

## What is already good

- Independent dashboard reads are generally launched through `Promise.all`, avoiding obvious sequential waterfalls (`src/server/dal/dashboard.ts:109-190`).
- Hydration is batched by unique IDs rather than per-row, avoiding classic N+1 (`src/server/dal/onboarding.ts:145-170`, `src/server/dal/performance.ts:203-223`).
- Audit log reads are bounded to 100 rows (`src/server/dal/audit-logs.ts:31-35`).
- Reports intentionally avoid querying until the user explicitly runs one (`src/app/(app)/reports/page.tsx:60-66`).
- The Docker app image uses Next standalone output and a non-root runner (`Dockerfile:28-47`).

## 3. Could not verify

- **UNVERIFIED:** no production build or bundle analyzer was run, so Recharts byte savings are an estimate.
- **UNVERIFIED:** no traces, query plans, Postgres statistics, Web Vitals, CPU profiles, or real latency distributions exist in the repository; rankings use static query counts and algorithmic bounds.
- **UNVERIFIED:** database row counts beyond documentation snapshots and the stated 15–20-user target were not queried.
- **UNVERIFIED:** React `cache` behavior must be verified with this modified Next build for layout/page render deduplication and must not be assumed to persist safely across Server Action requests.
- No missing-index claim is made without a query plan. The existing low-cardinality status indexes may or may not be used at this scale.
