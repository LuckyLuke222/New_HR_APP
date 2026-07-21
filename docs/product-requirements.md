# Product Requirements

KushHR is a single-company HRMS MVP.

## Roles

V1 roles:

- Admin
- Manager
- Employee

## Admin

Can:

- Manage all employees.
- Manage departments.
- Assign managers.
- View and edit payroll fields.
- Manage leave types and balances.
- Approve or reject leave.
- Upload and view documents.
- Assign onboarding tasks.
- Create review cycles, assign goals, and view all performance appraisals.
- View audit logs.
- Manage app settings.

## Manager

Can:

- View direct reports.
- Approve or reject direct-report leave requests.
- Assign onboarding tasks to direct reports.
- Set and update goals for direct reports.
- Complete appraisals for direct reports with a 1-5 score and written feedback.
- View limited employee profile data for direct reports.

Cannot:

- View bank details.
- View tax or national ID fields.
- Edit payroll fields.
- Access employees outside their reporting line.

## Employee

Can:

- View own profile.
- Edit limited personal details.
- View own leave balances.
- Request leave.
- Upload own documents.
- View documents shared with them.
- Complete onboarding tasks.
- View own goals and appraisal history.
- Add self-review comments and acknowledge completed appraisals.
- View own payroll summary.

Cannot:

- Edit salary or payroll fields directly.
- Approve own leave.
- View other employees' private data.
- Appraise themselves or edit manager-submitted scores.

## Payroll And Leave Recommendations

- Employees submit payroll/bank detail change requests.
- Admin approves and applies payroll/bank changes.
- Managers do not see salary, bank, tax, or national ID details in v1.
- Leave balances are manually managed in v1.
- Payslips are uploaded as documents with category `payslip`.

## Core Modules

- Authentication.
- RBAC.
- Employee directory.
- Department and manager hierarchy.
- Leave management.
- Documents.
- Onboarding tasks.
- Performance goals and appraisals.
- Payroll fields (admin-edits salary; employee self-edits own bank/tax/national-id/passport/nationality; manager sees own + direct-report summary).
- Audit logs.
- Admin dashboard.
- Manager dashboard.
- Employee dashboard.

## Core Pages

- `/login`
- `/dashboard`
- `/employees`
- `/employees/[id]`
- `/departments`
- `/leave`
- `/leave/requests`
- `/documents`
- `/onboarding`
- `/performance`
- `/performance/reviews`
- `/payroll`
- `/settings`
- `/audit-logs`

## Dashboards

Admin dashboard:

- Headcount.
- Pending leave.
- Onboarding progress.
- Recent audit events.

Manager dashboard:

- Direct reports.
- Pending approvals.
- Team leave calendar.
- Open performance reviews.

Employee dashboard:

- Own leave balance.
- Tasks.
- Documents.
- Active goals.
- Payroll summary.

## Performance Appraisal V1

Keep the first appraisal module simple and manager-led:

- Admins create review cycles such as annual, semiannual, or probation reviews.
- Admins and managers can create goals for employees in their scope.
- Goals have title, description, due date, status, and progress percentage.
- Managers appraise direct reports only.
- Appraisal score is an integer from 1 to 5.
- Manager appraisal includes strengths, improvement areas, and next steps.
- Employees can add a self-review comment before manager submission.
- Employees can acknowledge the completed appraisal.
- Admins can view all appraisal records for HR oversight.

Defer 360 feedback, peer reviews, calibration grids, AI summaries, automated reminders, and compensation decisions.

## UI Requirements

- Clean admin-dashboard style.
- shadcn/ui-style tables, forms, dialogs, dropdown menus, tabs, cards, badges, toasts, and confirmation dialogs.
- Loading states.
- Empty states.
- Error states.
- Access-denied screens.
- Responsive layout.

## Security Requirements

- Use RLS on every table.
- Employees can only access their own sensitive data.
- Managers can only access direct reports.
- Admins can access all company data.
- Payroll fields are admin-only for editing.
- Managers cannot see bank, tax, national ID, salary, or payroll fields.
- Documents must use private Supabase Storage buckets.
- File reads should use signed URLs or controlled server routes.
- All mutations must validate input with Zod.
- All Server Actions/API routes must verify auth and role server-side.
- Performance scores and review notes are private HR data: employees see only their own, managers see direct reports only, admins see all.

Audit logs are required for:

- Employee creation/update.
- Compensation update (admin and employee self-edit are logged distinctly).
- Leave approval/rejection.
- Document upload/delete.
- Performance goal changes and appraisal submission/acknowledgement.
- Role changes.

Never:

- Expose service-role keys in frontend code.
- Rely only on client-side role checks.
- Store secrets in the repository.
- Make buckets public.
- Skip RLS because this is an MVP.
