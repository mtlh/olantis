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
  // Children first, then their parents, so the cleanup does not depend on the
  // database having the cascade rules from the schema. Each wave runs in
  // parallel: every statement in it touches a different table.
  await Promise.all([
    deleteQuietly(() => db.delete(snapshots).where(eq(snapshots.userId, userId))),
    deleteQuietly(() => db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId))),
    deleteQuietly(() => db.delete(holdingSnapshots).where(eq(holdingSnapshots.userId, userId))),
    deleteQuietly(() => db.delete(transactions).where(eq(transactions.userId, userId))),
    deleteQuietly(() => db.delete(holdings).where(eq(holdings.userId, userId))),
  ]);
  await Promise.all([
    deleteQuietly(() => db.delete(portfolios).where(eq(portfolios.userId, userId))),
    deleteQuietly(() => db.delete(providers).where(eq(providers.userId, userId))),
    deleteQuietly(() => db.delete(goals).where(eq(goals.userId, userId))),
    deleteQuietly(() => db.delete(watchlistItems).where(eq(watchlistItems.userId, userId))),
  ]);
  await Promise.all([
    deleteQuietly(() => db.delete(accounts).where(eq(accounts.userId, userId))),
    deleteQuietly(() => db.delete(userSettings).where(eq(userSettings.userId, userId))),
  ]);
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
    // Tenants are independent, so clear them a few at a time instead of one
    // after another: a week of demo traffic stays well inside the cron budget.
    const PER_BATCH = 10;
    for (let i = 0; i < ids.length; i += PER_BATCH) {
      await Promise.all(ids.slice(i, i + PER_BATCH).map(clearDemo));
    }
    // legacy single-tenant demo rows (pre per-session isolation)
    const legacy = await db.select().from(accounts).where(eq(accounts.userId, LEGACY_DEMO_USER_ID));
    if (legacy.length) await clearDemo(LEGACY_DEMO_USER_ID);
    return ids.length + (legacy.length ? 1 : 0);
  } catch {
    return 0;
  }
}
