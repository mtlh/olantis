import { and, eq, isNotNull, isNull, notLike, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { holdings, holdingSnapshots, portfolioSnapshots, portfolios, snapshots, transactions } from "@/lib/db/schema";
import { DEFAULT_FX_RATES, holdingCurrency, holdingValueGBP, isCashSymbol, isListedSymbol, type FxRates } from "@/lib/format";
import { earliestFxDates, getFxRateSeries, getLatestFxRates, importFxHistory } from "@/lib/fx";
import { loadOwnedHoldings } from "@/lib/ownership";
import { fetchDailyHistory } from "@/lib/yahoo";
import {
  addDays,
  aggregateValueSeries,
  buildConstantValueSeries,
  buildMarketValueSeries,
  buildSharesTimeline,
  downsampleForStorage,
  isoDay,
  type DatedRate,
  type DatedValue,
  type LedgerEntry,
} from "@/lib/backfill-series";

/**
 * Reconstruct portfolio history from the data we already hold.
 *
 * For every holding with a purchase date (or a transaction ledger) this builds a
 * GBP value series from the earliest known date to yesterday, at the close of
 * each trading day, then rebuilds the portfolio and account totals from all
 * holding series. Price history comes from Yahoo, FX history from frankfurter.
 *
 * Recorded snapshots (cron, client POST, demo seed) are never touched: backfill
 * rows carry `origin = 'backfilled'` and are the only ones this module deletes.
 */

export const BACKFILL_MAX_YEARS = 15;
const DEFAULT_BATCH = 12;
const MAX_ATTEMPTS = 3;
const INSERT_CHUNK = 400;

type HoldingRow = typeof holdings.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

export type BackfillSummary = {
  holdingsBackfilled: number;
  holdingsSkipped: number;
  holdingsFailed: number;
  /** Holdings for this user still waiting for a backfill. */
  pending: number;
};

const EMPTY: BackfillSummary = { holdingsBackfilled: 0, holdingsSkipped: 0, holdingsFailed: 0, pending: 0 };

function yesterdayUTC(now: Date): string {
  return new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
}

function ledgerFor(holding: HoldingRow, rows: readonly TransactionRow[]): LedgerEntry[] {
  return rows
    .filter(
      (t) =>
        t.holdingId === holding.id ||
        (!t.holdingId && t.symbol === holding.symbol && (t.portfolioId ?? null) === (holding.portfolioId ?? null)),
    )
    .map((t) => ({ type: t.type, shares: t.shares, date: t.date, createdAt: t.createdAt }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

async function replaceHoldingSeries(userId: string, holdingId: string, series: readonly DatedValue[]) {
  await clearHoldingSeries(userId, holdingId);
  const db = getDb();
  for (let i = 0; i < series.length; i += INSERT_CHUNK) {
    const chunk = series.slice(i, i + INSERT_CHUNK);
    await db
      .insert(holdingSnapshots)
      .values(chunk.map((point) => ({ userId, holdingId, date: point.date, value: point.value, origin: "backfilled" })))
      .onConflictDoNothing();
  }
}

/** Remove only the reconstructed rows for one holding (recorded rows stay). */
async function clearHoldingSeries(userId: string, holdingId: string) {
  const db = getDb();
  await db
    .delete(holdingSnapshots)
    .where(
      and(
        eq(holdingSnapshots.userId, userId),
        eq(holdingSnapshots.holdingId, holdingId),
        eq(holdingSnapshots.origin, "backfilled"),
      ),
    );
}

/**
 * Rebuild portfolio and account totals from every holding series (recorded and
 * backfilled alike). Only `origin = 'backfilled'` aggregate rows are replaced;
 * recorded rows win any date collision.
 */
async function rebuildAggregates(
  userId: string,
  allHoldings: readonly HoldingRow[],
  endDate: string,
  now: number,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ holdingId: holdingSnapshots.holdingId, date: holdingSnapshots.date, value: holdingSnapshots.value })
    .from(holdingSnapshots)
    .where(eq(holdingSnapshots.userId, userId));

  const seriesByHolding = new Map<string, DatedValue[]>();
  for (const row of rows) {
    const list = seriesByHolding.get(row.holdingId) ?? [];
    list.push({ date: row.date, value: row.value });
    seriesByHolding.set(row.holdingId, list);
  }

  const portfolioByHolding = new Map(allHoldings.map((h) => [h.id, h.portfolioId ?? null]));
  const totalParts: DatedValue[][] = [];
  const portfolioParts = new Map<string, DatedValue[][]>();

  for (const [holdingId, series] of seriesByHolding) {
    if (!series.length) continue;
    totalParts.push(series);
    const portfolioId = portfolioByHolding.get(holdingId);
    if (!portfolioId) continue;
    const parts = portfolioParts.get(portfolioId) ?? [];
    parts.push(series);
    portfolioParts.set(portfolioId, parts);
  }

  const totalSeries = downsampleForStorage(aggregateValueSeries(totalParts), { now, endDate });
  const perPortfolio = [...portfolioParts.entries()].map(([portfolioId, parts]) => ({
    portfolioId,
    series: downsampleForStorage(aggregateValueSeries(parts), { now, endDate }),
  }));

  await db.delete(snapshots).where(and(eq(snapshots.userId, userId), eq(snapshots.origin, "backfilled")));
  await db
    .delete(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.origin, "backfilled")));

  for (let i = 0; i < totalSeries.length; i += INSERT_CHUNK) {
    const chunk = totalSeries.slice(i, i + INSERT_CHUNK);
    await db
      .insert(snapshots)
      .values(chunk.map((point) => ({ userId, date: point.date, value: point.value, origin: "backfilled" })))
      .onConflictDoNothing();
  }

  for (const { portfolioId, series } of perPortfolio) {
    for (let i = 0; i < series.length; i += INSERT_CHUNK) {
      const chunk = series.slice(i, i + INSERT_CHUNK);
      await db
        .insert(portfolioSnapshots)
        .values(chunk.map((point) => ({ userId, portfolioId, date: point.date, value: point.value, origin: "backfilled" })))
        .onConflictDoNothing();
    }
  }
}

type HoldingUpdate = {
  id: string;
  backfilledAt: number | null;
  attempts: number;
  error: string | null;
};

async function applyHoldingUpdates(updates: readonly HoldingUpdate[]) {
  if (!updates.length) return;
  const db = getDb();
  const values = updates.map(
    (u) => sql`(${u.id}::text, ${u.backfilledAt}::integer, ${u.attempts}::integer, ${u.error}::text)`,
  );
  await db.execute(sql`
    UPDATE holdings SET
      history_backfilled_at = v.backfilled_at,
      history_backfill_attempts = v.attempts,
      history_backfill_error = v.error
    FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, backfilled_at, attempts, error)
    WHERE holdings.id = v.id
  `);
}

/**
 * Backfill one user's missing history. Safe to call repeatedly: completed
 * holdings are skipped and recorded rows are never overwritten.
 */
export async function backfillUserHistory(userId: string, opts?: { limit?: number; now?: Date }): Promise<BackfillSummary> {
  if (!userId || userId.startsWith("demo:")) return EMPTY;

  const db = getDb();
  const now = opts?.now ?? new Date();
  const nowUnix = Math.floor(now.getTime() / 1000);
  const today = now.toISOString().slice(0, 10);
  const endDate = yesterdayUTC(now);
  const limit = Math.max(1, opts?.limit ?? DEFAULT_BATCH);

  const [allHoldings, portfolioRows, txRows, latestFx] = await Promise.all([
    loadOwnedHoldings(db, userId, { includeEmpty: true }),
    db.select({ id: portfolios.id, type: portfolios.type }).from(portfolios).where(eq(portfolios.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    getLatestFxRates().catch(() => ({ date: null, rates: {} as FxRates })),
  ]);

  const manualPortfolioIds = new Set(portfolioRows.filter((p) => p.type === "manual").map((p) => p.id));
  const pending = allHoldings
    .filter((h) => h.historyBackfilledAt == null)
    .sort((a, b) => (isoDay(a.purchaseDate) ?? "9999").localeCompare(isoDay(b.purchaseDate) ?? "9999"));

  const batch = pending.slice(0, limit);
  const currentFx: FxRates = { ...DEFAULT_FX_RATES, ...latestFx.rates };
  const isConstantHolding = (h: HoldingRow) =>
    (h.portfolioId != null && manualPortfolioIds.has(h.portfolioId)) || isCashSymbol(h.symbol) || !isListedSymbol(h.symbol);

  // One FX window for every market holding in this batch, so we import at most
  // one range instead of one request per holding.
  const marketHoldings = batch.filter((h) => !isConstantHolding(h));
  const currencies = [...new Set(marketHoldings.map((h) => holdingCurrency(h)))];
  const rangeStart = marketHoldings
    .map((h) => isoDay(h.purchaseDate) ?? isoDay(ledgerFor(h, txRows)[0]?.date ?? null))
    .filter((d): d is string => !!d)
    .sort()[0];
  const floor = addDays(today, -Math.round(365.25 * BACKFILL_MAX_YEARS));

  let ratesByCurrency = new Map<string, DatedRate[]>();
  if (currencies.length && rangeStart) {
    try {
      const from = rangeStart > floor ? rangeStart : floor;
      const earliest = await earliestFxDates(currencies);
      const missing = currencies.filter(
        (code) =>
          !["GBP", "GBX"].includes(code.toUpperCase()) &&
          (!earliest.get(code.toUpperCase()) || earliest.get(code.toUpperCase())! > from),
      );
      if (missing.length) await importFxHistory(from, today, missing);
      ratesByCurrency = await getFxRateSeries(currencies);
    } catch {
      // FX history is best-effort: as-of lookups fall back to the latest rate.
      ratesByCurrency = await getFxRateSeries(currencies).catch(() => new Map());
    }
  }

  let backfilled = 0;
  let skipped = 0;
  let failed = 0;
  let purged = 0;
  const updates: HoldingUpdate[] = [];

  for (const holding of batch) {
    const attempts = (holding.historyBackfillAttempts ?? 0) + 1;
    const timeline = buildSharesTimeline({
      currentShares: holding.shares,
      purchaseDate: holding.purchaseDate,
      transactions: ledgerFor(holding, txRows),
    });

    if (!timeline || timeline[0].date > endDate) {
      // Nothing can be placed on a timeline (e.g. shares were zeroed or the
      // purchase date was cleared): drop any rows an earlier run created.
      await clearHoldingSeries(userId, holding.id);
      updates.push({ id: holding.id, backfilledAt: nowUnix, attempts: 0, error: null });
      skipped++;
      purged++;
      continue;
    }

    let series: DatedValue[];
    if (isConstantHolding(holding)) {
      const perShare = holding.shares > 0 ? holdingValueGBP(holding, currentFx) / holding.shares : 1;
      series = buildConstantValueSeries({ sharesTimeline: timeline, gbpPerShare: perShare, endDate });
    } else {
      const start = timeline[0].date;
      const from = start > floor ? start : floor;
      const currency = holdingCurrency(holding);
      const prices = await fetchDailyHistory(holding.symbol, holding.exchange, from, today);
      if (!prices.length) {
        const giveUp = attempts >= MAX_ATTEMPTS;
        updates.push({
          id: holding.id,
          backfilledAt: giveUp ? nowUnix : null,
          attempts: giveUp ? 0 : attempts,
          error: `No price history for ${holding.symbol}`,
        });
        failed++;
        continue;
      }
      const code = currency.toUpperCase();
      series = buildMarketValueSeries({
        sharesTimeline: timeline,
        prices,
        currency,
        rates: ratesByCurrency.get(code) ?? [],
        fallbackRate: currentFx[code] ?? 1,
        endDate,
      });
    }

    series = downsampleForStorage(series, { now: now.getTime(), endDate });
    if (!series.length) {
      await clearHoldingSeries(userId, holding.id);
      updates.push({ id: holding.id, backfilledAt: nowUnix, attempts: 0, error: null });
      skipped++;
      purged++;
      continue;
    }

    await replaceHoldingSeries(userId, holding.id, series);
    updates.push({ id: holding.id, backfilledAt: nowUnix, attempts: 0, error: null });
    backfilled++;
  }

  await applyHoldingUpdates(updates);
  if (backfilled > 0 || purged > 0) await rebuildAggregates(userId, allHoldings, endDate, now.getTime());

  const resolved = updates.filter((u) => u.backfilledAt != null).length;
  return {
    holdingsBackfilled: backfilled,
    holdingsSkipped: skipped,
    holdingsFailed: failed,
    pending: Math.max(0, pending.length - resolved),
  };
}

/**
 * Recompute totals after a holding is deleted or moved. Holding rows cascade on
 * delete, so the aggregate series must be rebuilt from what remains.
 */
export async function refreshAggregatesForUser(userId: string, now = new Date()): Promise<void> {
  if (!userId || userId.startsWith("demo:")) return;
  const db = getDb();
  const allHoldings = await loadOwnedHoldings(db, userId, { includeEmpty: true });
  await rebuildAggregates(userId, allHoldings, yesterdayUTC(now), now.getTime());
}

/**
 * Cron backstop: pick the oldest pending holdings across all real users, so a
 * failed or interrupted on-demand run completes within a day. Bounded per tick
 * because the cron function runs under the platform's timeout.
 */
export async function backfillPending(
  opts?: { limit?: number; now?: Date },
): Promise<{ users: number; holdingsBackfilled: number; holdingsFailed: number; pending: number }> {
  const db = getDb();
  const limit = Math.max(1, opts?.limit ?? 5);
  const rows = await db
    .select({ id: holdings.id, userId: holdings.userId })
    .from(holdings)
    .where(
      and(
        isNull(holdings.historyBackfilledAt),
        isNotNull(holdings.userId),
        notLike(holdings.userId, "demo:%"),
        isNotNull(holdings.purchaseDate),
      ),
    )
    .orderBy(holdings.purchaseDate)
    .limit(limit);

  const byUser = new Map<string, number>();
  for (const row of rows) {
    if (!row.userId) continue;
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + 1);
  }

  let holdingsBackfilled = 0;
  let holdingsFailed = 0;
  let pending = 0;
  for (const [userId, count] of byUser) {
    try {
      const summary = await backfillUserHistory(userId, { limit: count, now: opts?.now });
      holdingsBackfilled += summary.holdingsBackfilled;
      holdingsFailed += summary.holdingsFailed;
      pending += summary.pending;
    } catch {
      // Keep the cron tick alive; the next run retries.
    }
  }
  return { users: byUser.size, holdingsBackfilled, holdingsFailed, pending };
}
