# Architecture

## Application Stack

- Next.js 16 App Router, TypeScript, `src/` layout.
- Route groups: `(auth)` for login/signup, `(app)` for all authenticated pages.
- Supabase Auth (cookie-based SSR via `@supabase/ssr`).
- Next 16 `src/proxy.ts` refreshes auth cookies on every request.
- Supabase Postgres + RLS for data; Supabase Storage (private buckets) for documents.

## Client Separation

| Utility | Location | Purpose |
|---------|----------|---------|
| Browser client | `src/lib/supabase/client.ts` | Client components only |
| Server client | `src/lib/supabase/server.ts` | Server Components, Server Actions, Route Handlers |
| Proxy client | `src/lib/supabase/proxy.ts` | Session refresh in `src/proxy.ts` |

Service-role key: backend-only module only. Never import from client code.

## Data Flow Rules

- Server Components read data via server-side utilities or a Data Access Layer — never raw client.
- Server Actions and Route Handlers are public API endpoints: authenticate → authorize (from DB) → validate (Zod) → mutate → return safe error.
- Client Components receive minimal DTOs, not raw sensitive database rows.
- Authorization comes from `profiles` in DB; JWT `app_metadata.role` is a fast read cache only.

## Shared Code Layout

```
src/
  app/
    (auth)/        login, signup
    (app)/         all protected pages
  components/      shared UI components
  lib/
    supabase/      browser / server / proxy clients
  server/
    authz/         getSessionUser(), requireRole()
  types/           shared TypeScript types
```

## Overbuild Guardrails

- No payroll engine.
- No separate HR/payroll roles in v1 — payroll access is an admin capability.
- No automated leave accruals.
- No multi-company UX.
- No analytics beyond the dashboards and basic reporting defined in `docs/phase-plan.md`.

## Assumptions

- Single-company in v1; tables designed so company scoping can be added later without major rewrites.
- Admins are trusted operators, but sensitive changes still require audit logs.
- Managers only manage active direct reports.
- Payroll and bank changes use request-and-approval, not direct employee edits.

## Project Risks

- RLS policy mistakes could expose employee, payroll, bank, tax, or document data.
- Server Actions without server-side authz bypass UI restrictions.
- Storage bucket or signed URL mistakes could expose private documents.
- Audit logging added late may miss important events.
- Residual: moderate PostCSS advisory through `next@16.2.4` — tracked upstream, not force-fixed.

See `docs/product-requirements.md` for roles, modules, pages, and dashboards. See `docs/systems-thinking.md` for state ownership, feedback, and blast-radius rules.
