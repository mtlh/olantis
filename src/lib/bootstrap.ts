import { eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
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
} from "@/lib/db/schema";
import { getLatestFxRates } from "@/lib/fx";
import { windowSeries } from "@/lib/snapshot-window";
import type { FxRates } from "@/lib/format";
import type {
  Account,
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
  /** Raw user_settings row; normalised client-side by normalizeSettings(). */
  settings: Record<string, unknown>;
  fx: { date: string | null; rates: FxRates };
};

export async function loadWorkspaceBootstrap(userId: string): Promise<WorkspaceBootstrap> {
  const db = getDb();

  // Wave 1 — every query that only needs the user id runs at once. Neon is
  // HTTP-based, so each await is a network round trip; parallelising here turns
  // eight sequential-ish trips into one.
  type AccountRow = typeof accounts.$inferSelect;
  type ProviderRow = typeof providersTable.$inferSelect;
  type PortfolioRow = typeof portfoliosTable.$inferSelect;
  type TransactionRow = typeof transactionsTable.$inferSelect;
  type SettingsRow = typeof userSettings.$inferSelect;

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
  ];
  const accountRows = typed[0];
  const providerRows = typed[1];
  const portfolioRows = typed[2];
  const totalSnapshots = typed[3];
  const perPortfolioSnapshots = typed[4];
  const perHoldingSnapshots = typed[5];
  const transactionRows = typed[6];
  const settingsRows = typed[7];

  // Wave 2 — holdings can belong to the user directly, or to one of their
  // accounts/providers/portfolios (legacy rows), so it needs the ids above.
  const portfolioIds = portfolioRows.map((p) => p.id);
  const accountIds = accountRows.map((a) => a.id);
  const providerIds = providerRows.map((p) => p.id);
  const clauses = [eq(holdingsTable.userId, userId)];
  if (portfolioIds.length) clauses.push(inArray(holdingsTable.portfolioId, portfolioIds));
  if (providerIds.length) clauses.push(inArray(holdingsTable.providerId, providerIds));
  if (accountIds.length) clauses.push(inArray(holdingsTable.accountId, accountIds));
  const holdingRows = await db.select().from(holdingsTable).where(or(...clauses));

  const liveHoldings = holdingRows.filter((h) => h.shares > 0) as unknown as Holding[];

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

  const byHolding: NonNullable<SnapResponse["byHolding"]> = {};
  for (const row of perHoldingSnapshots) {
    const entry = (byHolding[row.holdingId] ??= { symbol: "", name: "", data: [] });
    entry.data.push({ date: row.date, value: row.value });
  }
  const holdingById = new Map(holdingRows.map((h) => [h.id, h]));
  for (const [id, entry] of Object.entries(byHolding)) {
    const h = holdingById.get(id);
    if (h) {
      entry.symbol = h.symbol;
      entry.name = h.name;
    }
    entry.data = windowSeries(entry.data) as typeof entry.data;
  }

  const total: Snapshot[] = windowSeries(
    totalSnapshots.map((row) => ({ date: row.date, value: row.value }) as Snapshot),
  ) as Snapshot[];

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
    snapshots: { total, byPortfolio, byHolding },
    transactions,
    settings: (settingsRows[0] ?? {}) as Record<string, unknown>,
    fx: { date: fx.date, rates: fx.rates as FxRates },
  };
}
