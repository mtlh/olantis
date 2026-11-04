/**
 * Pure series maths for portfolio history backfill.
 *
 * Deliberately dependency-free (no `@/` imports, no network) so the node test
 * runner can load it directly with `--experimental-strip-types`.
 *
 * Semantics mirror the live snapshot pipeline:
 *  - a holding's value is `shares * price` converted to GBP;
 *  - aggregates are the sum of each holding's last known value (carry-forward);
 *  - points older than the read window are stored weekly (daily near the end).
 */

export type DatedValue = { date: string; value: number };
export type DatedShares = { date: string; shares: number };
export type DatedPrice = { date: string; price: number };
export type DatedRate = { date: string; rate: number };

export type LedgerEntry = {
  type: string;
  shares: number;
  date: string;
  createdAt?: number | null;
};

const EPS = 1e-6;

/** Validates an ISO calendar day (`YYYY-MM-DD`) and normalises `datetime` input to its day. */
export function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : day;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO week identifier (Monday-based), used to downsample old points. */
export function isoWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - mondayOffset * 86400000).toISOString().slice(0, 10);
}

/**
 * Reconstruct a position's share count over time.
 *
 * The ledger is reconciled against today's position with an opening balance:
 * `opening = currentShares - net(ledger)`, so imported positions with a single
 * `purchaseDate` and later trades still line up with the holding row. When the
 * ledger contradicts the current position (opening would be negative) we fall
 * back to assuming today's position was held constant since `purchaseDate`.
 *
 * Returns `null` when there is nothing that can be placed on a timeline.
 */
export function buildSharesTimeline(params: {
  currentShares: number;
  purchaseDate?: string | null;
  transactions: LedgerEntry[];
}): DatedShares[] | null {
  const { currentShares } = params;
  if (!Number.isFinite(currentShares) || currentShares < -EPS) return null;

  const purchase = isoDay(params.purchaseDate);
  const ledger = params.transactions
    .filter((t) => (t.type === "buy" || t.type === "sell") && Number.isFinite(t.shares) && t.shares > 0 && isoDay(t.date))
    .map((t) => ({ ...t, date: isoDay(t.date)! }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));

  const firstTrade = ledger[0]?.date ?? null;
  const start = purchase && firstTrade ? (purchase < firstTrade ? purchase : firstTrade) : (purchase ?? firstTrade);
  if (!start) return null;

  if (!ledger.length) {
    // Imported position: constant since purchase. A zero position has no history.
    return currentShares > EPS ? [{ date: start, shares: currentShares }] : null;
  }

  const net = ledger.reduce((sum, t) => sum + (t.type === "buy" ? t.shares : -t.shares), 0);
  let opening = currentShares - net;

  if (opening < -EPS) {
    // Ledger sells more than the position ever held: trust the position row.
    opening = currentShares;
    return currentShares > EPS ? [{ date: start, shares: currentShares }] : null;
  }

  const deltas = new Map<string, number>();
  for (const t of ledger) {
    const delta = t.type === "buy" ? t.shares : -t.shares;
    deltas.set(t.date, (deltas.get(t.date) ?? 0) + delta);
  }

  const points = new Map<string, number>();
  let shares = Math.max(0, opening);
  points.set(start, shares);
  for (const date of [...deltas.keys()].sort()) {
    if (date < start) continue;
    shares = Math.max(0, shares + (deltas.get(date) ?? 0));
    points.set(date, shares);
  }

  const timeline = [...points.entries()]
    .map(([date, value]) => ({ date, shares: value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Nothing to draw if the position was always empty.
  return timeline.some((p) => p.shares > EPS) ? timeline : null;
}

/** Shares held on `date`, carrying the last change point forward. */
export function sharesOn(timeline: readonly DatedShares[], date: string): number {
  let shares = 0;
  for (const point of timeline) {
    if (point.date > date) break;
    shares = point.shares;
  }
  return shares;
}

/** Latest rate at or before `date`, else `fallback`. `rates` must be ascending. */
export function asOfRate(rates: readonly DatedRate[], date: string, fallback: number): number {
  let value = fallback;
  for (const row of rates) {
    if (row.date > date) break;
    if (Number.isFinite(row.rate) && row.rate > 0) value = row.rate;
  }
  return value;
}

/** GBP per unit of `currency`, with the as-of-date rate when available. */
export function rateForCurrency(
  currency: string | null | undefined,
  date: string,
  rates: readonly DatedRate[],
  fallback: number,
): number {
  const raw = currency ?? "GBP";
  // `GBp` is London pence: upper-casing it would silently turn pence into pounds.
  if (raw === "GBp" || raw.toUpperCase() === "GBX") return 0.01;
  const code = raw.toUpperCase();
  if (code === "GBP") return 1;
  return asOfRate(rates, date, fallback);
}

/**
 * Value history for a listed holding, one point per trading day that Yahoo has
 * a close for. Prices before the position existed, and days without a close,
 * are skipped; the aggregate layer carries values forward.
 */
export function buildMarketValueSeries(params: {
  sharesTimeline: readonly DatedShares[];
  prices: readonly DatedPrice[];
  currency?: string | null;
  rates: readonly DatedRate[];
  fallbackRate?: number;
  /** Inclusive last day to emit (backfill stops before today). */
  endDate: string;
}): DatedValue[] {
  const { sharesTimeline, endDate } = params;
  if (!sharesTimeline.length) return [];
  const startDate = sharesTimeline[0].date;

  const byDate = new Map<string, number>();
  for (const price of params.prices) {
    const day = isoDay(price.date);
    if (!day || !Number.isFinite(price.price) || price.price <= 0) continue;
    if (day < startDate || day > endDate) continue;
    byDate.set(day, price.price);
  }
  if (!byDate.size) return [];

  const fallbackRate = params.fallbackRate ?? 1;
  const out: DatedValue[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const shares = sharesOn(sharesTimeline, date);
    const rate = rateForCurrency(params.currency, date, params.rates, fallbackRate);
    out.push({ date, value: shares * byDate.get(date)! * rate });
  }
  return out;
}

/**
 * Constant-value history for holdings with no market quote (cash, pensions,
 * property, manual portfolios). Only the change points are emitted; aggregates
 * carry them forward.
 */
export function buildConstantValueSeries(params: {
  sharesTimeline: readonly DatedShares[];
  /** GBP value of one share. */
  gbpPerShare: number;
  endDate: string;
}): DatedValue[] {
  if (!Number.isFinite(params.gbpPerShare) || params.gbpPerShare < 0) return [];
  return params.sharesTimeline
    .filter((point) => point.date <= params.endDate)
    .map((point) => ({ date: point.date, value: point.shares * params.gbpPerShare }));
}

/**
 * Sum several ascending series onto their shared date axis, carrying each
 * series' last value forward. Used for portfolio and account totals.
 */
export function aggregateValueSeries(seriesList: ReadonlyArray<readonly DatedValue[]>): DatedValue[] {
  const populated = seriesList.filter((series) => series.length > 0);
  if (!populated.length) return [];

  const dates = new Set<string>();
  for (const series of populated) for (const point of series) dates.add(point.date);
  const ordered = [...dates].sort();

  const cursors = populated.map((series) => {
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
    return { points: sorted, index: -1 };
  });

  const out: DatedValue[] = [];
  for (const date of ordered) {
    let value = 0;
    for (const cursor of cursors) {
      while (cursor.index + 1 < cursor.points.length && cursor.points[cursor.index + 1].date <= date) cursor.index += 1;
      if (cursor.index >= 0) value += cursor.points[cursor.index].value;
    }
    out.push({ date, value });
  }
  return out;
}

/**
 * Storage granularity: keep every point inside the read window (daily) and one
 * point per ISO week before it. Matches `windowSeries`, so nothing the chart can
 * display is lost.
 */
export function downsampleForStorage(
  series: readonly DatedValue[],
  opts?: { now?: number; dailyDays?: number; endDate?: string },
): DatedValue[] {
  if (!series.length) return [];
  const now = opts?.now ?? Date.now();
  const dailyDays = opts?.dailyDays ?? 100;
  const endDate = opts?.endDate ?? new Date(now).toISOString().slice(0, 10);
  const cutoff = new Date(now - dailyDays * 86400000).toISOString().slice(0, 10);

  const sorted = [...series]
    .filter((point) => point.date <= endDate && Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  const older = new Map<string, DatedValue>();
  const recent: DatedValue[] = [];
  for (const point of sorted) {
    if (point.date >= cutoff) recent.push(point);
    else older.set(isoWeekKey(point.date), point);
  }

  const weekly = [...older.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, point]) => point);
  return [...weekly, ...recent].sort((a, b) => a.date.localeCompare(b.date));
}
