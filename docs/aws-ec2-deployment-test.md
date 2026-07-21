# KushHR — Test-deploy on an AWS EC2 (throwaway)

**Purpose:** stand up KushHR on a single AWS EC2 instance to *see it run in AWS* and rehearse the
deploy. This is a **disposable test**, not production — see §9 for what it deliberately does **not**
cover. Canonical deploy steps live in [server-deploy.md](server-deploy.md); this file only adds the
AWS-specific bits (instance, ports, teardown).

Scope: one operator, one box, test/dummy data only, torn down after. Do **not** point real staff PII
at this — Tier A + Tier P P0 gaps (`docs/checks/audit-remediation-plan.md`) are still open.

---

## 0. The free-tier catch (read first)

**AWS "free tier" (`t2.micro` / `t3.micro`) = 1 GB RAM. That will not run KushHR.** The stack is the
full self-hosted Supabase platform (~13 containers: Postgres + 2 BEAM services + Deno + Node + Studio
+ Kong…) plus the web app + Caddy. [aws-sizing.md](aws-sizing.md) puts the floor at **8 GB**; 1 GB
OOM-kills on boot.

Realistic test options:

| Option | Instance | RAM | Cost | Verdict |
|---|---|---|---|---|
| **Recommended** | `t4g.large` (ARM) or `t3.large` (x86) | 8 GB | ~$0.07/hr → **a few hours ≈ well under $1** | Matches prod sizing; spin up, test, terminate |
| Cheapest that boots | `t4g.medium` | 4 GB | ~$0.03/hr | Boots but tight — risks OOM under load; test-only |
| Free tier | `t3.micro` | 1 GB | free | **Won't run — don't** |

> "Free" isn't viable here, but a couple of hours on a `t4g.large` costs pennies and is torn down
> after (§8). Use ARM (`t4g`) — the images are multi-arch and it's cheaper. Budget/billing-alert it
> so a forgotten instance doesn't run for weeks.

### 0a. Free-tier long-shot (`t3.micro`, 1 GB) — if you insist on trying

It will be **slow and may still OOM**, but you *can* attempt it. Two levers, in order of impact:

**1. Add swap (the big one — do this first).** Lets the kernel over-commit instead of OOM-killing on
boot. On a 1 GB box give it plenty (you have the 50 GB disk):

```bash
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab      # persist across reboot
free -h                                                          # confirm 8G swap
```
Expect heavy disk thrashing — fine for a click-through, unusable for real load.

**2. Trim containers you don't need for a bare test.** This compose has **no** analytics/logflare
(the usual memory hog) — already lean. You can still drop:

| Service | Safe to drop for a test? |
|---|---|
| `studio` | **Yes** — it's just the admin web UI; the app never calls it |
| `imgproxy` | Likely — only image transforms use it |
| `functions` | Likely — only if the app calls Supabase Edge Functions (KushHR doesn't lean on them) |
| `realtime` | Likely — KushHR uses the browser client only for auth, not live subscriptions |
| `db`, `kong`, `auth`, `rest`, `storage` | **No** — these are the app's critical path |

To drop one, comment its block out of `infra/supabase/docker-compose.yml` (or scale it to 0:
`docker compose up -d --scale studio=0`), then boot per §4 and confirm login + one flow still work.
If a dropped service turns out to be needed, bring it back.

> Honest expectation: with 8 GB swap + studio/imgproxy/functions/realtime dropped, a 1 GB box has a
> real chance of *booting* enough to log in and click around — but it'll be sluggish and any real
> concurrency may still tip it over. If it won't stay up, that's the RAM, not your setup; jump to
> `t4g.large` (pennies/hour). Everything else in this runbook is identical.

**3. If the build still OOMs** (`heap out of memory` / `SIGABRT` during `next build`). The killer is the
in-build **TypeScript type-check**. Two more levers (test-box only):
- In the repo root `Dockerfile`, add `ENV NODE_OPTIONS=--max-old-space-size=3072` on its own line just
  **before** `RUN npm run build`.
- Skip the in-build type-check (types already pass in the repo) — in `next.config.ts` add
  `typescript: { ignoreBuildErrors: true },`. This was what actually got the 2026-07-16 test through 1 GB.
- Stop the non-essential containers (`docker stop supabase-studio supabase-imgproxy supabase-edge-functions realtime-dev.supabase-realtime supabase-meta`) **during** the build to free RAM, then `docker start` them after.

> ⚠️ These are 1 GB workarounds. **Never ship `ignoreBuildErrors` to a real build** — production
> type-checks in CI (P0-5). On an 8 GB box none of this is needed; the build just runs.

---

## 1. Launch the EC2

1. **AMI:** Ubuntu 22.04/24.04 LTS (or Amazon Linux 2023), **arm64** if using `t4g`.
2. **Instance type:** `t4g.large` (see §0).
3. **Storage:** **50 GB gp3** (default 8 GB is nowhere near enough — Postgres + storage + Docker
   images).
4. **Key pair:** create/select one so you can SSH.
5. **Security group — lock it to YOU (this is your only perimeter for a test):**
   - SSH `22` — **your IP only** (`My IP` in the console).
   - App `3100` **and** Kong `8000` — **your IP only** (the fallback ports you'll browse to).
   - *(Optional)* `443` your-IP-only if you do the Caddy/TLS path in §5B.
   - **Do not** open anything to `0.0.0.0/0`. Signup is still enabled by default (finding A1), so an
     open port = anyone can self-provision. The security group is what keeps this test private.

---

## 2. Install Docker + Compose (on the instance)

```bash
ssh -i <key.pem> ubuntu@<ec2-public-dns>

# Docker Engine + compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git nodejs npm
sudo usermod -aG docker $USER && newgrp docker      # run docker without sudo
docker --version && docker compose version           # sanity
```
*(Amazon Linux 2023: `sudo dnf install -y docker git nodejs npm && sudo systemctl enable --now docker`,
then install the compose plugin.)*

---

## 3. Clone + secrets

```bash
git clone <fintrellis/kushhr> ~/kushhr
cd ~/kushhr/infra/supabase

cp .env.example .env            # compose template (includes COMPOSE_FILE) — NOT the root app .env.example
node rotate-secrets.mjs         # generate a fresh consistent JWT/ANON/SERVICE_ROLE/DB-password set
```

**Use the EC2 public DNS, not the raw IP** — this matters (see the box). Point *every* URL var at it and
disable signup. Plain `http` is acceptable for a throwaway test *because the SG restricts access to your IP*:

```bash
DNS=<ec2-public-dns>            # e.g. ec2-13-53-62-250.eu-north-1.compute.amazonaws.com
sed -i "s|^SITE_URL=.*|SITE_URL=http://$DNS:3100|" .env
sed -i "s|^APP_URL=.*|APP_URL=http://$DNS:3100|" .env
sed -i "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=http://$DNS:3100/reset-password|" .env
sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=http://$DNS:8000|" .env
sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://$DNS:8000|" .env
sed -i "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=http://$DNS:8000|" .env
sed -i "s|^DISABLE_SIGNUP=.*|DISABLE_SIGNUP=true|" .env
echo "PUBLIC_HOST=$DNS" >> .env
```

> **Why DNS and not the raw IP (learned the hard way, 2026-07-16):** the app is built for ONE origin
> behind Caddy (`kushhr.internal`) and bakes `NEXT_PUBLIC_SUPABASE_URL` into the browser bundle at build
> time. The **browser** logs in fine against a public IP, but the **Next server inside the container**
> then reaches that same URL to validate the session — and AWS won't route an instance to its own public
> IP (SG blocks it too) → `ConnectTimeout` → login bounces back to the login page. Using a **hostname**
> lets `extra_hosts` (below) redirect the *container's* requests to Kong via the Docker host, while the
> *browser* still resolves the DNS to the public IP.

**Replace `docker-compose.app.yml` with a test-only version.** The stock file mounts a Caddy internal-CA
cert (absent here → `web` won't start) and bakes `https://kushhr.internal`. This version drops Caddy/TLS,
adds `extra_hosts`, and reads the URL from `.env`:

```bash
cat > ~/kushhr/infra/supabase/docker-compose.app.yml <<'YAML'
# TEST-ONLY: throwaway public-DNS HTTP deploy (no Caddy/TLS). Not for real use.
services:
  web:
    container_name: kushhr-web
    build:
      context: ../..
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${ANON_KEY}
    restart: unless-stopped
    depends_on:
      kong:
        condition: service_healthy
    ports:
      - "3100:3100"
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY}
      APP_URL: ${APP_URL:-}
    extra_hosts:
      - "${PUBLIC_HOST}:host-gateway"
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3100/login || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 40s
YAML
```

> For a *nicer* test with real HTTPS on a real hostname/FQDN, use the Caddy path in
> [server-deploy.md](server-deploy.md) §3–4 instead — that's the app's intended design and needs **none**
> of these workarounds (no IP hacks, no `extra_hosts`, no cert juggling).

---

## 4. Boot the stack

```bash
cd ~/kushhr/infra/supabase
docker compose up -d --build          # COMPOSE_FILE brings up base + app in one command
docker compose ps                     # db/kong/auth/rest/storage/web should reach healthy
```

**Wait for Storage to create its schema before bootstrapping.** On a fresh volume the Storage service
races `db:bootstrap`, and migration `0015` fails with *"relation storage.buckets does not exist"*. Poll
until it exists:

```bash
until docker exec -i supabase-db psql -U postgres -d postgres -tAc "select to_regclass('storage.buckets')" | grep -q storage.buckets; do echo "waiting for storage schema..."; sleep 3; done; echo "STORAGE READY"
```
> If it never appears, `docker compose restart storage` and re-poll — the storage service can miss its
> migration on a cold first boot; a restart runs it.

Then initialize the DB (fresh-only; migrations + demo seed):
```bash
cd ~/kushhr && npm run db:bootstrap
```

`db:bootstrap` seeds 4 demo accounts (password `TestPass123!`: `admin@kushhr.dev`, `manager@kushhr.dev`,
`alice@kushhr.dev`, `bob@kushhr.dev`) — fine for a test. For a clean DB you'd apply migrations without
`seed.sql` (see server-deploy.md §3 note).

---

## 5. Smoke it

1. Browse to `http://<ec2-public-dns>:3100` (the **DNS**, not the IP).
2. Log in as `admin@kushhr.dev` / `TestPass123!`.
3. Load `/dashboard`; walk one core flow (e.g. open Employees → a person → Leave).

**If login succeeds but bounces back to `/login`:** the container can't reach Supabase server-side. Run
`docker logs kushhr-web --tail 20` — a `ConnectTimeout` to the public IP means you used the raw IP
instead of the DNS, or `extra_hosts`/`PUBLIC_HOST` is missing (see §3). Fix, then
`docker compose up -d --build web`. **If login errors immediately:** check the browser can reach
`http://<dns>:8000/auth/v1/health` (SG must allow `:8000` from your IP).

---

## 6. (Optional) test the update loop

Mirror the prod loop so you know it works:

```bash
cd ~/kushhr && git pull
npm run db:migrate -- --list          # preview pending migrations (applies nothing)
npm run db:migrate                    # apply pending, each in its own txn
cd infra/supabase && docker compose up -d --build web
```

On a DB bootstrapped before the migration ledger existed, run `npm run db:migrate -- --backfill`
**once** first (records current migrations as applied). See server-deploy.md §6.

---

## 7. Harden even the test (2 minutes)

Cheap habits worth forming before any wider test:

- After creating a real admin, set `DISABLE_SIGNUP=true` in `infra/supabase/.env` and
  `docker compose up -d web` — closes finding A1's open front door.
- Keep the security group your-IP-only. Never widen to `0.0.0.0/0` on a test box.
- Don't run `infra/supabase/run.sh secrets` — it prints passwords to the terminal (leak into
  scrollback/logs).

---

## 7a. Pause overnight & resume (keep the box — no rebuild)

For a multi-day test, pause safely without losing the working state. **The golden rule: leave the EC2
instance _running_ — do NOT Stop/Terminate it.** Stop/Start assigns a **new public IP + DNS**, and the
app bakes the DNS into the browser bundle at build time (`NEXT_PUBLIC_SUPABASE_URL`), so a changed DNS
breaks login and forces a full **rebuild**. Keeping the instance running preserves the DNS → resume is
trivial.

**Pause (extra-safe, end of day):**
1. Stop the app (SSH): `cd ~/kushhr/infra/supabase && docker compose down` — containers stop; data
   stays in the named volumes (`supabase_db-data`, `supabase_storage-data`). Never add `-v`.
2. Close the app to the internet (AWS Console → EC2 → the instance's security group → **Edit inbound
   rules**): delete the **3100** and **8000** rules, keep **SSH 22**. Overnight the box is reachable
   only via SSH (key-only, your IP).

**Resume (next day, ~1–2 min, no rebuild):**
1. Re-open the ports: security group → **Edit inbound rules** → add **Custom TCP 3100** and **8000**,
   Source **My IP** (add the colleague's IP as extra rules on both once known).
2. Bring the stack up (SSH): `cd ~/kushhr/infra/supabase && docker compose up -d` — same DNS, no
   rebuild. (Storage's first-boot schema already exists in the volume, so the §5 race won't recur.)
3. Test at the baked DNS: `http://<ec2-public-dns>:3100` (this instance:
   `http://ec2-13-53-62-250.eu-north-1.compute.amazonaws.com:3100`), admin `admin@kushhr.dev` /
   `TestPass123!`.

> If Studio (or another non-essential service) is slow to become healthy on the 1 GB box and aborts
> `up`, just re-run `docker compose up -d` once it warms up — the app doesn't depend on Studio.

---

## 8. Teardown (stop the meter)

```bash
docker compose down                   # stop containers (data stays in named volumes on the box)
```
Then in the AWS console:
- **Terminate** the instance (not just Stop) when done — Stop still bills the 50 GB EBS volume.
- Delete the **EBS volume** if it wasn't set to delete-on-terminate.
- Delete the security group / key pair if you won't reuse them.
- Confirm in **Billing → Cost Explorer** the next day that nothing lingers.

> There is **no backup** in this flow — teardown destroys all data. That's intentional for a test.
> Real deploys must do the off-host backup work (Tier P **P0-4**) first.

---

## 9. What this test does NOT prove (prod gaps)

Running on EC2 shows the app *works in AWS*. It does **not** make it production-ready. Before real
staff data, the deployment method is irrelevant — these are the blockers (`audit-remediation-plan.md`):

- **Tier A** correctness/security BLOCKERs (leave ledger, refund, role write, perf guards) — open.
- **Tier P P0:** signup-off + preflight, atomic audit (B1), **off-host backups + fail-closed
  restore**, CI that actually builds + runs migrations/RLS/E2E, telemetry/alerting.
- **ECR vs build-on-box:** this test builds on the box. Prod should pull a prebuilt image from ECR
  (P0-5 / [aws-ecr-deployment-plan.md](aws-ecr-deployment-plan.md)) so CI proves the build before
  it's live — but that's a *hardening* upgrade, not a blocker for this throwaway test.

**Bottom line:** great for a demo / sizing sanity-check / deploy rehearsal. Not a path to production
on its own.
