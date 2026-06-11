/**
 * Simple in-memory rate limiter for admin routes.
 * Tracks requests per IP/secret and blocks if exceeded.
 *
 * Warning: Does NOT persist across server restarts.
 * For production, use Redis or Upstash.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Check if request should be rate limited.
 *
 * @param key Identifier (e.g., IP address or secret hash)
 * @param maxRequests Max requests allowed per window
 * @param windowMs Window duration in milliseconds (default: 60 seconds)
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  // No entry or window expired
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  // Within window
  if (entry.count < maxRequests) {
    entry.count++;
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Rate limited
  return { allowed: false, remaining: 0, resetAt: entry.resetAt };
}

/**
 * Get client IP from request headers.
 * Handles X-Forwarded-For (Vercel/proxy) and direct connection.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Clean up old entries periodically (runs once per hour).
 */
let lastCleanup = Date.now();
export function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < 60 * 60 * 1000) return; // Clean up once per hour

  let removed = 0;
  const entries = Array.from(store.entries());
  for (const [key, entry] of entries) {
    if (now >= entry.resetAt) {
      store.delete(key);
      removed++;
    }
  }

  lastCleanup = now;
  if (removed > 0) {
    console.log(`[RateLimit] Cleaned up ${removed} expired entries`);
  }
}
