# Self-host backups (off-cloud §0, Step 3C)

Encrypted, local, restorable backups of the two stateful stores in the self-hosted stack:
the Postgres database and the `storage-data` volume (hr-documents blobs).

**Status:** local encrypted archive only. Off-site upload is a marked TODO in `backup.sh`
(decision deferred — see `docs/follow-ups.md`).

## First-boot CA export (TLS prerequisite — do this before `up`-ing `web`)

The `web` service mounts `./certs/caddy-root.crt` (Caddy's internal root CA) so its server-side
`fetch` trusts `https://kushhr.internal`. **That file does not exist on a fresh clone** —
Caddy generates the CA on its first boot, so the bootstrap order is: start Caddy, export the
CA, then build/up `web`. A missing file aborts `docker compose up` for `web`.

```bash
cd infra/supabase
# 1. base stack + Caddy only (Caddy mints its internal CA in the caddy-data volume)
docker compose up -d caddy
# 2. export the root CA to the path web mounts
mkdir -p certs
docker cp kushhr-caddy:/data/caddy/pki/authorities/local/root.crt certs/caddy-root.crt
# 3. now build + start web (and trust the CA in your browser — see MS-B in the plan)
docker compose up -d --build web
```

At a real on-prem deploy this CA is also distributed to every client machine's browser trust
store (macOS keychain / Firefox NSS / Windows store).

## Files

| File | Purpose |
|------|---------|
| `backup.sh` | Dump DB (`pg_dump -Fc`) + tar storage volume, encrypt both, write to `../backups/`, prune to `RETENTION` (default 7). |
| `restore.sh <TS>` | Decrypt + restore into a **throwaway scratch DB** and print row counts (safe verify). `--into-live` restores over the live DB (danger). |
| `backup.key` | AES-256 passphrase (auto-generated on first run). **Gitignored. Losing it = backups unrecoverable.** |
| `../backups/` | Encrypted archives + `manifest.sha256`. Gitignored. |

## Encryption

`openssl enc -aes-256-cbc -pbkdf2 -iter 600000` with the passphrase in `backup.key`. Chosen
for ubiquity (no install; present on macOS, Linux, and the postgres container). For the real
off-site step, consider upgrading to `age` (authenticated X25519) — the encrypt/decrypt calls
are isolated in the `ENC`/`DEC` helpers, so swapping is a two-line change.

> **Key handling:** copy `backup.key` to a secure off-machine location (password manager /
> sealed store) the first time it is generated. It is the single secret protecting every
> archive and is never committed.

## Run

```bash
cd infra/supabase/backup
./backup.sh                      # one backup now
RETENTION=14 ./backup.sh         # override retention
./restore.sh 20260610-141500     # verify a specific archive (scratch DB)
```

## Schedule (operator installs — not auto-installed)

**cron** (Linux server) — daily 02:30:
```
30 2 * * *  cd /opt/kushhr/infra/supabase/backup && ./backup.sh >> /var/log/kushhr-backup.log 2>&1
```

**launchd** (macOS rehearsal) — drop a `~/Library/LaunchAgents/com.kushhr.backup.plist`
running `backup.sh` on a `StartCalendarInterval`, then `launchctl load` it.

## Restore runbook

1. `./restore.sh <TS>` — confirms the archive decrypts and row counts match the source
   (scratch DB; live data untouched). This is the verification that makes a backup "real".
2. Real recovery onto a fresh stack: bring the stack up empty, then
   `./restore.sh <TS> --into-live` for the DB, and untar the storage archive into the
   `storage-data` volume (`docker run --rm -v supabase_storage-data:/data -i alpine sh -c
   'tar -xzf - -C /data'` fed the decrypted stream). Re-run the app and smoke login + a
   document download.
