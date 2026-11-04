import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { accounts, providers, portfolios, holdings, snapshots, portfolioSnapshots, holdingSnapshots, userSettings, goals, watchlistItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEMO_COOKIE, demoUserId, newDemoSessionId } from "@/lib/auth";
import { clearDemo } from "@/lib/demo-cleanup";

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

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function weeklyDates(years = 3): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - years);
  const d = new Date(start);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  while (d <= today) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  const todayKey = today.toISOString().slice(0, 10);
  if (out[out.length - 1] !== todayKey) out.push(todayKey);
  return out;
}

type SeedHolding = {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  currency: string;
  purchaseDate: string;
  exchange: string;
};

const SEED_HOLDINGS: Record<string, SeedHolding[]> = {
  p1: [
    { symbol: "VWRP", name: "Vanguard FTSE All-World", shares: 120, avgPrice: 98, currentPrice: 106.4, currency: "GBP", purchaseDate: "2024-01-15", exchange: "LSE" },
    { symbol: "AAPL", name: "Apple Inc", shares: 15, avgPrice: 145, currentPrice: 178, currency: "USD", purchaseDate: "2024-03-10", exchange: "NASDAQ" },
    { symbol: "NVDA", name: "NVIDIA", shares: 8, avgPrice: 420, currentPrice: 485, currency: "USD", purchaseDate: "2024-05-20", exchange: "NASDAQ" },
  ],
  p2: [
    { symbol: "VUAG", name: "Vanguard S&P 500", shares: 200, avgPrice: 68, currentPrice: 74.2, currency: "GBP", purchaseDate: "2023-11-01", exchange: "LSE" },
  ],
  p3: [
    { symbol: "VWCE", name: "Vanguard FTSE All-World Acc", shares: 85, avgPrice: 95, currentPrice: 102.3, currency: "GBP", purchaseDate: "2024-02-10", exchange: "LSE" },
  ],
};

/**
 * Build a predefined weekly price series for a symbol. Deterministic: the same
 * symbol always yields the same curve, starting at a derived entry price and
 * ending exactly at `currentPrice` with no discontinuity.
 */
function predefinedSeries(h: SeedHolding, dates: string[]): number[] {
  const rnd = mulberry32(hashString(h.symbol));
  const n = dates.length;
  const target = h.currentPrice;
  if (n <= 1) return [target];

  // Deterministic entry price, a little below today's price.
  const start = target * (0.8 + rnd() * 0.14);

  // Cumulative random walk, then detrended so it ends at exactly 0.
  const walk = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) walk[i] = walk[i - 1] + (rnd() - 0.5) * 0.036;
  const endWalk = walk[n - 1];

  const path = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const baseline = start + (target - start) * t;
    const noise = walk[i] - endWalk * t; // zero at both ends
    path[i] = Math.max(baseline * (1 + noise), target * 0.35);
  }
  path[0] = start;
  path[n - 1] = target;
  return path;
}

/** Two deterministic drawdowns so the demo chart looks like a real market. */
function marketFactor(idx: number, n: number): number {
  const c1 = Math.floor(n * 0.32);
  const c2 = Math.floor(n * 0.7);
  let f = 1;
  const s1 = c1 - 7, b1 = c1 + 2, e1 = c1 + 18, d1 = 0.19;
  if (idx >= s1 && idx <= e1) {
    f = idx <= b1 ? 1 - d1 * ((idx - s1) / (b1 - s1)) : 1 - d1 * (1 - (idx - b1) / (e1 - b1));
  }
  const s2 = c2 - 8, b2 = c2 + 3, e2 = c2 + 20, d2 = 0.22;
  if (idx >= s2 && idx <= e2) {
    const f2 = idx <= b2 ? 1 - d2 * ((idx - s2) / (b2 - s2)) : 1 - d2 * (1 - (idx - b2) / (e2 - b2));
    f = Math.min(f, f2);
  }
  return f;
}

async function seedDemo(userId: string) {
  const db = getDb();

  // Fast path for returning demo visitors: one cheap query decides whether the
  // tenant already exists, instead of re-checking goals, watchlist and
  // portfolios on every click of "Try the demo".
  const existing = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.userId, userId));
  if (existing.length > 0) return;

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
  const accHousehold: typeof accounts.$inferInsert = { id: crypto.randomUUID(), userId, name: "Household", createdAt: now };
  const accPersonal: typeof accounts.$inferInsert = { id: crypto.randomUUID(), userId, name: "Personal", createdAt: now };

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

  // Predefined history — deterministic, no network. Built before any insert so
  // the writes can be batched instead of run one after another.
  const dates = weeklyDates(3);
  const n = dates.length;
  const seriesBySymbol = new Map<string, number[]>();
  for (const h of hs) {
    const raw = predefinedSeries(h as SeedHolding, dates);
    const scaled = raw.map((v, i) => v * marketFactor(i, n));
    seriesBySymbol.set(h.symbol, scaled);
  }

  const snapRows = dates.map((date, i) => {
    let total = 0;
    const byPort = new Map<string, number>();
    for (const h of hs) {
      const v = (seriesBySymbol.get(h.symbol)?.[i] ?? h.currentPrice ?? 0) * (h.shares ?? 0);
      total += v;
      byPort.set(h.portfolioId!, (byPort.get(h.portfolioId!) ?? 0) + v);
    }
    return { date, total, byPort };
  });
  const portRows = snapRows.flatMap((r) => [...r.byPort].map(([pid, val]) => ({ userId, portfolioId: pid, date: r.date, value: val })));
  // Per-holding history too: the holding view charts its own value series and
  // only falls back to market price when there are fewer than two points.
  // Without this a fresh demo tenant has only the cron/client rows for today.
  const holdingRows = dates.flatMap((date, i) =>
    hs.map((h) => ({
      userId,
      holdingId: h.id!,
      date,
      value: (seriesBySymbol.get(h.symbol)?.[i] ?? h.currentPrice ?? 0) * (h.shares ?? 0),
    })),
  );

  // Side rows don't depend on the account tree, so start them immediately and
  // let the four dependent waves below run in the foreground.
  const sideWrites: Promise<unknown>[] = [];
  if (existingGoals.length === 0) {
    const targetDate = new Date();
    targetDate.setUTCFullYear(targetDate.getUTCFullYear() + 2);
    sideWrites.push(db.insert(goals).values({
      id: crypto.randomUUID(),
      userId,
      name: "Build a £50,000 portfolio",
      targetValue: 50000,
      targetDate: targetDate.toISOString().slice(0, 10),
      createdAt: now,
    }));
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
    if (!holdingRows.length) return;
    await db.insert(holdingSnapshots)
      .values(holdingRows)
      .onConflictDoUpdate({ target: [holdingSnapshots.userId, holdingSnapshots.holdingId, holdingSnapshots.date], set: { value: holdingSnapshots.value } });
  })();

  await Promise.all([
    holdingsWithHistory,
    db.insert(snapshots)
      .values(snapRows.map((r) => ({ userId, date: r.date, value: r.total })))
      .onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: snapshots.value } }),
    portRows.length
      ? db.insert(portfolioSnapshots)
        .values(portRows)
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
