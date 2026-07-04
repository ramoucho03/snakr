import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * Sliding-window rate limiting for the abuse-prone endpoints (login, register,
 * share unlock). Single-node in-memory: state lives in the one app process, so
 * it needs no Redis and no extra table — matching the "one command up" promise.
 * If this ever scales horizontally, swap `RateLimiterMemory` for the Postgres
 * backend here; every call site stays the same.
 */

const buckets = new Map<string, RateLimiterMemory>();

function bucket(name: string, points: number, durationSec: number): RateLimiterMemory {
  const cacheKey = `${name}:${points}:${durationSec}`;
  let rl = buckets.get(cacheKey);
  if (!rl) {
    rl = new RateLimiterMemory({ points, duration: durationSec, keyPrefix: name });
    buckets.set(cacheKey, rl);
  }
  return rl;
}

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds until the caller may retry (0 when allowed). */
  retryAfterMs: number;
}

/**
 * Consume one point from `name` for `key` (usually `ip:identifier`).
 * Returns `{ ok:false, retryAfterMs }` once the window is exhausted.
 */
export async function rateLimit(
  name: string,
  key: string,
  points = 8,
  durationSec = 60,
): Promise<RateLimitResult> {
  try {
    await bucket(name, points, durationSec).consume(key, 1);
    return { ok: true, retryAfterMs: 0 };
  } catch (rejection) {
    const ms =
      typeof rejection === "object" && rejection && "msBeforeNext" in rejection
        ? Number((rejection as { msBeforeNext: number }).msBeforeNext)
        : durationSec * 1000;
    return { ok: false, retryAfterMs: ms };
  }
}

/** Best-effort client IP from the standard proxy headers (Caddy sets these). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}
