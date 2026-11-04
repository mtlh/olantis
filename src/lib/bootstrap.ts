import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ownedHoldingsQuery } from "@/lib/ownership";
import {
  accounts,
  holdings as holdingsTable,
  portfolioSnapshots,
  portfolios as portfoliosTable,
  providers as providersTable,
  snapshots as snapshotsTable,
  holdingSnapshots,
  transactions as transactionsTable,
  userSettings,
  goals as goalsTable,
} from "@/lib/db/schema";
import { getLatestFxRates } from "@/lib/fx";
import { windowSeries } from "@/lib/snapshot-window";
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
 * Everything the workspace shell needs for its first paint, resolved on the
 * server in one request. The dashboard previously booted with eight parallel
 * client fetches after hydration (accounts, providers, portfolios, holdings,
 * snapshots, transactions, settings, fx — plus duplicates), which put every
 * meaningful pixel behind a JS download *and* a network round trip. Loading it
 * here means the first HTML response already contains the numbers, the sidebar
 * and the holdings table.
 */
export type WorkspaceBootstrap = {
  accounts: Account[];
  providers: Provider[];
  portfolios: Portfolio[];
  holdings: Holding[];
  snapshots: SnapResponse;
  transactions: Transaction[];
  /** First paint of /goals needs the saved goal, or the layout jumps once /api/goals resolves. */
  goals: Goal[];
  /** Raw user_settings row; normalised client-side by normalizeSettings(). */
  settings: Record<string, unknown>;
  fx: { date: string | null; rates: FxRates };
  /** True when `snapshots` already holds today's row (see store's type). */
  snapshotsFresh: boolean;
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
  type TransactionRow = typeof transactionsTable.$inferSelect;
  type SettingsRow = typeof userSettings.$inferSelect;
  type GoalRow = typeof goalsTable.$inferSelect;
  type HoldingRow = typeof holdingsTable.$inferSelect;

  const [batchRes, fx] = await Promise.all([
    db.batch([
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      db.select().from(providersTable).where(eq(providersTable.userId, userId)),
      db.select().from(portfoliosTable).where(eq(portfoliosTable.userId, userId)),
      db.select({ date: snapshotsTable.date, value: snapshotsTable.value }).from(snapshotsTable).where(eq(snapshotsTable.userId, userId)),
      db.select({ portfolioId: portfolioSnapshots.portfolioId, date: portfolioSnapshots.date, value: portfolioSnapshots.value }).from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId)),
      db.select({ holdingId: holdingSnapshots.holdingId, date: holdingSnapshots.date, value: holdingSnapshots.value }).from(holdingSnapshots).where(eq(holdingSnapshots.userId, userId)),
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
      db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
      ownedHoldingsQuery(db, userId),
    ]),
    getLatestFxRates().catch(() => ({ date: null, rates: {} as FxRates })),
  ]);
  const typed = batchRes as unknown as [
    AccountRow[],
    ProviderRow[],
    PortfolioRow[],
    { date: string; value: number }[],
    { portfolioId: string; date: string; value: number }[],
    { holdingId: string; date: string; value: number }[],
    TransactionRow[],
    SettingsRow[],
    GoalRow[],
    HoldingRow[],
  ];
  const accountRows = typed[0];
  const providerRows = typed[1];
  const portfolioRows = typed[2];
  const totalSnapshots = typed[3];
  const perPortfolioSnapshots = typed[4];
  const perHoldingSnapshots = typed[5];
  const transactionRows = typed[6];
  const settingsRows = typed[7];
  const goalRows = typed[8];
  // Already restricted to `shares > 0` by the query, so no second filter pass.
  const holdingRows = typed[9];

  const liveHoldings = holdingRows as unknown as Holding[];

  const holdingsByPortfolio = new Map<string, Holding[]>();
  for (const h of liveHoldings) {
    if (!h.portfolioId) continue;
    const list = holdingsByPortfolio.get(h.portfolioId) ?? [];
    list.push(h);
    holdingsByPortfolio.set(h.portfolioId, list);
  }

  const byPortfolio: SnapResponse["byPortfolio"] = {};
  for (const row of perPortfolioSnapshots) {
    const entry = (byPortfolio[row.portfolioId] ??= { name: "", data: [] });
    entry.data.push({ date: row.date, value: row.value });
  }
  const portfolioNameById = new Map(portfolioRows.map((p) => [p.id, p.name]));
  for (const [id, entry] of Object.entries(byPortfolio)) {
    entry.name = portfolioNameById.get(id) ?? id.slice(0, 6);
    entry.data = windowSeries(entry.data) as typeof entry.data;
  }

  // Per-holding history is the bulk of this payload — one long series per
  // holding. The dashboard only needs two things from it: the strongest/weakest
  // movers (four numbers per holding, so compute those here) and the combined
  // account/provider history, which is built from portfolio series plus the
  // series of *direct* holdings (no portfolioId). So only those direct holdings
  // keep a series; everything else is reduced to moverChanges.
  const holdingById = new Map(holdingRows.map((h) => [h.id, h]));
  const fxRates = { ...DEFAULT_FX_RATES, ...fx.rates } as FxRates;
  const allByHolding: NonNullable<SnapResponse["byHolding"]> = {};
  for (const row of perHoldingSnapshots) {
    const entry = (allByHolding[row.holdingId] ??= { symbol: "", name: "", data: [] });
    entry.data.push({ date: row.date, value: row.value });
  }
  const byHolding: NonNullable<SnapResponse["byHolding"]> = {};
  const moverChanges: NonNullable<SnapResponse["moverChanges"]> = {};
  for (const [id, entry] of Object.entries(allByHolding)) {
    const h = holdingById.get(id);
    entry.data = windowSeries(entry.data) as typeof entry.data;
    if (!h || !(h.shares > 0)) continue;
    entry.symbol = h.symbol;
    entry.name = h.name;
    if (!h.portfolioId) byHolding[id] = entry;
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

  const transactions = transactionRows
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt) as unknown as Transaction[];

  return {
    accounts: accountRows as unknown as Account[],
    providers: providerRows as unknown as Provider[],
    portfolios: portfolioRows.map((p) => ({
      ...p,
      holdings: holdingsByPortfolio.get(p.id) ?? [],
    })) as unknown as Portfolio[],
    holdings: liveHoldings,
    snapshots: { total, byPortfolio, byHolding, moverChanges },
    transactions,
    goals: goalRows as unknown as Goal[],
    settings: (settingsRows[0] ?? {}) as Record<string, unknown>,
    fx: { date: fx.date, rates: fx.rates as FxRates },
    snapshotsFresh,
  };
}
