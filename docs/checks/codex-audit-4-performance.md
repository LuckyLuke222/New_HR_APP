# Codex Audit 4 — Performance & Optimization

## 1. Exec summary — biggest wins

This pass found no proof of a correctness blocker, but several high-return performance fixes are sitting in plain sight:

- Request auth is paid repeatedly on every protected render: proxy calls GoTrue, then the app layout and page guard both call `getSessionUser()`. Memoizing `getSessionUser()` per React request should remove one GoTrue validation and one `profiles` read from nearly every protected page render.
- `/performance` and manager `/onboarding` have duplicate same-request queries that can be removed with tiny changes.
- Several hot surfaces fetch full visible collections and slice/filter in Node: dashboards, employee directory, documents, leave balances, and reports. These should become bounded, DB-filtered, or SQL/RPC aggregate queries before real HR history accumulates.
- The admin reports route statically imports `recharts`, so a heavy charting dependency is attached to the route even before a report is generated.

I did not run builds, bundle analysis, migrations, DB profiling, or tests because this audit is read-only except for this report.

## 2. Optimization list, ranked by impact/effort

1. `src/lib/supabase/helpers.ts:33`, `src/lib/supabase/proxy.ts:50`, `src/app/(app)/layout.tsx:12`, `src/app/(app)/dashboard/page.tsx:36` · Duplicate auth/profile lookups on protected page renders.  
   Scenario: a logged-in user opens `/dashboard`; proxy validates the user with `supabase.auth.getUser()`, then the app layout calls `getSessionUser()`, and the page calls `requireRole()`, which calls `getSessionUser()` again. The layout/page duplication performs two GoTrue `getUser()` calls and two `profiles` selects before dashboard data loads.  
   Expected impact: removes 1 GoTrue round-trip + 1 `profiles` query from almost every protected page render; lower TTFB and less load on GoTrue.  
   Effort: Low.  
   Recommended change: wrap the `getSessionUser()` implementation in React request `cache()` and have `requireRole()` use the cached function. Keep the proxy guard separate unless its security model is redesigned deliberately.

2. `src/app/(app)/performance/page.tsx:71`, `src/server/dal/performance.ts:107` · `/performance` fetches review cycles twice.  
   Scenario: any role opens `/performance`; the page calls `getPerformanceCycles()` and `getActiveOrVisibleCycles()` in the same `Promise.all()`, but `getActiveOrVisibleCycles()` just calls `getPerformanceCycles()` again and filters out `closed` cycles.  
   Expected impact: removes one `performance_review_cycles` query from every `/performance` render.  
   Effort: Low.  
   Recommended change: fetch cycles once and derive `activeCyclesResult` in the page, or change the DAL to accept an optional status filter without re-querying the same result set.

3. `src/app/(app)/onboarding/page.tsx:24`, `src/server/dal/onboarding.ts:287` · Manager `/onboarding` fetches direct-report IDs twice.  
   Scenario: a manager opens `/onboarding`; the tasks branch calls `getDirectReportIds(user.id)`, and the progress branch independently calls the same function. Both hit `employee_records` with the same `manager_id` and `employment_status != 'terminated'` filter.  
   Expected impact: removes one admin-client DB query from every manager onboarding render; also avoids divergent results if assignments change between the two reads.  
   Effort: Low.  
   Recommended change: create one `reportIdsPromise` or fetch once, then pass the IDs to both `getAllTasks(ids)` and `getOnboardingProgress(ids)`.

4. `src/app/(app)/leave/new/page.tsx:23`, `src/app/(app)/leave/new/page.tsx:31`, `src/server/dal/leave.ts:174` · Leave request form over-fetches balances for admin/manager viewers.  
   Scenario: a manager with 40 direct reports opens `/leave/new`; `getMyLeaveBalances([currentYear, currentYear + 1])` is RLS-scoped, so it can return the manager's own balances plus direct-report balances, then the page discards every row except `b.employeeId === user.id`.  
   Expected impact: reduces leave-balance rows and three hydration lookups on the request form from `visible employees × leave types × years` to `1 employee × leave types × years`.  
   Effort: Low to medium.  
   Recommended change: add an employee-scoped balance reader or an optional `employeeId` filter to `getMyLeaveBalances()` and call it with `user.id` for self-service forms.

5. `src/server/dal/dashboard.ts:181`, `src/server/dal/dashboard.ts:426`, `src/server/dal/dashboard.ts:513`, `src/server/dal/dashboard.ts:548`, `src/server/dal/leave.ts:242`, `src/server/dal/documents.ts:41`, `src/server/dal/onboarding.ts:107` · Dashboard panels fetch full collections, then display the first few rows.  
   Scenario: admin dashboard needs five pending leave action items, but `getLeaveRequests({ status: "pending" })` loads every pending request with employee/type hydration, then `buildAdminActionItems()` slices to five. Employee dashboard similarly loads all own documents and all own tasks, then slices recent documents/tasks for cards.  
   Expected impact: bounded dashboard payloads and fewer hydration IDs; removes worst-case dashboard latency growth as leave/doc/task history accumulates.  
   Effort: Medium.  
   Recommended change: add purpose-built DAL methods such as `getPendingLeaveActionItems({ limit: 5, employeeIds? })`, `getRecentDocuments({ employeeId, limit: 5 })`, and `getPendingTasks({ employeeId, limit: 5 })` that push `limit`, `employee_id`, status, and ordering into SQL.

6. `src/server/dal/employees.ts:164`, `src/server/dal/employees.ts:179`, `src/server/dal/employees.ts:657`, `src/app/(app)/employees/page.tsx:92` · Employee directory fetches all visible records before filtering/searching.  
   Scenario: admin opens `/employees?q=alice&status=active&departmentId=<dept>`; the DAL first selects all visible `employee_records`, hydrates all matching profile/manager/department IDs, and only then filters query/status/role/department in Node. Employee/manager all-staff mode does the same pattern through `get_people_directory()` and `filterPeopleDirectory()`.  
   Expected impact: turns O(all employees) reads into O(page size / filtered rows), enables existing `employee_records_status_idx`, `employee_records_department_idx`, and `profiles_role_idx` to matter, and reduces server memory/RSC payload.  
   Effort: Medium to high.  
   Recommended change: push status/department/recent filters into the base query, add pagination, and consider a security-definer search RPC for the limited People Directory projection so search and department filtering happen in SQL.

7. `src/server/dal/reports.ts:265`, `src/server/dal/reports.ts:377`, `src/server/dal/reports.ts:468`, `src/server/dal/reports.ts:507`, `src/app/(app)/reports/export/route.ts:58` · Admin reports use screen-oriented DAL readers and aggregate/filter in Node.  
   Scenario: exporting `review-completion` calls `getPerformanceReviews()`, hydrates employee/manager/cycle names for every visible review, then counts by status and cycle; `onboarding-completion` loads all tasks and profile names, then counts per employee.  
   Expected impact: large reduction in rows transferred and JS aggregation work for report/export paths; lowers timeout risk for historical exports.  
   Effort: Medium to high.  
   Recommended change: implement report-specific SQL/RPC aggregate readers (`GROUP BY` status/cycle/employee, date-bounded leave usage) and have page + CSV export share those DTOs.

8. `supabase/migrations/0006_leave.sql:101`, `supabase/migrations/0007_documents.sql:28`, `supabase/migrations/0008_onboarding.sql:55`, `supabase/migrations/0018_performance_appraisals.sql:138`, plus query sites above · Hot filtered+ordered queries only have mostly single-column indexes.  
   Scenario: dashboard queries commonly combine `status`, `employee_id`, date windows, and `ORDER BY created_at/approved_at/submitted_at`, but migrations define separate indexes such as `leave_requests_status_idx`, `leave_requests_employee_idx`, and `leave_requests_dates_idx`. Postgres may still need bitmap combinations or explicit sorts for top-N dashboard feeds.  
   Expected impact: faster dashboard/report top-N queries after the query shapes are bounded; less sort work and fewer heap visits at scale.  
   Effort: Low to medium, but requires migrations and `EXPLAIN`.  
   Recommended change: add targeted composite/partial indexes only after confirming plans, e.g. pending leave by `(status, created_at desc)`, employee pending leave by `(employee_id, status, created_at desc)`, documents by `(employee_id, deleted_at, created_at desc)` or a partial active-documents index, onboarding by `(employee_id, status, created_at)`, and performance review feeds by `(employee_id, status, submitted_at desc)`.

9. `src/components/reports/report-chart.tsx:1`, `src/app/(app)/reports/page.tsx:21`, `src/server/dal/reports.ts:63`, `package.json:40` · `recharts` is statically attached to the reports route.  
   Scenario: admin visits `/reports?report=starters` or opens `/reports` without generating a chart; `ReportsPage` still statically imports the client `ReportChart`, which imports `recharts`. Only `headcount` and `leave-usage` define chart metadata, and chart rendering happens only after `generate=1`.  
   Expected impact: defers a heavy client dependency from initial reports navigation; `node_modules/recharts` is 8.5 MB on disk, but exact gzip/route impact is UNVERIFIED without a bundle analyzer.  
   Effort: Low to medium.  
   Recommended change: dynamically import the chart component only for generated chart reports, or render simple SVG/HTML bars server-side for the two single-series charts.

10. `src/server/dal/audit-logs.ts:31`, `src/server/dal/audit-logs.ts:38`, `supabase/migrations/0009_audit_logs.sql:22`, `src/app/(app)/audit-logs/page.tsx:45` · Exact audit quick filters use leading-wildcard `ILIKE`, bypassing the plain action/entity indexes.  
    Scenario: admin clicks the documented quick filter for `entity.not_found`; the DAL sends `action ILIKE '%entity.not_found%'`, so `audit_logs_action_idx` cannot serve it like an equality lookup. On a large append-only audit table this turns a common security-review filter into a scan over matching date/order constraints.  
    Expected impact: faster audit filtering once logs are large; lower admin-page latency during incident review.  
    Effort: Low.  
    Recommended change: use exact `.eq()` matching for known action/entity filters, reserve substring search for a separate free-text mode, or add a trigram index if substring search is a hard requirement.

## 3. Could-not-verify

- Exact query plans and index benefit need `EXPLAIN (ANALYZE, BUFFERS)` against representative data. I did not connect to or mutate the database.
- Exact client bundle impact needs `next experimental-analyze` or a production build artifact. I did not run build/analyzer because they write `.next` diagnostics.
- Runtime TTFB/RSC payload impact needs profiling on seeded or production-like row counts. The scenarios above are code-path proofs, not measured latency numbers.
- Cache Components / `unstable_instant` navigation benefits are UNVERIFIED. The local Next 16 docs recommend them for instant navigations, but this app has per-user Supabase/RLS data and would need profiling plus careful invalidation design before caching personalized data.
