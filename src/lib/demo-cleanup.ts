import { and, eq, like, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  accounts,
  goals,
  holdingSnapshots,
  holdings,
  portfolioSnapshots,
  portfolios,
  providers,
  snapshots,
  transactions,
  userSettings,
  watchlistItems,
} from "@/lib/db/schema";
import { LEGACY_DEMO_USER_ID, isDemoUserId } from "@/lib/auth";

/**
 * Housekeeping for throwaway demo tenants.
 *
 * These run from the daily cron rather than from `/api/demo`: the demo handler
 * is the one request a first-time visitor waits on, and a full scan of the
 * accounts table had no business on that path.
 */

async function deleteQuietly(job: () => Promise<unknown>) {
  try {
    await job();
  } catch {
    /* Removing a demo tenant is best-effort; a leftover row is harmless. */
  }
}

export async function clearDemo(userId: string) {
  const db = getDb();
  await deleteQuietly(() => db.delete(snapshots).where(eq(snapshots.userId, userId)));
  await deleteQuietly(() => db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId)));
  await deleteQuietly(() => db.delete(holdingSnapshots).where(eq(holdingSnapshots.userId, userId)));
  await deleteQuietly(() => db.delete(transactions).where(eq(transactions.userId, userId)));
  await deleteQuietly(() => db.delete(holdings).where(eq(holdings.userId, userId)));
  await deleteQuietly(() => db.delete(portfolios).where(eq(portfolios.userId, userId)));
  await deleteQuietly(() => db.delete(providers).where(eq(providers.userId, userId)));
  await deleteQuietly(() => db.delete(accounts).where(eq(accounts.userId, userId)));
  await deleteQuietly(() => db.delete(goals).where(eq(goals.userId, userId)));
  await deleteQuietly(() => db.delete(watchlistItems).where(eq(watchlistItems.userId, userId)));
  await deleteQuietly(() => db.delete(userSettings).where(eq(userSettings.userId, userId)));
}

/**
 * Drop abandoned demo tenants so per-session isolation does not grow the
 * database without bound. Returns how many tenants were removed.
 */
export async function pruneDemoSessions(olderThanDays = 7): Promise<number> {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
  try {
    const stale = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(like(accounts.userId, "demo:%"), lt(accounts.createdAt, cutoff)));
    const ids = [...new Set(stale.map((r) => r.userId))].filter(isDemoUserId);
    for (const id of ids) await clearDemo(id);
    // legacy single-tenant demo rows (pre per-session isolation)
    const legacy = await db.select().from(accounts).where(eq(accounts.userId, LEGACY_DEMO_USER_ID));
    if (legacy.length) await clearDemo(LEGACY_DEMO_USER_ID);
    return ids.length + (legacy.length ? 1 : 0);
  } catch {
    return 0;
  }
}
