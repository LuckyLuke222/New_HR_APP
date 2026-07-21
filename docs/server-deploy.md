# KushHR — Server Deploy Runbook

How to stand up KushHR on a shared company server and keep it running. Companion to
`LOCAL_SETUP.md` (which covers a throwaway laptop instance). **Status: draft** — the TLS/ingress
path branches on a decision still owed by IT (internal-only vs internet-facing); both branches are
written below so the runbook is ready once that's settled.

## 0. The one rule: deploy, don't develop-on-server

The repo is the source of truth. The server is a **disposable deploy target** rebuilt from the
repo + its gitignored secrets/backups. **Never hand-edit code on the server.** Every change goes:
local plan → review → push → `git pull` on the server → rebuild → smoke. If the server burns down,
you rebuild it from the repo in minutes; if you edit it in place, you can't.

## 1. Prerequisites (gather before first deploy)

- **Host:** Linux + Docker + Docker Compose; disk for the Postgres + storage volumes; the ports the
  stack publishes (443 via Caddy; `:3100`/`:8000` are publish-fallbacks to drop when hardening).
- **FQDN + exposure decision** (drives §4): internal-only (LAN/VPN) or internet-facing. **[OWED by IT]**
- **One named operator** who runs deploys + owns backups.
- **Data-hosting sign-off** — real employee PII lands here once users log in.

## 2. First-time server setup

```bash
# 1. clone to a stable path
git clone <fintrellis/kushhr> /opt/kushhr

# 2. runtime secrets (NOT the demo keys — generate your own)
#    Run from infra/supabase/ — that's where the compose template + rotate-secrets.mjs live.
cd /opt/kushhr/infra/supabase
cp .env.example .env                    # the compose template (includes COMPOSE_FILE) — NOT the root app-level .env.example
node rotate-secrets.mjs                 # rewrites ./.env in place (.env.bak backup); regenerates JWT/ANON/SERVICE_ROLE/DB-password, consistent set

# 3. point the app at the server FQDN — set ALL THREE to the same host:
#    infra/supabase/.env :  APP_URL=https://hr.<company>   (reset/invite link origin)
#                           SITE_URL=https://hr.<company>  (GoTrue redirect allowlist)
#                           ADDITIONAL_REDIRECT_URLS=https://hr.<company>/reset-password
#    and NEXT_PUBLIC_SUPABASE_URL to the public Supabase/Kong URL the browser will hit.
```

> The **web container reads `infra/supabase/.env`** (not the root `.env.local`, which is host-`npm
> run dev` only). `APP_URL` must equal `SITE_URL` so GoTrue accepts the generated reset links.

## 3. First boot

```bash
cd /opt/kushhr/infra/supabase
# CA export order is load-bearing for the internal-CA path (see backup/README.md §First-boot CA export):
docker compose up -d caddy
mkdir -p certs
docker cp kushhr-caddy:/data/caddy/pki/authorities/local/root.crt certs/caddy-root.crt
docker compose up -d --build web
# initialize the database (fresh-only; safe no-op on an already-populated DB):
cd /opt/kushhr && npm run db:bootstrap
```

> **DECISION — demo seed vs clean start.** `db:bootstrap` applies migrations **and the demo seed**
> (4 demo accounts + sample data). For a real pilot you probably want a **clean** DB with one real
> admin instead of demo PII. Until a "migrations-only, no seed" bootstrap flag exists, either accept
> the demo accounts for the pilot and delete them later, or apply migrations without `seed.sql`
> manually. **[decide before inviting users]**

Verify: browse to the FQDN, log in, load `/dashboard`.

## 4. TLS / ingress — pick the branch IT confirms

### A. Internal-only (LAN/VPN) — Caddy internal CA
- Caddy already mints an internal root CA. Distribute `certs/caddy-root.crt` to **every client
  machine's trust store** (macOS keychain / Firefox NSS / Windows cert store), else browsers warn.
- FQDN resolves via internal DNS, or `/etc/hosts` on each client.
- Lowest exposure; no public attack surface; least extra work over the laptop setup.

### B. Internet-facing — Let's Encrypt
- Real domain + public DNS A record → the server.
- Switch the Caddyfile site to the real domain so Caddy auto-provisions a Let's Encrypt cert; remove
  the `extra_hosts` host-gateway block and the internal-CA mount (real DNS resolves both sides).
- **Hardening pass required before real users:** drop the `:3100`/`:8000` public publishes
  (proxy-only ingress), re-check the Caddy security headers, and review the deferred items in
  `docs/pending-backlog.md` / `docs/checks/prefork-audit.md`. Do NOT expose publicly without this.

## 5. Onboard pilot users (no email dependency)

Admin → create the employee → **Generate password reset** → securely share the returned link 1:1.
This works **today** with no Resend/Gmail. (Self-service email onboarding via the Gmail integration
is a later workstream, not on the pilot's critical path.)

## 6. Deploy an update (the repeatable loop)

```bash
# locally: change → review battery → push to fintrellis/kushhr
# on the server:
cd /opt/kushhr && git pull

# if this pull added DB migrations, apply them to the LIVE DB (incremental, safe):
cd infra/supabase/backup && ./backup.sh && cd /opt/kushhr   # ALWAYS back up first
npm run db:migrate -- --list        # preview what will apply (dry-run, applies nothing)
npm run db:migrate                  # apply only the pending migrations, each in its own txn

# rebuild + restart the app:
cd infra/supabase
docker compose up -d --build web
# smoke: login + dashboard + one core workflow
```

> **First-time only — record the existing schema.** On a DB that was bootstrapped *before* the ledger
> existed (every current instance), run `npm run db:migrate -- --backfill` **once** to record the
> current migrations as applied. After that, plain `npm run db:migrate` applies only new ones.
>
> `db:migrate` keeps a ledger (`kushhr_migrations.applied`) and applies only **pending** migrations,
> each in its own transaction (a failure rolls back and names the file; the ledger is the source of
> truth). It never re-runs or wipes, and never re-seeds. Editing an already-applied migration is
> rejected (append-only) — add a new migration instead. (`db:bootstrap` remains the fresh-only
> first-boot path with the demo seed.)

## 7. Backups (verified restorable — see `infra/supabase/backup/`)

- **Schedule:** `backup.sh` daily (cron line in `backup/README.md`).
- **Verify periodically:** `./restore.sh <TS>` restores into a throwaway scratch DB and prints row
  counts — live data untouched. (Dry-run verified 2026-06-17: scratch counts matched live exactly.)
- **`backup.key`** decrypts every archive — **store it off-machine** (password manager / sealed
  store). Losing it = backups unrecoverable. Off-site upload of the archives is a deferred TODO.

## 8. Rollback

- **Code:** `git checkout <previous commit/tag>` → rebuild `web`.
- **Data:** onto a fresh/empty stack, `./restore.sh <TS> --into-live` for the DB + untar the storage
  archive into `supabase_storage-data` (see `backup/README.md` §Restore runbook). `--into-live` is
  destructive — only against an intentionally-empty target.
