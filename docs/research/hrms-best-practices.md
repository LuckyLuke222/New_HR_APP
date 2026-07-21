# HRMS Best Practices

Date: 2026-04-27

KushHR is a lean, single-company HRMS inspired by BambooHR and HiBob/Bob. See `docs/product-requirements.md` for full role definitions and module scope.

## Reusable HRMS Patterns

- First screen after login is the operational dashboard, not a landing page.
- Employee directory supports search and filters.
- Employee profile uses tabs: Overview, Job, Compensation, Documents, Leave, Audit.
- Time off includes balances, request flow, approval queue, and who-is-out calendar.
- Payroll readiness shows missing fields, payroll-impacting changes, export status, and warnings.
- Documents include metadata, category, owner/subject employee, access state, and audit history.
- Dashboard reporting: headcount, starters/leavers, leave usage, incomplete profiles, payroll changes.
- Payslips stored as documents with category `payslip` — never generated as payroll artifacts in v1.
- Leave balances manually managed by admins in v1 — no accrual automation.

## Privacy Lessons

- Collect only data needed for HR, payroll readiness, compliance, and employee operations.
- Separate sensitive payroll/tax/bank/identity fields from general profile fields.
- Support correction workflows for employee data.
- Use retention-aware document categories.
- Preserve auditability for payroll and employment-tax records (IRS guidance: keep employment tax records at least 4 years after filing the fourth quarter for the year).

## Mistakes To Avoid

- Do not build a full payroll calculation engine in the MVP.
- Do not mix employee self-service data with HR-only data in one broad access policy.
- Do not expose private profile, compensation, tax, bank, or document data through generic profile DTOs.
- Do not add reports before access rules and DTO minimization are in place.
- Do not let managers access salary, bank, tax, or national ID fields in v1.

## References

- BambooHR: https://www.bamboohr.com/
- HiBob: https://www.hibob.com/features/
- IRS employment tax recordkeeping: https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-recordkeeping
