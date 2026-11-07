import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ownedHoldingsQuery } from "@/lib/ownership";
import {
  accounts,
  type holdings as holdingsTable,
  portfolios as portfoliosTable,
  providers as providersTable,
  snapshots as snapshotsTable,
  holdingSnapshots,
  userSettings,
} from "@/lib/db/schema";
import { getLatestFxRates } from "@/lib/fx";
import { windowSeries } from "@/lib/snapshot-window";
import { isDemoUserId } from "@/lib/auth";
import { pointsByHolding as countPointsByHolding, topUpDemoHistory } from "@/lib/demo-history-store";
import { DEFAULT_FX_RATES, holdingValueGBP, valueChangeOverRange, todayISODate, type FxRates } from "@/lib/format";
import type {
  Account,
  Goal,
  Holding,
  Portfolio,
  Provider,
  SnapResponse,
  Snapshot,
  Transaction,
} from "@/lib/store";

/**
 * First-paint workspace data, resolved on the server inside a Suspense
 * boundary (see AuthenticatedDashboardLayout) so the shell streams instantly.
 * The payload is trimmed for FCP: accounts/providers/portfolios/holdings,
 * settings, fx, the windowed total series and precomputed moverChanges travel
 * in the first HTML. Full per-portfolio / per-holding history, transactions
 * and goals are fetched client-side after paint via the existing /api routes.
 */
export type WorkspaceBootstrap = {
  accounts: Account[];
  providers: Provider[];
  portfolios: Portfolio[];
  holdings: Holding[];
  snapshots: SnapResponse;
  /**
   * Deferred to a client fetch after paint (see /api/transactions). Absent from
   * the first payload so FCP does not wait on the ledger scan; useTransactions
   * fetches it when undefined.
   */
  transactions?: Transaction[];
  /**
   * Deferred to a client fetch after paint (see /api/goals). GoalPanel and
   * DashboardGoalCard fetch when undefined, so the first paint skips this read.
   */
  goals?: Goal[];
  /** Raw user_settings row; normalised client-side by normalizeSettings(). */
  settings: Record<string, unknown>;
  fx: { date: string | null; rates: FxRates };
  /** True when `snapshots` already holds today's row (see store's type). */
  snapshotsFresh: boolean;
  /**
   * True when `snapshots.byPortfolio` / `byHolding` were omitted from the first
   * payload. useSnapshots fetches the full series via /api/snapshots after
   * paint, so charts and account/provider history fill in without blocking FCP.
   */
  snapshotsDeferred?: boolean;
};

export async function loadWorkspaceBootstrap(userId: string): Promise<WorkspaceBootstrap> {
  const db = getDb();

  // One wave, one round trip. Neon is HTTP-based, so each await is a network
  // round trip; holdings used to need a *second* wave because its ownership
  // predicate was built from the account/provider/portfolio ids from the first.
  // `ownedHoldingsQuery` expresses that as `IN (subquery)` instead, so every
  // read the workspace needs now travels in a single `db.batch()`.
  type AccountRow = typeof accounts.$inferSelect;
  type ProviderRow = typeof providersTable.$inferSelect;
  type PortfolioRow = typeof portfoliosTable.$inferSelect;
  type SettingsRow = typeof userSettings.$inferSelect;
  type HoldingRow = typeof holdingsTable.$inferSelect;

  // First-paint payload only: accounts/providers/portfolios/holdings/settings
  // + windowed total series + moverChanges. Deferred to client fetch after
  // paint (smaller first HTML, fewer Neon round trips before streaming):
  // - byPortfolio full series -> /api/snapshots (useSnapshots refresh)
  // - byHolding full series -> /api/snapshots or ?holdingId= (on demand)
  // - transactions -> /api/transactions (useTransactions refresh)
  // - goals -> /api/goals (GoalPanel / DashboardGoalCard fetch)
  const [batchRes, fx] = await Promise.all([
    db.batch([
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      db.select().from(providersTable).where(eq(providersTable.userId, userId)),
      db.select().from(portfoliosTable).where(eq(portfoliosTable.userId, userId)),
      db.select({ date: snapshotsTable.date, value: snapshotsTable.value }).from(snapshotsTable).where(eq(snapshotsTable.userId, userId)),
      db.select({ holdingId: holdingSnapshots.holdingId, date: holdingSnapshots.date, value: holdingSnapshots.value }).from(holdingSnapshots).where(eq(holdingSnapshots.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      ownedHoldingsQuery(db, userId),
    ]),
    getLatestFxRates().catch(() => ({ date: null, rates: {} as FxRates })),
  ]);
  const typed = batchRes as unknown as [
    AccountRow[],
    ProviderRow[],
    PortfolioRow[],
    { date: string; value: number }[],
    { holdingId: string; date: string; value: number }[],
    SettingsRow[],
    HoldingRow[],
  ];
  const accountRows = typed[0];
  const providerRows = typed[1];
  const portfolioRows = typed[2];
  const totalSnapshots = typed[3];
  let perHoldingSnapshots = typed[4];
  const settingsRows = typed[5];
  // Already restricted to `shares > 0` by the query, so no second filter pass.
  const holdingRows = typed[6];

  const liveHoldings = holdingRows as unknown as Holding[];

  // A demo tenant minted by an older build has no per-holding series (only the
  // latest day or two). Repair it here as well as in `/api/demo`, because a
  // visitor can open /dashboard directly with a cookie from a previous session
  // and never hit the seeding endpoint. Demo-only and idempotent: a complete
  // tenant costs one pass over rows we have already loaded.
  if (isDemoUserId(userId)) {
    const repaired = await topUpDemoHistory(
      userId,
      liveHoldings.map((h) => ({
        id: h.id,
        symbol: h.symbol,
        shares: h.shares,
        currentPrice: h.currentPrice,
        portfolioId: h.portfolioId ?? null,
      })),
      countPointsByHolding(perHoldingSnapshots),
    ).catch(() => false);
    if (repaired) {
      // Re-read only in the rare repair case, so the movers on the very first
      // paint already reflect the full series instead of the stale one.
      perHoldingSnapshots = await db
        .select({ holdingId: holdingSnapshots.holdingId, date: holdingSnapshots.date, value: holdingSnapshots.value })
        .from(holdingSnapshots)
        .where(eq(holdingSnapshots.userId, userId));
    }
  }

  const holdingsByPortfolio = new Map<string, Holding[]>();
  for (const h of liveHoldings) {
    if (!h.portfolioId) continue;
    const list = holdingsByPortfolio.get(h.portfolioId) ?? [];
    list.push(h);
    holdingsByPortfolio.set(h.portfolioId, list);
  }

  // Per-holding history is the bulk of the old payload — one long series per
  // holding. The first paint only needs the strongest/weakest movers (four
  // numbers per holding), so reduce every series to moverChanges here and drop
  // the series themselves. Full byPortfolio/byHolding history arrives via
  // /api/snapshots after paint (see snapshotsDeferred below).
  const holdingById = new Map(holdingRows.map((h) => [h.id, h]));
  const fxRates = { ...DEFAULT_FX_RATES, ...fx.rates } as FxRates;
  const allByHolding: NonNullable<SnapResponse["byHolding"]> = {};
  for (const row of perHoldingSnapshots) {
    const entry = (allByHolding[row.holdingId] ??= { symbol: "", name: "", data: [] });
    entry.data.push({ date: row.date, value: row.value });
  }
  const moverChanges: NonNullable<SnapResponse["moverChanges"]> = {};
  for (const [id, entry] of Object.entries(allByHolding)) {
    const h = holdingById.get(id);
    entry.data = windowSeries(entry.data) as typeof entry.data;
    if (!h || !(h.shares > 0)) continue;
    entry.symbol = h.symbol;
    entry.name = h.name;
    const currentValue = holdingValueGBP(h, fxRates);
    moverChanges[id] = {
      change1M: valueChangeOverRange(entry.data, "1M", currentValue),
      change3M: valueChangeOverRange(entry.data, "3M", currentValue),
      change1Y: valueChangeOverRange(entry.data, "1Y", currentValue),
      changeMax: valueChangeOverRange(entry.data, "MAX", currentValue),
    };
  }

  const total: Snapshot[] = windowSeries(
    totalSnapshots.map((row) => ({ date: row.date, value: row.value }) as Snapshot),
  ) as Snapshot[];

  const today = todayISODate();
  const snapshotsFresh = totalSnapshots.some((row) => row.date === today);

  return {
    accounts: accountRows as unknown as Account[],
    providers: providerRows as unknown as Provider[],
    portfolios: portfolioRows.map((p) => ({
      ...p,
      holdings: holdingsByPortfolio.get(p.id) ?? [],
    })) as unknown as Portfolio[],
    holdings: liveHoldings,
    snapshots: { total, byPortfolio: {}, moverChanges },
    settings: (settingsRows[0] ?? {}) as Record<string, unknown>,
    fx: { date: fx.date, rates: fx.rates as FxRates },
    snapshotsFresh,
    snapshotsDeferred: true,
  };
}
