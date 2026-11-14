import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { accounts, providers, portfolios, holdings, snapshots, portfolioSnapshots, holdingSnapshots, userSettings, goals, watchlistItems } from "@/lib/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { DEMO_COOKIE, demoUserId, newDemoSessionId } from "@/lib/auth";
import { clearDemo } from "@/lib/demo-cleanup";
import { buildDemoHistory, weeklyDates, DEMO_HISTORY_YEARS, type DemoHistoryHolding } from "@/lib/demo-history";
import { topUpDemoHistory } from "@/lib/demo-history-store";
import { sectorForSymbol } from "@/lib/sectors";

/**
 * Demo mode — deliberately UNAUTHENTICATED.
 *
 * There is no sign-in, no WorkOS challenge and no shared secret protecting this
 * endpoint, and that is intentional: the demo must be reachable in one click.
 * Security comes from isolation rather than from an auth boundary:
 *
 *   - each visitor gets their own tenant `demo:<sessionId>` (see lib/auth.ts)
 *   - the dataset is PREDEFINED and deterministic — the same accounts,
 *     portfolios, holdings and history for everyone, generated from a seeded
 *     PRNG, with no upstream (Yahoo) calls on the seeding path
 *   - because tenants are per-session, one visitor can never read, overwrite
 *     or delete another visitor's rows
 *
 * `?clear=1` only ever deletes the current session's own rows.
 */

// ---------------------------------------------------------------------------
// Deterministic predefined dataset
// ---------------------------------------------------------------------------

type SeedHolding = {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currency: string;
  sector: string;
  purchaseDate: string;
  exchange: string;
};

const SEED_HOLDINGS: Record<string, SeedHolding[]> = {
  p1: [
    { symbol: "VWRP", name: "Vanguard FTSE All-World", shares: 120, avgPrice: 98, currentPrice: 106.4, currency: "GBP", sector: "Global Equity", purchaseDate: "2024-01-15", exchange: "LSE" },
    { symbol: "AAPL", name: "Apple Inc", shares: 15, avgPrice: 145, currentPrice: 178, currency: "USD", sector: "Technology", purchaseDate: "2024-03-10", exchange: "NASDAQ" },
    { symbol: "NVDA", name: "NVIDIA", shares: 8, avgPrice: 420, currentPrice: 485, currency: "USD", sector: "Technology", purchaseDate: "2024-05-20", exchange: "NASDAQ" },
  ],
  p2: [
    { symbol: "VUAG", name: "Vanguard S&P 500", shares: 200, avgPrice: 68, currentPrice: 74.2, currency: "GBP", sector: "US Equity", purchaseDate: "2023-11-01", exchange: "LSE" },
  ],
  p3: [
    { symbol: "VWCE", name: "Vanguard FTSE All-World Acc", shares: 85, avgPrice: 95, currentPrice: 102.3, currency: "GBP", sector: "Global Equity", purchaseDate: "2024-02-10", exchange: "LSE" },
  ],
};

/**
 * Older demo tenants were seeded before holdings carried a sector. Fill those
 * in from the deterministic map so a returning visitor's Sectors tab is as
 * complete as a fresh tenant's.
 */
async function backfillDemoSectors(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: holdings.id, symbol: holdings.symbol })
    .from(holdings)
    .where(and(eq(holdings.userId, userId), or(isNull(holdings.sector), eq(holdings.sector, ""))));
  const updates = rows
    .map((row) => ({ id: row.id, sector: sectorForSymbol(row.symbol) }))
    .filter((row): row is { id: string; sector: string } => !!row.sector);
  if (!updates.length) return;
  await db.execute(sql`UPDATE holdings SET sector = v.sector FROM (VALUES ${sql.join(updates.map((row) => sql`(${row.id}, ${row.sector})`), sql`, `)}) AS v(id, sector) WHERE holdings.id = v.id`);
}

async function seedDemo(userId: string) {
  const db = getDb();

  // Fast path for returning demo visitors: one round trip decides whether the
  // tenant already exists and whether its history is complete, instead of
  // re-checking goals, watchlist and portfolios on every click of "Try the demo".
  const batch = await db.batch([
    db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.userId, userId)),
    db
      .select({ holdingId: holdingSnapshots.holdingId, points: sql<number>`count(*)::int` })
      .from(holdingSnapshots)
      .where(eq(holdingSnapshots.userId, userId))
      .groupBy(holdingSnapshots.holdingId),
    db
      .select({
        id: holdings.id,
        symbol: holdings.symbol,
        shares: holdings.shares,
        currentPrice: holdings.currentPrice,
        portfolioId: holdings.portfolioId,
      })
      .from(holdings)
      .where(eq(holdings.userId, userId)),
  ]);
  const [existing, historyCounts, existingHoldings] = batch as unknown as [
    { id: string }[],
    { holdingId: string; points: number }[],
    DemoHistoryHolding[],
  ];
  if (existing.length > 0) {
    // Repair anything a tenant seeded by an older build is missing: per-holding
    // history (#67) and the sector used by the Sectors tab (#68).
    const points = new Map(historyCounts.map((row) => [row.holdingId, Number(row.points)]));
    // A repair failure must never block the demo from opening.
    await Promise.all([
      topUpDemoHistory(userId, existingHoldings.filter((h) => h.shares > 0), points).catch(() => false),
      backfillDemoSectors(userId).catch(() => {}),
    ]);
    return;
  }

  const [existingGoals, existingWatchlist] = await Promise.all([
    db.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId)),
    db.select({ symbol: watchlistItems.symbol }).from(watchlistItems).where(eq(watchlistItems.userId, userId)),
  ]);

  const existingSymbols = new Set(existingWatchlist.map((item) => item.symbol));
  const demoWatchlist = [
    { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", currency: "USD" },
    { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", currency: "USD" },
    { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", currency: "USD" },
    { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", currency: "USD" },
  ].filter((item) => !existingSymbols.has(item.symbol));

  const now = Math.floor(Date.now() / 1000);
  const accHousehold: typeof accounts.$inferInsert = { id: crypto.randomUUID(), userId, name: "Household", icon: "users", createdAt: now };
  const accPersonal: typeof accounts.$inferInsert = { id: crypto.randomUUID(), userId, name: "Personal", icon: "user", createdAt: now };

  const provVanguard: typeof providers.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, name: "Vanguard", createdAt: now };
  const provT212: typeof providers.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, name: "Trading 212", createdAt: now };
  const provHL: typeof providers.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accPersonal.id, name: "Hargreaves Lansdown", createdAt: now };

  const p1: typeof portfolios.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, providerId: provVanguard.id, name: "ISA — Global Tracker", type: "live", createdAt: now };
  const p2: typeof portfolios.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, providerId: provT212.id, name: "Trading 212 — Growth", type: "live", createdAt: now };
  const p3: typeof portfolios.$inferInsert = { id: crypto.randomUUID(), userId, accountId: accPersonal.id, providerId: provHL.id, name: "SIPP — Retirement", type: "live", createdAt: now };

  const slotFor: Record<string, string> = { [p1.id]: "p1", [p2.id]: "p2", [p3.id]: "p3" };
  const hs: (typeof holdings.$inferInsert)[] = [];
  for (const [pid, slot] of Object.entries(slotFor)) {
    for (const h of SEED_HOLDINGS[slot]) {
      hs.push({ id: crypto.randomUUID(), userId, portfolioId: pid, lastRefreshedAt: now, ...h });
    }
  }

  // Predefined history — deterministic, no network. One series per holding plus
  // the portfolio/total aggregates derived from it, so the holding view (which
  // charts its own value series) and every rollup always agree.
  const history = buildDemoHistory(
    userId,
    hs.map((h) => ({
      id: h.id!,
      symbol: h.symbol,
      shares: h.shares,
      currentPrice: h.currentPrice,
      portfolioId: h.portfolioId ?? null,
    })),
    weeklyDates(DEMO_HISTORY_YEARS),
  );

  // Side rows don't depend on the account tree, so start them immediately and
  // let the four dependent waves below run in the foreground.
  const sideWrites: Promise<unknown>[] = [];
  if (existingGoals.length === 0) {
    // Two milestones so the demo shows how several goals share one portfolio.
    const nearDate = new Date();
    nearDate.setUTCFullYear(nearDate.getUTCFullYear() + 2);
    const longDate = new Date();
    longDate.setUTCFullYear(longDate.getUTCFullYear() + 5);
    sideWrites.push(db.insert(goals).values([
      {
        id: crypto.randomUUID(),
        userId,
        name: "Build a £50,000 portfolio",
        targetValue: 50000,
        targetDate: nearDate.toISOString().slice(0, 10),
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId,
        name: "Reach £100,000",
        targetValue: 100000,
        targetDate: longDate.toISOString().slice(0, 10),
        createdAt: now + 1,
      },
    ]));
  }
  if (demoWatchlist.length > 0) {
    sideWrites.push(db.insert(watchlistItems).values(demoWatchlist.map((item) => ({
      id: crypto.randomUUID(),
      userId,
      ...item,
      createdAt: now,
    }))).onConflictDoNothing());
  }
  sideWrites.push(db.insert(userSettings)
    .values({ userId, currency: "GBP", dateFormat: "en-GB", defaultRange: "1Y", showTradeMarkers: 1, updatedAt: now })
    .onConflictDoNothing());

  // Foreign keys force three sequential waves; everything else runs with the
  // last one (~6 round trips instead of ~10 on a first demo visit).
  await db.insert(accounts).values([accHousehold, accPersonal]);
  await db.insert(providers).values([provVanguard, provT212, provHL]);
  await db.insert(portfolios).values([p1, p2, p3]);

  // Holding history references the holdings rows, so it has to wait for them.
  // Chained inside the last wave instead of adding a wave: it stays concurrent
  // with the snapshot and settings writes.
  const holdingsWithHistory = (async () => {
    await db.insert(holdings).values(hs);
    if (!history.holdingRows.length) return;
    await db.insert(holdingSnapshots)
      .values(history.holdingRows)
      .onConflictDoUpdate({ target: [holdingSnapshots.userId, holdingSnapshots.holdingId, holdingSnapshots.date], set: { value: holdingSnapshots.value } });
  })();

  await Promise.all([
    holdingsWithHistory,
    db.insert(snapshots)
      .values(history.snapshotRows)
      .onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: snapshots.value } }),
    history.portfolioRows.length
      ? db.insert(portfolioSnapshots)
        .values(history.portfolioRows)
        .onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: portfolioSnapshots.value } })
      : Promise.resolve(),
    ...sideWrites,
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clear = url.searchParams.get("clear");
  const jar = await cookies();
  const existing = jar.get(DEMO_COOKIE)?.value;

  if (clear) {
    if (existing) await clearDemo(demoUserId(existing));
    jar.delete(DEMO_COOKIE);
    redirect("/");
  }

  const sessionId = existing && /^[a-z0-9_]{6,64}$/i.test(existing) ? existing : newDemoSessionId();
  const userId = demoUserId(sessionId);

  jar.set(DEMO_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });

  await seedDemo(userId);

  redirect("/dashboard");
}
