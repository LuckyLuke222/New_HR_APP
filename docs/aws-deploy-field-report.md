# KushHR on AWS EC2 — field report (test deploy)

**Date:** 2026-07-16 · **Outcome:** ✅ KushHR running end-to-end on a single EC2, reachable over the
internet (login → dashboard → all modules). Companion to the step-by-step runbook
[`aws-ec2-deployment-test.md`](aws-ec2-deployment-test.md) and the sizing guide
[`aws-sizing.md`](aws-sizing.md).

**Purpose of this doc:** hand this to whoever stands up the *real* AWS box so they know what worked,
what to expect, and what to do differently on a properly-sized instance.

---

## 1. What we proved

On one EC2 instance we brought up the **entire stack** — the full self-hosted Supabase platform
(~13 containers: Postgres, Kong gateway, GoTrue auth, PostgREST, Storage, Studio, etc.) **plus** the
KushHR Next.js app and, over plain HTTP on the public DNS, logged in and used the product. The
architecture is sound and deploys on a single box; nothing about the app is broken.

**Important framing:** we deliberately used the **free-tier 1 GB instance** and **no domain**, to
stress-test the cheapest, most awkward path. Most of the pain below is a direct result of those two
choices — **it largely disappears on a correctly-sized box with a real hostname.**

---

## 2. Issues we hit — split by "goes away on a real box" vs "will recur, plan for it"

### A. RESOURCE issues (caused by the 1 GB free-tier box — gone on a proper instance)

| Issue | What happened | Workaround we used | On a real box |
|---|---|---|---|
| **`next build` ran out of memory** | The app build's TypeScript type-check OOM-killed at ~450 MB; then thrashed for ~27 min on swap. | Added 8 GB swap, raised Node heap (`NODE_OPTIONS=--max-old-space-size`), then **skipped the in-build type-check**, then **stopped 5 non-essential containers** to free RAM for the build. | **None needed** — an 8 GB box builds in ~2–3 min, no swap, no skip flags, no container juggling. |
| **Studio container unhealthy** | On the starved box, Studio was slow to become healthy and aborted the `compose up`. | Re-ran `docker compose up -d` once it warmed up. | Won't happen with adequate RAM. |

**Bottom line:** ~80% of the effort tonight was fighting 1 GB of RAM. It is **not** representative of
a real deploy.

### B. CONFIG issues (independent of box size — expect these on any deploy)

| Issue | What happened | Fix | Real-box guidance |
|---|---|---|---|
| **Storage first-boot race** | DB init ran before the Storage service created the `storage.buckets` table → bootstrap failed with *"relation storage.buckets does not exist"*. | Restarted the storage container, **waited** for it to create its schema, then bootstrapped. | Add a readiness check for `storage.buckets` before running `db:bootstrap` (a wait-loop). One-time on fresh init. |
| **App is wired for one HTTPS origin behind Caddy** | The app bakes `NEXT_PUBLIC_SUPABASE_URL=https://kushhr.internal` into the browser bundle **at build time** and expects a reverse proxy. A bare-IP HTTP deploy doesn't match that. | Switched all URLs from raw IP to the **EC2 public DNS** and added `extra_hosts` so the app container can reach Kong via the Docker host. Rebuilt. | **Use the app's intended design:** a real hostname (internal FQDN or domain) + Caddy for TLS. Then this "just works" — no IP hacks. |
| **Login succeeded but bounced back to login** | Browser auth worked (200), but the **server inside the container couldn't reach the public IP** to validate the session (AWS won't route an instance to its own public IP; security group also blocked it). | Same DNS + `extra_hosts` fix — the container now reaches Kong internally. | Same as above — a proper hostname + proxy removes this entirely. |
| **"Not Secure" browser warning** | We ran plain HTTP (no TLS) for a no-domain test. | Accepted it for a dummy-data test only. | **Must add TLS before real data** (Caddy + Let's Encrypt or an internal CA). Plain HTTP leaks passwords. |

---

## 3. Recommended path for the real AWS box

1. **Size it properly.** 2 vCPU / **8 GB** RAM / 50 GB gp3 (`t3.large` or `t4g.large`). Per
   [`aws-sizing.md`](aws-sizing.md). This alone removes every RESOURCE issue above.
2. **Don't build on the server.** Build the app image in CI and push to **ECR**; the server just
   *pulls* it. Removes the build-memory problem entirely and proves the build in CI, not in prod.
   Plan: [`aws-ecr-deployment-plan.md`](aws-ecr-deployment-plan.md).
3. **Give it a real hostname + TLS.** A real domain (Let's Encrypt) or an internal FQDN (Caddy
   internal CA) — this is the app's *designed* configuration and eliminates the DNS/`extra_hosts`
   improvisation and the "Not Secure" warning in one move.
4. **Lock the front door before inviting anyone:** keep `DISABLE_SIGNUP=true`, close the `:3100` /
   `:8000` fallback ports (Caddy-only ingress), and finalize the FQDN.
5. **Set up off-host backups** *before* any real data lands (encrypted, off the box, with a rehearsed
   restore).

## 4. What this test does NOT clear

Running on AWS is an **infrastructure** milestone, not a **production-readiness** one. Before real
staff/payroll data, the outstanding **Tier A + Tier P P0** items still apply (see
[`docs/checks/audit-remediation-plan.md`](checks/audit-remediation-plan.md)): the correctness/security
fixes, atomic audit logging, off-host backups + fail-closed restore, and a CI that actually builds and
tests. Deployment method doesn't change that list.

## 5. Time & cost

- **Tonight:** a few hours, mostly the 1 GB build fight. On an 8 GB box the same deploy is well under
  an hour.
- **Cost:** free-tier instance = $0; a right-sized `t4g.large` run for testing is pennies/hour.

---

**Summary for the team:** the app deploys cleanly on a single AWS box — the architecture works. Tonight's
friction was 80% "we chose the smallest possible box + no domain." On a correctly-sized instance with a
real hostname (and ideally an ECR/CI build), this is a smooth deploy. The remaining gate before *real*
data is the audit remediation, not the infrastructure.
