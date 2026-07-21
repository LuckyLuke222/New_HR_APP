# Performance Page Layout Research

## Codex update (2026-05-26) - Presentation simplification

### Problem observed

The existing `/performance` page rendered cycle administration, manager appraisal selection, an empty-or-active appraisal workspace, goals, edit forms, and appraisal history in one vertical flow. Admins and managers had to scan several unrelated tables before reaching their current task, and historical cycles increased that visual load.

### Public-product comparison

- [BambooHR Performance Management](https://www.bamboohr.com/platform/performance-management/) presents goals, feedback, flexible review cycles, and reporting as separate activities, emphasizing straightforward tracking and easy-to-launch cycles.
- [HiBob Talent Management](https://www.hibob.com/talent/performance-management/) similarly distinguishes structured performance review cycles, goals, one-to-ones, and decision support rather than presenting one undifferentiated work surface.

These sources describe product capabilities rather than exposing full authenticated page structures. The useful inference for KushHR is therefore modest: organize the existing workflow by user task and keep each task surface focused, without changing the underlying review lifecycle.

### Decision

KushHR now uses role-aware sections on `/performance`:

| Role | Sections | Default |
|---|---|---|
| Admin | Cycles, Appraisals, Goals, Reviews | Cycles |
| Manager | Appraisals, Goals, Reviews | Appraisals |
| Employee | My goals, My appraisals | My goals |

- Admin `Cycles` separates current draft/active cycles from collapsed past/closed cycles.
- `Appraisals` preserves the existing cycle-first queue and side-by-side employee context / manager appraisal workspace; the workspace only renders after employee selection.
- `Goals` and `Reviews` retain their existing components and behavior, presented only when that task is selected.
- `/performance?view=...` selects a section; existing `cycleId`, `goalId`, `reviewCycleId`, and `reviewEmployeeId` links still infer the correct section for backward compatibility.

### Systems Thinking

- **State owner:** This is presentation state only. Cycles, goals, reviews, deadline-lock state, and business timezone remain owned by their existing database/settings records.
- **Feedback:** Existing form responses, lock warnings and audit events remain unchanged. Navigation links now land on the relevant visible section so existing feedback is not hidden by the new default tabs.
- **Blast radius:** Performance composition, dashboard/performance navigation and focused UI tests only. No Server Action, schema, RLS, trigger, or audit contract change.
