# KushHR — Docker Compose consolidation + AWS ECR/EC2 deployment plan

## Summary

- **The app works today.** Everything below is about *how deployment is run*, not whether the app functions. No functionality is at risk.
- **Two compose files are kept separate on purpose.** The Supabase base file stays close to upstream so Supabase can be updated cleanly; KushHR's own services (web app + Caddy proxy) live in a separate overlay. Merging them would make every Supabase update a manual, error-prone re-merge.
- **The server already runs a single command.** A one-line `COMPOSE_FILE` setting lets the stack come up with a bare `docker compose up -d` (no `-f` flags) while keeping the files physically separate. Best of both.
- **"One image on ECR" ≠ "one file".** ECR holds *our* app image (one build artifact). Supabase remains ~13 separate upstream images that Compose pulls automatically. This is normal and correct — that count doesn't change no matter how many YAML files we have.
- **For AWS the real change** is switching the app service from *building on the server* to *pulling a prebuilt image from ECR*. That's a dedicated prod compose variant, wired through the same `COMPOSE_FILE` mechanism.
- **Two things we deliberately avoid:** (a) physically merging everything into the Supabase base file, and (b) swapping Supabase's Postgres for AWS RDS — both are known to cause upgrade breakage.

---

## Background — why two files, and how the single command works

**On the two docker-compose files.** They are kept separate intentionally. The Supabase file is the vendor's standard stack; keeping it untouched means we can pull Supabase updates cleanly without them clashing with our own app configuration. KushHR's app + reverse proxy live in a second file layered on top.

**On the "single command".** Docker Compose has a built-in `COMPOSE_FILE` setting. It is set once so the server brings the whole stack up with a plain `docker compose up -d` — no `-f` flags — while the files stay separate underneath. This gives the simple command without losing the clean Supabase-update path.

**On ECR.** "One image on ECR" and "one compose file" are different things. ECR holds **our app image** (the one artifact we build and version). Supabase is ~13 separate standard images that Compose pulls automatically — we do not push those to our own ECR. So the stack is one command, but it is not a single image, and that is expected.

---

## Current state

| File | Role | Contents |
|---|---|---|
| `infra/supabase/docker-compose.yml` | Upstream Supabase base (kept pristine) | ~13 pinned Supabase services (Postgres, Auth, Storage, Kong, Realtime, …) |
| `infra/supabase/docker-compose.app.yml` | KushHR overlay | `web` (Next app, **built** from source) + `caddy` (TLS reverse proxy) |

`COMPOSE_FILE` in `infra/supabase/.env` names both files, so the stack comes up with a single command:
```bash
cd infra/supabase
docker compose up -d --build --wait
```
The `web` service currently **builds the app image on the machine** (`build:` block). That is fine for local/dev but is what we replace for the AWS model.

---

## Single-command setup (in place)

`infra/supabase/.env` sets:
```env
COMPOSE_FILE=docker-compose.yml:docker-compose.app.yml
```
With this, every command is bare — no `-f` flags:
```bash
docker compose up -d --build --wait
docker compose down
docker compose logs -f
docker compose ps
```
No behaviour change; it purely removes the repetitive flags. The same value is mirrored in `.env.example`, and the README commands match.

---

## AWS ECR/EC2 production model (the real deployment work)

**Goal:** build the app image once in CI, push it to ECR, and have EC2 *pull* it (not build it) and start the stack with one command.

### 1. Add a prod overlay that pulls from ECR instead of building

Create `infra/supabase/docker-compose.ecr.yml` — identical to the app overlay except the `web` service references an ECR image instead of a local build:

```yaml
services:
  web:
    image: <account>.dkr.ecr.<region>.amazonaws.com/kushhr-web:${APP_IMAGE_TAG}
    # (no `build:` block — image is prebuilt in CI)
    # all other settings (env, ports, healthcheck, extra_hosts, volumes) unchanged
```

Local dev keeps using `docker-compose.app.yml` (builds from source); production uses `docker-compose.ecr.yml` (pulls from ECR). Selected per environment via `COMPOSE_FILE`:

- Dev: `COMPOSE_FILE=docker-compose.yml:docker-compose.app.yml`
- Prod (EC2): `COMPOSE_FILE=docker-compose.yml:docker-compose.ecr.yml`

The Supabase base file is shared, untouched, and still updates independently in both.

### 2. CI builds and pushes the app image

On each release (GitHub Actions or equivalent):
1. `docker build` the Next app image (the existing `Dockerfile`).
2. Tag it (e.g. git SHA or version).
3. `aws ecr get-login-password | docker login …` then `docker push` to the `kushhr-web` ECR repo.

Only **our** app image goes to ECR. Supabase images are pulled from their public registries by Compose on the EC2 box.

### 3. EC2 boot / deploy sequence

On the EC2 instance (via user-data script, systemd unit, or a small deploy script):
```bash
# 1. Authenticate Docker to ECR (IAM role on the instance, no static keys)
aws ecr get-login-password --region <region> \
  | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com

# 2. Pull the exact app image tag + all Supabase images, then start
cd infra/supabase
docker compose pull
docker compose up -d --wait
```
No `--build` on the server — the image is prebuilt. To deploy a new version: push a new tag from CI, bump `APP_IMAGE_TAG`, re-run `pull` + `up -d`.

### 4. First-boot, one-time on a fresh EC2 box (unchanged from current runbook)

- Bring up Caddy first, export its internal CA to `certs/caddy-root.crt` (required before `web` starts), then bring up the rest. *(Or use a real internal FQDN + CA distribution at proper on-prem/AWS deploy — see the app-overlay comments.)*
- Run the one-time DB init (migrations + seed).
- Set production secrets in `.env` (never commit).

---

## What stays the same

- The application code and behaviour.
- The Supabase update path (bump tags in the base file → `pull` → `up`).
- The file separation (base vs. our overlay).
- Backups, RLS, auth, storage — all unchanged.

## What we deliberately do NOT do

- **Do not merge everything into one physical `docker-compose.yml`.** It appears to satisfy "single file" but breaks the clean Supabase-update path — every upgrade would force a manual re-merge of our services. `COMPOSE_FILE` gives the single-command experience without this cost.
- **Do not swap Supabase's Postgres for AWS RDS.** Self-hosted Supabase against RDS is known to be fragile (auth/realtime boot failures, breakage on every upgrade, weeks of custom scripting). Keep the bundled Postgres and rely on our encrypted-backup story for durability.

---

## Open questions to confirm before building the ECR model

1. **AWS account ID + region** for the ECR repo, and repo name (proposed `kushhr-web`).
2. **How EC2 authenticates to ECR** — recommend an **IAM instance role** (no static keys on the box).
3. **Image tagging scheme** — git SHA, semantic version, or `latest`? (Recommend immutable tags, not `latest`, for auditable rollbacks.)
4. **Where CI runs** (GitHub Actions?) so we can wire the build-and-push step.
5. **Internal hostname / TLS at the AWS box** — keep the `kushhr.internal` + Caddy internal-CA approach, or use a real internal DNS name + certificate? Affects the app image build arg and the `extra_hosts` block.
6. **Do the Supabase images need mirroring into ECR** (e.g. air-gapped / egress-restricted network), or can EC2 pull them from public registries? Default assumption: public pull is allowed.

---

## Appendix — keeping Supabase up to date

Because we self-host, updating Supabase is our responsibility. Every service is **pinned to an exact version** in the base `docker-compose.yml` (e.g. `supabase/gotrue:v2.189.0`, `supabase/postgres:17.6.1.133`). Nothing auto-updates — the stack stays frozen until we deliberately move it. Procedure, when we want to:

1. Review `infra/supabase/CHANGELOG.md` for breaking changes.
2. Back up the database (encrypted backup tooling already in `infra/supabase/backup/`).
3. Bump the `image:` version tags in `docker-compose.yml` (or drop in the newer upstream copy of that file — our customizations are **not** in it; they live in the app overlay + `.env`).
4. `docker compose pull` then `docker compose up -d`.

Effort: occasional and deliberate (~15 min), not continuous. This separation is precisely why updates stay low-risk.
