# Reporting Module — Research & Build Guideline

Admin-only HRMS reporting module. This doc is the authoritative guideline for building it: the report catalogue, where each report's data comes from, the access model, and the architecture. Conclusions are grounded against KushHR's actual tables and roles; external prior art is cited where it shaped a decision.

**Status:** **v1 COMPLETE — Phases 1 + 2 + 3 + 4 shipped.** Phase 1 = skeleton, admin-only `/reports`, `report.generated` audit, 4 reports (headcount / starters / leavers / needs-attention). Phase 2 = 4 more reports as tables: **Leave usage** (Day/Month/Year grain toggle, bucketed by request **start date**, days from `deducted_days`), **Absence list** (leave overlapping the window, **status multiselect** — Approved/Pending/Cancelled/Rejected, defaults to Approved; Days shows `—` when `deducted_days` is null, e.g. seeded/legacy or pending rows — owned by the approval trigger, never recomputed), **Onboarding completion** (completed/total per employee), **Review completion** (per-cycle status counts, **no score**). Phase 3 = CSV export via `/reports/export` Route Handler (`report.exported` audit, hand-rolled CSV, admin-only with 403 on denial). Phase 4 = themed bar charts (lean **`recharts`** wrapper, single `--chart-1` token) rendered above the table for **Headcount** and **Leave usage** only; declarative `meta.chart` spec, reads the same DTO as the table. Plan: `~/.claude/plans/reporting-module-plan.md`.
**Hard constraint:** only the **admin** role may generate or view reports. Managers and employees must never reach `/reports`.
**Core principle:** reports are **read-only projections** of existing source-of-truth tables. They never become a second owner of any number (per `docs/systems-thinking.md`). Leave-day counts, `deducted_days`, etc. already have owners — reports read them, never recompute divergently.

---

## 1. What the market actually ships (and why it matters here)

The durable, cross-vendor "standard" HRMS report catalogue is small and stable. Across BambooHR, Zoho People, Personio, Gusto and FirstHR, the recurring core is:

- **Headcount / org** — current headcount, by department/status/type.
- **Starters / leavers (turnover)** — new hires and terminations over a period.
- **Leave / absence** — time-off usage, absence lists.
- **Onboarding / compliance** — onboarding completion, document/compliance status.
- **Performance** — review completion (counts/status), occasionally score distribution.
- **"Employees needing attention" / data quality.**

Key external observations that shaped this guideline:

- **Charts-then-table is the norm, not charts alone.** Personio renders a bar chart *followed by* a table of absolute figures. A table-first report is already usable; charts are progressive enhancement. ([Personio system reports](https://support.personio.de/hc/en-us/articles/115005077129-System-reports))
- **CSV/PDF/XLSX export is a baseline expectation.** Gusto exports every report as PDF/CSV/XLSX. CSV is the cheapest and matches our existing precedent. ([Gusto help](https://support.gusto.com/article/101334493100000/View-and-download-reports))
- **Org-wide reports are admin/HR-only across vendors.** Zoho reserves "Organization Reports" for administrators and HR executives. KushHR's admin-only constraint is the industry norm, not a limitation. ([Zoho People](https://www.zoho.com/blog/people/make-faster-more-effective-hr-decisions-with-the-all-new-consolidated-reports-in-zoho-people.html))
- **The long tail is not worth chasing.** BambooHR ships ~30 prebuilt reports but the value concentrates in the core above. ([BambooHR reporting](https://www.bamboohr.com/hr-reporting), [headcount report](https://www.bamboohr.com/blog/growing-something-new-headcount-report-can-track))

Sources: [BambooHR](https://www.bamboohr.com/hr-reporting) · [Zoho People](https://www.zoho.com/blog/people/make-faster-more-effective-hr-decisions-with-the-all-new-consolidated-reports-in-zoho-people.html) · [Personio](https://support.personio.de/hc/en-us/articles/115005077129-System-reports) · [Gusto](https://support.gusto.com/article/101334493100000/View-and-download-reports) · [FirstHR](https://firsthr.app/blog/core-hr/hr-report) · [AIHR](https://www.aihr.com/blog/types-of-hr-reports/)

---

## 2. The single biggest de-risking fact

**KushHR already computes most of these aggregates — in the dashboard DAL, not on a report surface.**

`getAdminDashboardData` in `src/server/dal/dashboard.ts` already derives:

- Headcount — `employee_records` where `employment_status != 'terminated'` (`dashboard.ts:147-150`)
- Starters last-30 — `start_date >= since` (`dashboard.ts:159-162`)
- Leavers last-30 — terminated + `end_date` window (`dashboard.ts:167-173`)
- Approved-leave-days — (`dashboard.ts:174-178`)
- Employees needing attention — `getEmployeesNeedingAttention` (`dashboard.ts:179`, defined `src/server/dal/employees.ts:11-21`)
- Onboarding completion counts — (`dashboard.ts:155-156, 223-228`)

So the reporting module is largely a **re-projection with date-range parameters** of logic that already exists and is already trusted. Reports read the same owners the dashboard reads → no new source of truth.

`getEmployeesNeedingAttention` (`employees.ts:11-21`) even ships its own reason taxonomy: `no_manager | no_department | no_work_email | missing_phone | missing_passport | missing_nationality` (active employees only, admin-client gated). The needs-attention report is a thin wrapper over it.

---

## 3. Report catalogue (build spec)

v1 = the 8 rows marked **v1** — the highest-value set that maps cleanly to owned data with no sensitive-value exposure.

| Report name | Domain | Source tables/columns | Suggested filters | Output | Sensitivity | v1 / deferred |
|---|---|---|---|---|---|---|
| Headcount summary | Headcount/org | `employee_records` (employment_status, department_id), `departments.name` | as-of date, group-by department/status/type | Table + KPI + chart | Low | **v1** |
| Starters (new hires) | Onboarding/starters | `employee_records.start_date`, `profiles.display_name`, `departments.name` | date range, department | Table + CSV | Low | **v1** |
| Leavers | Offboarding/leavers | `employee_records` (employment_status=terminated, end_date, updated_at) | date range, department | Table + CSV | Low (termination is HR-sensitive context) | **v1** |
| Leave usage (daily/monthly/yearly) | Leave/absence | `leave_requests` (status=approved, start/end, **deducted_days**), `leave_types.name`, `profiles` | date range, leave type, group-by employee/dept/month | Table + CSV | Low | **v1** |
| Absence list | Leave/absence | `leave_requests` (date overlap, status multiselect via `getWhoIsOut`), `profiles`, `leave_types` | date range, **status (multiselect, default approved)** | Table + CSV | Low | **v1** |
| Employees needing attention | Data quality | `getEmployeesNeedingAttention` (`employees.ts:11-21`) | reason filter | Table + CSV | Low (lists missing fields, not values) | **v1** |
| Onboarding task completion | Onboarding | `onboarding_tasks` (status, due_date, completed_at), `profiles` | date range, status, employee | Table + CSV | Low | **v1** |
| Performance review completion | Performance | `performance_reviews` (status), `performance_review_cycles` (title, dates) | cycle, status | Table (counts/status only — **no score**) | Medium (completion only; exclude score) | **v1** |
| Document upload activity | Documents/compliance | `documents` (category, created_at, uploader), `profiles` | date range, category | Table + CSV | Medium (counts/metadata only; never file contents/paths) | v1 or early deferred |
| Payroll-change activity | Payroll/compliance | `audit_logs` where action in `compensation.updated` / `compensation.self_updated` | date range, actor | Table + CSV | **High** — admin-only; metadata only, never salary/bank values | Deferred (fast-follow) |
| Compensation snapshot | Compensation | `employee_compensation` (salary, currency, pay_frequency, effective_date) + `profiles` | department | Table | **High** — exclude bank/tax/national-id/passport entirely | Deferred |
| Turnover *rate* (%) | Headcount/org | derived from starters/leavers + headcount denominator | period | Chart | Low | Deferred (needs period/denominator model) |
| Performance score distribution | Performance | `performance_reviews.score` | cycle | Chart | **High** — private HR data | Deferred / flag |
| Attendance / time-tracking | Attendance | — none — | — | — | — | **Needs new data — out of scope** |
| Diversity / EEO | Compliance | — none (no demographic fields) — | — | — | — | **Needs new data — out of scope** |
| Compensation-change history | Compensation | — needs versioned comp table; `payroll_change_requests` dropped — | — | — | — | **Needs new data — out of scope** |

**Out-of-scope rationale (needs new data):** KushHR has no time-tracking table (attendance), deliberately stores no demographic fields (diversity/EEO), and keeps only the current compensation row with one `effective_date` — `payroll_change_requests` was dropped (`docs/database-design.md:135-139`), so there is no comp-change history to report.

**Default date filters (2026-06-03).** The date controls are pre-filled so a report is meaningful on first Run without manual date entry: **headcount → as of today**; **starters / leavers → the previous calendar month** (1st–last day). Defaults live in `reportDefaults()` in `src/server/dal/reports.ts` and are used both as the input `defaultValue` and as the DAL fallback, so the surfaced value and the computed value never drift.

---

## 4. Architecture & access

### Route & page
- New segment `src/app/(app)/reports/`, structurally **cloned from `src/app/(app)/audit-logs/`** — the existing reference admin-only filtered surface. Do not invent a new page pattern.
- A report index plus per-report views (or one page with a report selector + `searchParams` filters), reusing the audit-logs filter-form + sanitiser structure.
- Nav entry already anticipated: `PROJECT_CONTEXT.md:14` lists "reports" in the admin workspace.

### Enforcement point (admin-only)
- `await requireRole(["admin"], { attemptedResource: "/reports" })` as the **first line of every report page** — mirrors `src/app/(app)/audit-logs/page.tsx:28`.
- **The export Route Handler is a separate authorization surface** — it needs its **own** `requireRole(["admin"])` call. The page gate does not cover Route Handlers (`docs/security-model.md:17-23`; Next route-handler docs `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
- Manager/employee hitting the route get the in-place access-denied render + `auth.access_denied` audit row via the existing boundary.

### Read-only DAL projection
- New `src/server/dal/reports.ts`, `server-only`, returning typed DTOs plus an `errors[]` array using `safeDalError` exactly like `dashboard.ts`.
- Functions take a **date range** and read existing owners. They **must not write** and **must not recompute owned numbers** — read `leave_requests.deducted_days`, never re-derive a day count.
- Use the admin client only where the dashboard DAL already does. **Never widen a projection** to include `bank_account_number / tax_id / national_id / passport_number` columns — mirror the RPC return-type discipline (`docs/security-model.md:54-62`).

### Export approach (CSV v1, PDF deferred) — **shipped (Phase 3, 2026-06-03)**
- CSV via `src/app/(app)/reports/export/route.ts` GET handler. The report key + filters travel as **query params** (`?report=…&from=…&status=…`), parsed identically to the page (`isReportKey`, `cleanDate`, `parseGrain`, `parseStatuses`, `reportDefaults`) — not a `[report]` dynamic segment — so the same URL exports the rows the page rendered.
  - Own `requireRole(["admin"], { attemptedResource: "/reports/export" })`, wrapped in try/catch: `AccessDeniedError` → plain `403` (route handlers aren't wrapped by `(app)/error.tsx`; the `auth.access_denied` audit is still written before the throw).
  - Fetch via the same `getReport` DAL (no second data path, no recompute).
  - Build the CSV **server-side, hand-rolled** (RFC-4180 escaping), strictly from `result.columns` + `result.rows` — **PII exclusion is structural**: the CSV is a subset of the DTO's columns, so there is no separate allowlist to drift. **No new CSV dependency.**
  - `report.exported` audit on success only (same metadata shape as `report.generated`).
  - Return a Web `Response` with `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="<key>-<YYYY-MM-DD>.csv"`.
  - `export const dynamic = 'force-dynamic'` — reads auth cookies, must not cache.
- A `route.ts` cannot co-exist with `page.js` at the same segment — hence the sibling `/export/` segment.
- Page surfaces an **Export CSV** link (built from the resolved filters) only once a non-empty report is generated.

### Visual theme — no departure (hard UI constraint)
- The reporting module must **feel identical to the rest of KushHR** — same theme, no new visual language. A user moving from `/audit-logs` or the dashboard to `/reports` should not notice a styling shift.
- Reuse existing primitives and tokens only: the shadcn components already in `src/components/ui/**`, the existing page shell / `PageHeader` / card / table / filter-form patterns from `src/app/(app)/audit-logs/` and the dashboard, the current spacing, typography, and color tokens. No new fonts, palettes, or bespoke layout.
- **Charts inherit the theme too.** Whatever charting lib is chosen at plan time must be themed to the existing color tokens (e.g. the established teal/primary accents) and match card/border/spacing conventions — not ship its own default look. If a lib cannot be cleanly themed to match, prefer a lighter option or a simple themed bar/table visual over a branded-looking widget.

### Charts (v1)
- Charts ship in v1 alongside tables (per §7 decision). No charting library exists in the codebase today — select one at plan time (lightweight, SSR-friendly, no heavy bundle, **themeable to existing tokens** per the visual-theme constraint above). Charts read the same DTO as the table; they are presentation only, never a separate data path.

### Audit logging (v1)
- Generating/exporting a report writes an audit row: new `report.generated` (on report **run**) and `report.exported` (on CSV download) action families, with `metadata` carrying the report key + applied filters. Admins are trusted-but-audited (`docs/security-model.md:134`). Both the page DAL path and the export Route Handler must emit their respective action.
- **Generation = explicit run, not passive render (decision b, 2026-06-03).** Selecting a report shows its controls only (no query, no audit); the report fetches data and writes `report.generated` only on the explicit **Run report** submit (`?generate=1`). Selector links never carry `generate=1`, so prefetch / refresh / back-forward don't create audit noise. This keeps the audit a signal of deliberate runs.

### Empty / error states
- Mandatory and explicit, per the `/audit-logs` precedent (`page.tsx:222-235`).

---

## 5. Sensitivity & Systems-Thinking flags (loudest)

1. **Column-level exclusion is the defence in depth, not just admin-only.** Every report projection and export Route Handler must **exclude `bank_account_number / tax_id / national_id / passport_number` entirely**, and **exclude performance `score` from v1**. Admin-only is the access gate; column-level exclusion guards against a misconfigured projection leaking sensitive values into a CSV.
2. **No second source of truth.** Reports read `leave_requests.deducted_days` and the other owned aggregates; they never recompute them with divergent logic (`docs/systems-thinking.md:14-38`).
3. **Export handler is a separate auth surface** — its own `requireRole`.
4. **High-sensitivity reports (payroll-change activity, compensation snapshot, score distribution) are deferred** — admin-only is the gate, but confirm whether aggregate compensation belongs in this module at all before building.

---

## 6. Options considered

- **A — Thin re-projection of existing dashboard DAL into a parameterised `/reports` surface. ✅ Chosen.** Reuses trusted aggregation, no new source of truth, fastest path to 8 reports, inherits the reviewed admin-only pattern. Trade-offs accepted: modest duplication of date-window math; CSV only (PDF deferred). Charts are **in** v1 (per §7 decision) — requires adding a charting dependency at plan time.
- **B — Generic "report builder" (pick table/columns/filters).** Rejected for v1: a dynamic query surface over admin-client (RLS-bypassing) queries is a broad leak surface and disproportionate to the ask ("simplicity first").
- **C — Fold reports into existing dashboards (the historical Phase-10 decision).** Rejected: no date-range control, no export, no drill-down — does not satisfy the backlog's "daily/monthly/yearly" + export requirement. This module supersedes that decision.

---

> **Build phasing (within v1).** "v1" below = the full 8-report scope, delivered across 4 phases (see `~/.claude/plans/reporting-module-plan.md`): **Phase 1** = skeleton + admin-only access + `report.generated` audit + 4 reports as **tables only**; **Phase 2** = remaining reports + grain toggle; **Phase 3** = CSV export; **Phase 4** = themed charts. So "charts in v1" and "CSV in v1" are true at the v1 level but land in later phases — they are intentionally absent from the Phase-1 surface.

## 7. Decisions (resolved with user, 2026-06-03)

1. **Leave usage** → **one report + grain toggle** (Daily / Monthly / Yearly switch on a single Leave Usage report), not three separate views.
2. **Compensation / payroll-change reports** → **fast-follow after v1.** Ship the 8 low-sensitivity reports first; add the high-sensitivity comp reports as a second pass (still admin-only, values excluded per the sensitivity flags).
3. **Charts** → **in v1.** A charting library is needed (none in the codebase today — pick one at plan time). Render charts alongside tables from the start, not tables-only.
4. **Export** → **CSV only for v1.** Hand-rolled server-side, no new dependency. PDF deferred.
5. **Turnover rate** → **raw starter/leaver counts only** (no computed %); report stays deferred regardless.
6. **Audit report generation** → **yes, log it.** Add `report.generated` / `report.exported` audit actions — admins are trusted-but-audited (`docs/security-model.md:134`). **Refinement (b, 2026-06-03):** log on the explicit **Run report** action, not on passive page render — see §4 "Audit logging".

---

## 8. Hand-off to plan mode

- Build `/reports` as a structural clone of `/audit-logs` (admin-only `requireRole`, `searchParams` filters, sanitisers, empty/error states) — do not invent a new page pattern.
- New `src/server/dal/reports.ts` is a **read-only projection** wrapping existing `dashboard.ts` / `employees.ts` aggregation with a date-range param; reads owned numbers (esp. `leave_requests.deducted_days`), never recomputes them.
- v1 = 8 reports (headcount, starters, leavers, leave usage, absence list, needs-attention, onboarding completion, review completion). Compensation / payroll-change / score-distribution deferred; attendance / diversity / comp-history out-of-scope (needs new data).
- **Systems-thinking:** column-level exclusion of bank/tax/national-id/passport + performance score in v1; export Route Handler is a separate auth surface with its own `requireRole`; no second source of truth.
- **No visual departure:** reuse existing shadcn primitives, page shell, and theme tokens — `/reports` must feel like `/audit-logs` and the dashboard. Any charting lib must be themed to existing tokens, not ship its own look.
- CSV export is hand-rolled server-side (mirror `bulkUploadPublicHolidays`); **charts are in v1** (add a charting lib at plan time); **PDF deferred**.
- **Audit logging in v1:** emit `report.generated` (view) and `report.exported` (CSV) audit rows with report key + filters in metadata, from both the page DAL path and the export Route Handler.

---

## Sources

External: [BambooHR — HR reporting](https://www.bamboohr.com/hr-reporting) · [BambooHR — headcount report](https://www.bamboohr.com/blog/growing-something-new-headcount-report-can-track) · [BambooHR — most useful reports](https://www.bamboohr.com/blog/most-useful-hr-reports-new-users) · [Zoho People — consolidated reports](https://www.zoho.com/blog/people/make-faster-more-effective-hr-decisions-with-the-all-new-consolidated-reports-in-zoho-people.html) · [Personio — system reports](https://support.personio.de/hc/en-us/articles/115005077129-System-reports) · [Personio — report metrics](https://support.personio.de/hc/en-us/articles/29595793178013) · [Gusto — view/download reports](https://support.gusto.com/article/101334493100000/View-and-download-reports) · [FirstHR — core HR reports](https://firsthr.app/blog/core-hr/hr-report) · [AIHR — types of HR reports](https://www.aihr.com/blog/types-of-hr-reports/)

Internal: `docs/database-design.md:72-206` · `docs/rls-policy-map.md:127-264` · `docs/security-model.md:17-62,134` · `docs/systems-thinking.md:14-38` · `src/server/dal/dashboard.ts:109-250` · `src/server/dal/employees.ts:11-21` · `src/lib/supabase/helpers.ts:65-93` · `src/app/(app)/audit-logs/page.tsx:27-318` · `src/components/leave/public-holidays-admin-panel.tsx:355-409` · `src/server/actions/leave.ts:1655` · `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:13-51` (Next 16.2.4) · `docs/pending-backlog.md:55` · `PROJECT_CONTEXT.md:14`
