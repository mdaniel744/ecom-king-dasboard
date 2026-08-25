import "server-only";

// In-memory sliding-window limiter. Good enough for this app's current
// single-instance deployment — the goal is stopping one user/session from
// hammering a shared, paid, cross-tenant API key (DeepSeek), not perfect
// distributed accuracy. If this app ever runs multiple instances behind a
// load balancer, swap the Map below for Upstash/Redis; the checkRateLimit
// call sites don't need to change.
const hits = new Map<string, number[]>();

/**
 * Returns true if `key` is still under `max` hits within the last
 * `windowMs`, and records this call as one of those hits. Returns false
 * (and does NOT record a new hit) once the limit is reached, so a caller
 * spamming past the limit doesn't keep extending their own window.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
