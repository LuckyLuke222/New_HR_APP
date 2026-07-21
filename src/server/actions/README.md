# Server Actions

Server Actions are public endpoints. Every action must:

- Authenticate the current user.
- Authorize role and record scope from database-backed state.
- Validate input with Zod inside the action.
- Rely on Supabase RLS as the final database authorization layer.
- Return safe, typed errors.
