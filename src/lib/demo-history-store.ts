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
): Promise<boolean> {
  if (!holdingRows.length) return false;
  if (!demoHistoryIncomplete(holdingRows, pointsByHolding)) return false;

  const history = buildDemoHistory(userId, holdingRows, weeklyDates(DEMO_HISTORY_YEARS));
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

/** Count existing history rows per holding from an already-loaded series. */
export function pointsByHolding(rows: readonly { holdingId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.holdingId, (counts.get(row.holdingId) ?? 0) + 1);
  return counts;
}
