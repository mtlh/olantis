import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdingSnapshots, portfolioSnapshots, snapshots } from "@/lib/db/schema";
import { readBenchmarkSeries } from "@/lib/benchmark";
import {
  buildDemoHistory,
  demoHistoryIncomplete,
  demoHistoryNeedsRebuild,
  weeklyDates,
  DEMO_HISTORY_YEARS,
  type DemoHistoryHolding,
  type DemoMarketPoint,
} from "@/lib/demo-history";

/**
 * Market closes that shape the demo portfolio's history.
 *
 * The demo used to invent its own trend, which left the performance chart
 * contradicting the benchmark it plots next to. Reading the stored benchmark
 * series keeps the demo network-free and deterministic while making the two
 * agree. Cached briefly: the closes only move once a trading day.
 */
const MARKET_PATH_TTL_MS = 10 * 60_000;
let marketPathCache: { at: number; points: DemoMarketPoint[] } | null = null;

export async function loadDemoMarketPath(): Promise<DemoMarketPoint[]> {
  if (marketPathCache && Date.now() - marketPathCache.at < MARKET_PATH_TTL_MS) return marketPathCache.points;
  try {
    // The demo's holdings are global trackers and US names, so an All-World
    // tracker in GBP (the demo's default benchmark) is the right shape; a US
    // index is the fallback when the table has not been backfilled yet.
    const primary = await readBenchmarkSeries("VWRL.L");
    const points = primary.length ? primary : await readBenchmarkSeries("^GSPC");
    const resolved = points.map((point) => ({ date: point.date, value: point.price }));
    marketPathCache = { at: Date.now(), points: resolved };
    return resolved;
  } catch {
    // Table missing or database unavailable: the synthetic drawdowns still work.
    return [];
  }
}

/**
 * Fill in history a demo tenant is missing.
 *
 * Two entry points use this: `/api/demo` (a visitor who clicks "Try the demo"
 * again) and the workspace bootstrap (a visitor who opens `/dashboard` directly
 * with a demo cookie minted by an older build). Either way the tenant repairs
 * itself before the holding chart asks for its series.
 *
 * Only missing dates are written, so values the visitor's own session recorded
 * (cron, client POST) are never overwritten, and a complete tenant costs
 * nothing beyond the check.
 *
 * Returns true when rows were written.
 */
export async function topUpDemoHistory(
  userId: string,
  holdingRows: readonly DemoHistoryHolding[],
  pointsByHolding: ReadonlyMap<string, number>,
  rates: Record<string, number> = {},
): Promise<boolean> {
  if (!holdingRows.length) return false;
  if (!demoHistoryIncomplete(holdingRows, pointsByHolding)) return false;

  const marketPath = await loadDemoMarketPath();
  const history = buildDemoHistory(userId, holdingRows, weeklyDates(DEMO_HISTORY_YEARS), rates, marketPath);
  const db = getDb();
  await Promise.all([
    db.insert(snapshots).values(history.snapshotRows).onConflictDoNothing(),
    history.portfolioRows.length
      ? db.insert(portfolioSnapshots).values(history.portfolioRows).onConflictDoNothing()
      : Promise.resolve(),
    db.insert(holdingSnapshots).values(history.holdingRows).onConflictDoNothing(),
  ]);
  return true;
}

/**
 * Rebuild a demo tenant's series when the stored one no longer describes it.
 *
 * Two cases trigger this (see `demoHistoryNeedsRebuild`): the seed day and the
 * first refreshed day form a step (we saw +23% after the 2024 seed prices met
 * live 2026 quotes), or the series was written by a build whose demo history was
 * a fabricated curve instead of following the market. Demo histories are
 * synthetic, so replacing them is lossless. Returns true when rows were
 * rewritten.
 */
export async function rebaseDemoHistory(
  userId: string,
  holdingRows: readonly DemoHistoryHolding[],
  totalSnapshots: ReadonlyArray<{ date: string; value: number }>,
  rates: Record<string, number> = {},
): Promise<boolean> {
  if (!holdingRows.length || totalSnapshots.length < 2) return false;
  const marketPath = await loadDemoMarketPath();
  if (!demoHistoryNeedsRebuild(totalSnapshots, marketPath)) return false;

  const history = buildDemoHistory(userId, holdingRows, weeklyDates(DEMO_HISTORY_YEARS), rates, marketPath);
  const db = getDb();
  // One transaction: a tenant must never be left with its old rows deleted and
  // no replacement series.
  await db.batch([
    db.delete(snapshots).where(eq(snapshots.userId, userId)),
    db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId)),
    db.delete(holdingSnapshots).where(eq(holdingSnapshots.userId, userId)),
    db.insert(snapshots).values(history.snapshotRows),
    db.insert(holdingSnapshots).values(history.holdingRows),
    ...(history.portfolioRows.length ? [db.insert(portfolioSnapshots).values(history.portfolioRows)] : []),
  ]);
  return true;
}

/** Count existing history rows per holding from an already-loaded series. */
export function pointsByHolding(rows: ReadonlyArray<{ holdingId: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.holdingId, (counts.get(row.holdingId) ?? 0) + 1);
  return counts;
}
