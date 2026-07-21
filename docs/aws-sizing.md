# KushHR — AWS Server Sizing

Resource requirements for running KushHR on a single AWS EC2 instance, sized for **15–20 users**.

## Architecture (what drives the numbers)

KushHR deploys as a **single EC2 instance running the entire self-hosted Supabase stack via Docker
Compose** — not managed RDS or managed services (bundled Postgres is kept deliberately). One instance
therefore runs **~13 containers**, not just the application:

- `supabase/postgres:17` (database) · `gotrue` (auth) · `postgrest` (API) · `realtime` · `storage-api` · `imgproxy` · `postgres-meta` · `edge-runtime` · `kong` (gateway) · `supavisor` (connection pooler) · `studio` (admin UI)
- **`web`** — the KushHR Next.js application
- `caddy` — TLS reverse proxy

**Memory is the binding constraint.** Several of these services (Postgres, two Elixir/BEAM services,
a Deno runtime, Node, and Studio) each hold real memory. The application itself is light; the Supabase
platform underneath it sets the floor. The 15–20-user figure has almost no effect on CPU (concurrency is
very low) — it mainly influences data and document growth, i.e. disk.

## Recommended sizing

| Resource | **Recommended** | Minimum (works, tight) |
|---|---|---|
| **vCPU (cores)** | **2 vCPU** | 2 vCPU |
| **Memory (RAM)** | **8 GB** | 4 GB |
| **Disk (EBS gp3)** | **50 GB** | 30 GB |

**Suggested instance type:** `t3.large` (x86) or `t4g.large` (ARM / Graviton, lower cost) — both
**2 vCPU / 8 GB**. Burstable instances suit this workload (low steady-state, occasional bursts during
report generation and platform upgrades). For guaranteed (non-burstable) CPU, `m6i.large` / `m7g.large`
provide the same 2 vCPU / 8 GB.

## Rationale

**CPU — 2 cores.** 15–20 users generate negligible concurrent load. Two vCPUs comfortably run all ~13
containers plus short bursts. Four cores would be headroom only, not a requirement.

**Memory — 8 GB recommended, 4 GB floor.** The full self-hosted Supabase stack idles around 3–4 GB and
rises under load. 4 GB boots but leaves little room for database caching or for the spikes during a
platform version upgrade (many services active at once), creating an out-of-memory risk. 8 GB gives the
database caching room, the runtimes headroom, and the OS a buffer.

**Disk — 50 GB recommended, 30 GB floor.** Approximate breakdown:

| Component | Space |
|---|---|
| Container images on disk (~13 images; the Postgres image alone is ~2–3 GB) | ~10–12 GB |
| Database data (HR records + append-only audit log, 15–20 users) | ~1–2 GB, slow growth |
| Uploaded documents (contracts / payslips / IDs; 10 MB per-file cap) | budget ~5–10 GB growth |
| Local backups (encrypted database + storage archives, with retention) | ~5–10 GB |
| OS + Docker overhead + logs + upgrade headroom (image re-pull temporarily doubles image space) | ~8–10 GB |

30 GB runs but is pressured by upgrades and backup retention; 50 GB is the comfortable figure.

## Two recommendations

1. **Build the application image in CI, then pull it on the server — do not build on the instance.**
   Building the app on the box briefly adds ~1.5–2 GB of memory, which is risky on a 4 GB instance. The
   planned deployment model already pulls a prebuilt image from a registry (ECR), which removes build
   memory and CPU from the server entirely. (If the image must be built on the instance instead, size to
   8 GB.)

2. **Store backups off the instance (e.g. S3), not on the same EBS volume.** Keeping backups on the same
   disk as the live system means a single disk failure loses both. Moving backups to object storage
   improves durability and removes ~5–10 GB of growth from the disk figure above.

## Note

If a `t4g` / Graviton (ARM) instance is chosen for lower cost, the application image must be built for
`arm64` in the deployment pipeline. The Supabase images all provide ARM variants, so the rest of the
stack is unaffected.

---

*Sizing context: single-instance Docker Compose deployment, 15–20 users. Figures are steady-state with
modest growth headroom; revisit if user count or document volume grows materially.*
