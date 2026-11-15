import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdingSnapshots, portfolioSnapshots, snapshots } from "@/lib/db/schema";
import {
  buildDemoHistory,
  demoHistoryIncomplete,
  weeklyDates,
  DEMO_HISTORY_YEARS,
  type DemoHistoryHolding,
} from "@/lib/demo-history";

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

  const history = buildDemoHistory(userId, holdingRows, weeklyDates(DEMO_HISTORY_YEARS), rates);
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
 * A demo tenant's synthetic series is anchored at the prices it was seeded
 * with. Once the daily refresh moves those prices, the seed day and the first
 * refreshed day form a step (we saw +23% after the 2024 seed prices met live
 * 2026 quotes). Rebuild the whole series at the current prices so the chart
 * stays continuous; the demo histories are synthetic, so replacing them is
 * lossless.
 *
 * A normal synthetic week moves far less than 10%, so only a genuine rebase
 * gap triggers this. Returns true when rows were rewritten.
 */
const REBASE_STEP_THRESHOLD = 0.1;

export async function rebaseDemoHistory(
  userId: string,
  holdingRows: readonly DemoHistoryHolding[],
  totalSnapshots: ReadonlyArray<{ date: string; value: number }>,
  rates: Record<string, number> = {},
): Promise<boolean> {
  if (!holdingRows.length || totalSnapshots.length < 2) return false;
  const sorted = [...totalSnapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  if (!latest || !previous || previous.value <= 0) return false;
  if (Math.abs(latest.value / previous.value - 1) <= REBASE_STEP_THRESHOLD) return false;

  const history = buildDemoHistory(userId, holdingRows, weeklyDates(DEMO_HISTORY_YEARS), rates);
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
