# KushHR — Local Setup (run your own instance)

This gets a **fresh clone** of KushHR running on your own machine with the demo accounts seeded, so you can explore the app. Everything runs locally in Docker — this is your own private copy with its own database and its own secrets. It is **not** connected to anyone else's data, and you do **not** need anyone else's `.env` or certificates.

> ⚠️ **Type the commands, or paste them from this raw `.md` file — not from a rendered chat/preview window.** Copying from rendered text can insert invisible "non-breaking spaces" that make the shell say `command not found: docker` even though Docker is installed.

---

## 1. Prerequisites

- **Docker Desktop** installed and **running** (steady whale icon).
- **git**, and the repo cloned. All commands below assume you start in the cloned project folder (e.g. `kushhr-main`).

Confirm Docker is on your PATH (prints a table, even if empty):

```
docker ps
```

If that says `command not found`, start Docker Desktop, open a **new** terminal, and try again.

---

## 2. Create your runtime secrets (`.env`)

The stack's secrets live in `infra/supabase/.env`, which is **gitignored** (not in the clone) — you create your own. **Never copy someone else's filled-in `.env`**: it contains live secrets (DB password, JWT secret, service-role key, OpenAI/Resend API keys) that should not be shared.

From `infra/supabase`:

```
cd infra/supabase
cp .env.example .env
```

The `.env.example` ships Supabase's **public demo** secrets — internally consistent and fine for a **local, throwaway** instance with no real data, so the stack will boot as-is.

**Recommended** (and required for anything beyond local throwaway): replace the demo secrets with your own freshly generated ones —

```
node rotate-secrets.mjs
```

This regenerates `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, the DB password, etc. (and keeps them mutually consistent). It backs up the old file to `.env.bak`.

> Email (password-reset, invite) is disabled locally unless you add your own `RESEND_API_KEY` to `.env`. That's fine — you'll log in with the seeded passwords below, not email.
>
> `APP_URL` is optional locally — leave it blank and reset/invite links fall back to the request host. In a **production** self-host deployment, set `APP_URL` to your public FQDN (e.g. `https://hr.example.com`) so those links are built from a configured origin rather than request headers.

---

## 3. Bring up the stack (with first-boot CA export)

Caddy terminates TLS with an internal CA that it **mints on its own first boot** — and the `web` container needs that CA file (`certs/caddy-root.crt`) to exist before it will start. So a fresh clone brings Caddy up first, exports the CA, then starts everything. Run these from `infra/supabase` — the bare `docker compose` commands auto-load both compose files because `.env` sets `COMPOSE_FILE` (copied from `.env.example`), so no `-f` flags are needed:

```
# 1. Start Caddy (and its dependencies); Caddy mints its internal CA
docker compose up -d caddy

# 2. Export Caddy's root CA to the path the web container mounts
mkdir -p certs
docker cp kushhr-caddy:/data/caddy/pki/authorities/local/root.crt certs/caddy-root.crt

# 3. Build and start the rest of the stack (waits for health)
docker compose up -d --build --wait
```

Check everything is up:

```
docker compose ps
```

You should see `supabase-db`, `supabase-auth`, `kushhr-web`, `kushhr-caddy`, etc. running.

---

## 4. Initialize the database (first boot only)

`docker compose up` starts Supabase's services but does **not** create KushHR's tables or demo users — that's a separate one-time step. Run this **from the repo root** (`cd ../..` out of `infra/supabase` — that's two levels up):

```
cd ../..
npm run db:bootstrap
```

This applies all schema migrations (in numeric order) plus the demo seed to the running `supabase-db` container, then prints the four demo accounts it created. It's **safe to run twice**: if the database is already initialized it prints `already initialized — skipping` and does nothing. If the stack isn't up it aborts with a clear message rather than touching anything.

> **It runs as `supabase_admin`, not `postgres`, for a reason.** On self-host the `postgres` role is not a superuser; some migrations create indexes on `auth.users` (owned by `supabase_auth_admin`), which only the `supabase_admin` superuser may do — running as `postgres` fails partway with `ERROR: must be owner of table users`. The script handles this for you.
>
> Under the hood it pipes `supabase/migrations/*.sql` + `supabase/seed.sql` through a single `psql … -v ON_ERROR_STOP=1`, so it **halts at the first real error** rather than leaving a half-applied DB.
>
> To apply *new* migrations to a DB that already has data (rather than re-bootstrapping a fresh one), use `npm run db:migrate` — it records applied migrations in a ledger and applies only the pending ones. See `docs/server-deploy.md` §6.

---

## 5. Verify it worked

```
docker exec -i supabase-db psql -U postgres -d postgres -c "select email from auth.users where email like '%@kushhr.dev';"
```

You should see four rows: `admin@kushhr.dev`, `manager@kushhr.dev`, `alice@kushhr.dev`, `bob@kushhr.dev`.

---

## 6. Log in

Open the app:

```
http://localhost:3100
```

Log in with any seeded account — **all passwords are `TestPass123!`**:

| Role | Email | What they see |
|---|---|---|
| Admin | `admin@kushhr.dev` | Everything (Departments, Reports, Audit Logs, Settings) |
| Manager | `manager@kushhr.dev` | Team views; approves Alice's leave |
| Employee | `alice@kushhr.dev` | Employee surface; reports to the manager |
| Employee | `bob@kushhr.dev` | Second employee |

> Tip: open one normal window as `admin@kushhr.dev` and one incognito window as `alice@kushhr.dev` to see the cross-role flows (e.g. Alice submits leave → Manager approves).

`http://localhost:3100` is the simplest entry point for your own instance — no hostname or certificate setup needed. (The `https://kushhr.internal` address is for LAN/VPN multi-user deployments and needs the CA installed in your browser; you don't need it here.)

---

## Troubleshooting

**`command not found: docker`** — Docker Desktop isn't running, or the command was pasted with hidden characters. Start Docker, open a fresh terminal, and type the command.

**`web` won't start / "missing file" abort** — `certs/caddy-root.crt` doesn't exist yet. Do Step 3 in order (Caddy up → `docker cp` export → full `up`). Don't skip the export.

**`ERROR: must be owner of table users`** — you ran a manual `psql` apply as `-U postgres`. Use `npm run db:bootstrap` (Step 4), which runs as `supabase_admin` for you. If the manual run left the DB half-applied, reset it (see the `already exists` block below) and re-run `npm run db:bootstrap`.

**`Database already initialized — skipping`** — `npm run db:bootstrap` found an existing schema and did nothing (this is the safe no-op, not an error). If you meant to start fresh, reset the DB (block below) and re-run.

**`ERROR: … already exists`** (during `npm run db:bootstrap`) — a previous attempt left the DB partially applied, and the skip-guard only checks whether `public.profiles` exists, so it doesn't catch a half-applied DB. Reset the empty database (no real data to lose) and redo Steps 3–4, from `infra/supabase`:

```
cd infra/supabase
docker compose down -v
docker compose up -d caddy
mkdir -p certs
docker cp kushhr-caddy:/data/caddy/pki/authorities/local/root.crt certs/caddy-root.crt
docker compose up -d --build --wait
cd ../..
npm run db:bootstrap
```

> `down -v` deletes the database **and** the Caddy data volume (so the CA is re-minted — that's why the export is repeated). Only safe because this is a throwaway local instance with no real data.

**Login says "invalid email and password"** — the seed didn't run; redo Steps 4–5 and confirm the four `@kushhr.dev` users exist.

**Password-reset emails don't arrive** — expected locally (no `RESEND_API_KEY`). Use the seeded passwords above.
