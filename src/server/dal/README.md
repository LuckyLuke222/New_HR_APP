# Data Access Layer

All server-side data reads should go through this layer once Phase 1 begins.

Rules:

- Import `server-only` in modules that touch Supabase server clients.
- Authenticate and authorize before reading sensitive data.
- Return minimal DTOs to route components.
- Do not pass raw Supabase rows with sensitive fields into Client Components.
