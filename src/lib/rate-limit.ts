// Minimal fixed-window in-memory rate limiter.
//
// State lives in a single module-level Map owned by this server process — no
// external store, no derived copies. It is intentionally process-local and
// ephemeral (resets on restart), which is sufficient for the LAN-only,
// 15-20-user self-host deployment (single `next start` process). If the app is
// ever scaled to multiple workers, limits become per-worker — acceptable for
// the abuse-mitigation use cases this guards, not for hard quotas.

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

/**
 * Returns true if the call is allowed, false if the key has exhausted its
 * quota for the current window. Each allowed call increments the counter.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Node.js is single-threaded; the bucket write above is fully visible before
    // sweep runs, and the new entry's resetAt (now + windowMs) is always in the
    // future, so sweep can never evict the bucket we just created.
    sweep(now);
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}

// Opportunistic cleanup of expired windows so the Map can't grow unbounded
// under a stream of distinct keys (e.g. spoofed IPs).
function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (now >= window.resetAt) {
      buckets.delete(key);
    }
  }
}
