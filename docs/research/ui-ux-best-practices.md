# UI/UX Best Practices

Date: 2026-04-27

KushHR should feel like an operational HR console. See `docs/product-requirements.md` for core pages and dashboard variants.

## UX Direction

- First screen after login is the dashboard.
- Stable left navigation: Dashboard, Employees, Departments, Leave, Documents, Onboarding, Payroll, Settings, Audit Logs.
- Prioritize tables, filters, approval queues, status badges, empty states, and clear detail pages.
- Moderate visual density so HR teams can scan and repeat workflows efficiently.
- No oversized hero sections, marketing blocks, or feature-explainer text inside the app.

## UI Conventions

- Compact cards for individual metrics and framed tools only.
- Restrained colors and modest border radius.
- Icons for navigation and tool buttons where familiar.
- Tabs for employee profile sections.
- Forms with labels, helper text, and accessible error states.
- Clear empty states before live data exists — no fake operational counts.

## Responsive Requirements

- Desktop: left sidebar navigation.
- Mobile: discoverable navigation (hamburger or bottom nav).
- Text fits inside containers at all widths.
- Fixed-format elements have stable dimensions to avoid layout shift.

## Accessibility Basics

- Semantic headings.
- Named navigation landmarks.
- Visible focus states.
- Form labels and descriptive error messages.
- `aria-current` for active navigation item.
- No color-only state communication.

## HRMS-Specific Notes

- Role-dependent visibility is a UX convenience — not a security boundary.
- Destructive actions require confirmation dialogs.
- Loading, empty, and error states documented before connecting live data.
- Payroll and sensitive-document areas are quiet, explicit, and audit-friendly.

## Component Expectations

Tables, forms, dialogs, dropdown menus, tabs, cards, badges, toasts, and confirmation dialogs — all via shadcn/ui conventions.
