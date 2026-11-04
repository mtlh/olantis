import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { benchmarkDaily } from "@/lib/db/schema";
import { fetchHistory } from "@/lib/yahoo";
import { todayISODate } from "@/lib/format";

/**
 * The benchmarks offered by the performance chart. Keeping this list server-side
 * means an unauthenticated caller cannot turn /api/benchmark into an arbitrary
 * Yahoo proxy, and gives each symbol a stable display name/currency.
 */
export const BENCHMARKS = {
  "VWRL.L": { name: "VWRL", currency: "GBP" },
  "^FTSE": { name: "FTSE 100", currency: "GBP" },
  "^GSPC": { name: "S&P 500", currency: "USD" },
  MSFT: { name: "Microsoft", currency: "USD" },
} as const;

export type BenchmarkSymbol = keyof typeof BENCHMARKS;

export function isBenchmarkSymbol(value: string): value is BenchmarkSymbol {
  return Object.prototype.hasOwnProperty.call(BENCHMARKS, value);
}

export type BenchmarkPoint = { date: string; price: number };

/** Re-sync a series at most this often once it is already up to date. */
const SYNC_TTL_MS = 30 * 60_000;

/**
 * Earliest date with any portfolio history across every tenant. This is the
 * backfill floor: a benchmark never needs to start before the oldest snapshot
 * the chart can possibly render.
 */
export async function earliestPortfolioDate(): Promise<string> {
  try {
    const db = getDb();
    const rows = (await db.execute(sql`
      SELECT MIN(d) AS date FROM (
        SELECT MIN(date) AS d FROM snapshots
        UNION ALL
        SELECT to_timestamp(MIN(created_at))::date::text AS d FROM portfolios
      ) AS starts
    `)) as unknown as { rows?: Array<{ date: string | null }> };
    const value = rows?.rows?.[0]?.date;
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "2020-01-01";
  } catch {
    return "2020-01-01";
  }
}

/** Read the stored daily closes for one benchmark, oldest first. */
export async function readBenchmarkSeries(symbol: string, from?: string): Promise<BenchmarkPoint[]> {
  const db = getDb();
  const rows = await db
    .select({ date: benchmarkDaily.date, price: benchmarkDaily.price })
    .from(benchmarkDaily)
    .where(from
      ? and(eq(benchmarkDaily.symbol, symbol), gte(benchmarkDaily.date, from))
      : eq(benchmarkDaily.symbol, symbol))
    .orderBy(benchmarkDaily.date);
  return rows
    .map((row) => ({ date: row.date, price: Number(row.price) }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0);
}

/** Upsert daily closes, leaving older rows in place. */
export async function writeBenchmarkSeries(symbol: string, points: BenchmarkPoint[]): Promise<void> {
  if (!points.length) return;
  const db = getDb();
  const currency = isBenchmarkSymbol(symbol) ? BENCHMARKS[symbol].currency : null;
  const updatedAt = Math.floor(Date.now() / 1000);
  const rows = points
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.price) && point.price > 0)
    .map((point) => ({ symbol, date: point.date, price: point.price, currency, updatedAt }));
  if (!rows.length) return;
  // Keep each statement well below Neon's parameter limit on long histories.
  const CHUNK = 500;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    await db.insert(benchmarkDaily).values(chunk).onConflictDoUpdate({
      target: [benchmarkDaily.symbol, benchmarkDaily.date],
      set: { price: sql`excluded.price`, currency: sql`excluded.currency`, updatedAt: sql`excluded.updated_at` },
    });
  }
}

/**
 * Full rebuild for one symbol: replace every stored row with a fresh daily
 * series. Used by the backfill script so a bad earlier series cannot survive.
 */
export async function replaceBenchmarkSeries(symbol: string, points: BenchmarkPoint[]): Promise<void> {
  const db = getDb();
  await db.delete(benchmarkDaily).where(eq(benchmarkDaily.symbol, symbol));
  await writeBenchmarkSeries(symbol, points);
}

/** Shift an ISO day by whole days (UTC), for widening a Yahoo window. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily closes from the DB, fetching and persisting anything missing. The
 * returned series includes the last close at or before `from` so the chart can
 * anchor the benchmark to the exact first snapshot, even when that snapshot
 * falls on a weekend or holiday.
 */
export async function ensureBenchmarkSeries(symbol: string, from: string): Promise<BenchmarkPoint[]> {
  const db = getDb();
  const today = todayISODate();
  // Yahoo's daily window can start on a non-trading day; widen it so the close
  // immediately before the first snapshot is always available as the baseline.
  const windowStart = addDays(from, -7);

  let stored: Array<{ date: string; price: number; updatedAt: number }> = [];
  try {
    const rows = await db
      .select({ date: benchmarkDaily.date, price: benchmarkDaily.price, updatedAt: benchmarkDaily.updatedAt })
      .from(benchmarkDaily)
      .where(eq(benchmarkDaily.symbol, symbol))
      .orderBy(benchmarkDaily.date);
    stored = rows.map((row) => ({ date: row.date, price: Number(row.price), updatedAt: row.updatedAt }));
  } catch {
    // Table missing (fresh database / migration not applied yet): fall back to
    // a direct fetch so the chart still renders accurately.
    const fetched = await fetchHistory(symbol, windowStart, today, "1d");
    return fetched.map((point) => ({ date: point.date, price: point.close }));
  }

  const latest = stored.at(-1);
  const lastSync = stored.reduce((max, row) => Math.max(max, row.updatedAt), 0) * 1000;
  // Re-sync on a timer even when today's row already exists: during the session
  // it keeps the latest price current, and after the close it replaces the
  // provisional intraday value with the final close.
  const needsSync = !stored.length || !latest || Date.now() - lastSync > SYNC_TTL_MS;

  if (needsSync) {
    // Fill a missing prefix in one pass, otherwise only refresh the recent tail.
    const fetchFrom = !latest || stored[0].date > windowStart
      ? windowStart
      : addDays(latest.date, -7);
    try {
      const fetched = await fetchHistory(symbol, fetchFrom, today, "1d");
      if (fetched.length) {
        await writeBenchmarkSeries(symbol, fetched.map((point) => ({ date: point.date, price: point.close })));
        stored = stored.concat(
          fetched.map((point) => ({ date: point.date, price: point.close, updatedAt: Math.floor(Date.now() / 1000) })),
        );
      }
    } catch {
      // Keep whatever is already stored rather than failing the chart.
    }
  }

  const deduped = new Map<string, number>();
  for (const row of stored) {
    if (Number.isFinite(row.price) && row.price > 0) deduped.set(row.date, row.price);
  }
  const ordered = [...deduped.entries()].sort(([a], [b]) => a.localeCompare(b));
  // Include the last close on/before the requested start, then everything after.
  let first = ordered.findIndex(([date]) => date >= from);
  if (first < 0) first = ordered.length;
  if (first > 0) first -= 1;
  return ordered.slice(first).map(([date, price]) => ({ date, price }));
}
