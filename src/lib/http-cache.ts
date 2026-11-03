/**
 * Shared Yahoo Finance access layer.
 *
 * Every upstream call is funnelled through `cached()` so we get:
 *  - a per-instance TTL cache (quotes/charts/search rarely change within minutes)
 *  - in-flight de-duplication (concurrent requests for the same key share one call)
 *  - a global concurrency cap + minimum spacing between upstream requests
 *  - exponential backoff with jitter when Yahoo answers 429
 *  - stale-while-revalidate: a throttled/failed refresh falls back to the last
 *    good value instead of returning nothing
 *
 * Note: the cache is per serverless instance (memory), which is the right shape
 * for Vercel functions — each warm lambda serves its own cached reads.
 */

type CacheEntry<T> = { value: T; at: number; staleAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_ENTRIES = 500;

/** Hard TTL — entries older than this are never served. */
const HARD_TTL = {
  quote: 24 * 60 * 60_000,
  chart: 15 * 60_000,
  search: 10 * 60_000,
} as const;

/** Soft TTL — fresh window; after this we refresh but can still serve stale. */
const SOFT_TTL = {
  quote: 90_000,
  chart: 5 * 60_000,
  search: 60_000,
} as const;

export type CacheKind = keyof typeof HARD_TTL;

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  const now = Date.now();
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [k, v] of entries) {
    if (cache.size <= MAX_ENTRIES) break;
    if (now - v.at > HARD_TTL.quote) cache.delete(k);
  }
  // still oversized after age-based prune: drop oldest regardless
  if (cache.size > MAX_ENTRIES) {
    for (const [k] of entries) {
      if (cache.size <= MAX_ENTRIES) break;
      cache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Upstream throttling: one request at a time, minimum gap between calls.
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 120;
const MAX_CONCURRENT = 4;

let active = 0;
let lastStart = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
    return;
  }
  active += 1;
  const gap = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
  lastStart = Date.now() + gap;
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
}

function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

// ---------------------------------------------------------------------------
// Retry with backoff
// ---------------------------------------------------------------------------

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|too many requests|rate limit|throttl/i.test(msg) ||
    (err instanceof Error && "statusCode" in err && (err as { statusCode?: number }).statusCode === 429);
}

function retryAfterFrom(err: unknown): number {
  const e = err as { retryAfter?: number; retryAfterMs?: number };
  if (typeof e?.retryAfterMs === "number") return e.retryAfterMs;
  if (typeof e?.retryAfter === "number") return e.retryAfter * 1000;
  return 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    await acquire();
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err) || i === attempts - 1) throw err;
      const hinted = retryAfterFrom(err);
      const backoff = Math.min(8000, hinted || 2 ** i * 500);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    } finally {
      release();
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// cached() — the single funnel
// ---------------------------------------------------------------------------

export async function cached<T>(
  kind: CacheKind,
  key: string,
  fetcher: () => Promise<T>,
  opts?: { allowStaleOnError?: boolean }
): Promise<T> {
  const ck = `${kind}:${key}`;
  const now = Date.now();
  const hit = cache.get(ck) as CacheEntry<T> | undefined;
  const soft = SOFT_TTL[kind];
  const hard = HARD_TTL[kind];

  if (hit && now - hit.at < soft) return hit.value;

  const running = inflight.get(ck) as Promise<T> | undefined;
  if (running) return running;

  const allowStale = opts?.allowStaleOnError ?? true;
  const staleOk = hit && now - hit.staleAt < hard;

  const p = (async () => {
    try {
      const value = await withRetry(fetcher);
      cache.set(ck, { value, at: Date.now(), staleAt: Date.now() });
      prune();
      return value;
    } catch (err) {
      if (allowStale && staleOk) return hit!.value;
      throw err;
    } finally {
      inflight.delete(ck);
    }
  })();

  inflight.set(ck, p);

  // If we already have a soft-stale value, serve it immediately and let the
  // refresh land in the cache for the next caller (stale-while-revalidate).
  if (hit && allowStale && now - hit.at < hard) {
    p.catch(() => {});
    return hit.value;
  }

  return p;
}

/** Test/ops helper — drop cached state for a key or everything. */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

export function cacheStats() {
  return { size: cache.size, inflight: inflight.size, active };
}

export function getCachedEntry<T>(kind: CacheKind, key: string): { value: T; at: number; staleAt: number } | undefined {
  const ck = `${kind}:${key}`;
  return cache.get(ck) as { value: T; at: number; staleAt: number } | undefined;
}

export function setCachedEntry<T>(kind: CacheKind, key: string, value: T) {
  const ck = `${kind}:${key}`;
  cache.set(ck, { value, at: Date.now(), staleAt: Date.now() });
  prune();
}

export function isFresh(kind: CacheKind, key: string): boolean {
  const hit = cache.get(`${kind}:${key}`) as CacheEntry<unknown> | undefined;
  if (!hit) return false;
  return Date.now() - hit.at < SOFT_TTL[kind];
}
