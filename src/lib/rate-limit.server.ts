// Simple per-IP in-memory rate limiter. Cloudflare Worker instances are
// short-lived / per-region, so this is best-effort — enough to slow abusers.

const buckets = new Map<string, number[]>();

export function getClientIp(request: Request): string {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

/** Returns true when the request is within the limit. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);

  // Opportunistic sweep so the map doesn't grow forever.
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      const kept = v.filter((t) => now - t < windowMs);
      if (kept.length === 0) buckets.delete(k);
      else buckets.set(k, kept);
    }
  }
  return true;
}
