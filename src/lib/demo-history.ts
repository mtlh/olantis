/**
 * Deterministic synthetic history for demo tenants.
 *
 * Pure maths only (no database, no network, no Next imports) so `/api/demo`
 * stays a thin writer and the node test runner can load this module directly.
 *
 * The demo dataset has to look like a real account: a three-year curve that
 * ends exactly at today's seeded price, with every series sharing one market
 * trend so the portfolio, holding, provider and benchmark lines agree. The
 * caller supplies that trend as real benchmark closes (`marketPath`); without
 * them the module falls back to two fabricated drawdowns.
 */

/** How far back the predefined demo history goes. */
export const DEMO_HISTORY_YEARS = 3;

/**
 * A demo tenant seeded before per-holding history was written has only the
 * cron/client rows for a day or two. Anything below this many points is treated
 * as missing and topped up on the next "Try the demo" click.
 */
export const DEMO_HISTORY_MIN_POINTS = 24;

export type DemoHistoryHolding = {
  id: string;
  symbol: string;
  shares: number;
  currentPrice: number;
  portfolioId: string | null;
  /** Quote currency, so totals are converted the same way as live snapshots. */
  currency?: string | null;
};

export type DemoHistoryRows = {
  snapshotRows: Array<{ userId: string; date: string; value: number }>;
  portfolioRows: Array<{ userId: string; portfolioId: string; date: string; value: number }>;
  holdingRows: Array<{ userId: string; holdingId: string; date: string; value: number }>;
};

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
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

/** Monday-based weekly points from `years` ago through today (today included). */
export function weeklyDates(years = DEMO_HISTORY_YEARS, now = new Date()): string[] {
  const out: string[] = [];
  const today = new Date(now);
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

/** Entry price band, as a fraction of today's price, when nothing else sets the trend. */
export const DEFAULT_ENTRY_RANGE = [0.8, 0.94] as const;

/**
 * Entry price band used when a real market path supplies the trend: the holding
 * only needs a small deterministic edge (or lag) on top of the market, because
 * the market itself explains almost all of the three-year move.
 */
export const MARKET_ENTRY_RANGE = [0.97, 1.03] as const;

/**
 * Build a predefined weekly price series for a symbol. Deterministic: the same
 * symbol always yields the same curve, starting at a derived entry price and
 * ending exactly at `currentPrice` with no discontinuity.
 *
 * `entryRange` sets the first point as a fraction of today's price, so a caller
 * that layers a real market path on top can swap the fabricated trend for a
 * small idiosyncratic one.
 */
export function predefinedSeries(
  holding: { symbol: string; currentPrice: number },
  dates: readonly string[],
  entryRange: readonly [number, number] = DEFAULT_ENTRY_RANGE,
): number[] {
  const rnd = mulberry32(hashString(holding.symbol));
  const n = dates.length;
  const target = holding.currentPrice;
  if (n <= 1) return [target];

  // Deterministic entry price, inside the requested band around today's price.
  const [low, high] = entryRange;
  const start = target * (low + rnd() * (high - low));

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

/** A real daily close series the demo uses as its market trend. */
export type DemoMarketPoint = { date: string; value: number };

/**
 * Resample a real market series onto the demo's weekly dates and normalise it so
 * the last point is 1.
 *
 * The demo portfolio has to move like a real portfolio: a fabricated curve made
 * the performance chart contradict the market benchmark it is compared against
 * (the fabricated series gained ~14% over three years while the index gained
 * ~53%, which read as "the benchmark is wrong"). Resampling a stored benchmark
 * keeps the demo offline and deterministic — same database, same curve — while
 * making the comparison meaningful.
 *
 * Returns null when the series cannot cover the window, so the caller falls back
 * to the synthetic `marketFactor` drawdowns.
 */
export function marketPathFactor(path: readonly DemoMarketPoint[], dates: readonly string[]): number[] | null {
  if (dates.length < 2) return null;
  const ordered = path
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) return null;

  const factors: number[] = [];
  let index = -1;
  for (const date of dates) {
    while (index + 1 < ordered.length && ordered[index + 1].date <= date) index++;
    // A date before the series starts has no market value to carry forward.
    if (index < 0) return null;
    factors.push(ordered[index].value);
  }
  const last = factors[factors.length - 1];
  if (!(last > 0)) return null;
  return factors.map((value) => value / last);
}

/** Two deterministic drawdowns so the demo chart looks like a real market. */
export function marketFactor(idx: number, n: number): number {
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

/**
 * Convert a quoted amount into GBP, mirroring `toGBP` in lib/format (GBX/GBp
 * are pence). Kept local so this module stays importable by the node tests.
 */
function toGbp(value: number, currency: string | null | undefined, rates: Record<string, number>): number {
  if (currency === "GBX" || currency === "GBp") return value / 100;
  const code = currency?.toUpperCase() ?? "GBP";
  if (code === "GBP") return value;
  const rate = rates[code];
  return rate && Number.isFinite(rate) ? value * rate : value;
}

/**
 * Every snapshot row a demo tenant needs: one series per holding plus the
 * portfolio and total aggregates derived from those series (never computed
 * separately, so the charts always agree).
 *
 * `marketPath` is a real benchmark series. When it covers the window the demo
 * follows the market (so the performance chart and its benchmark agree) and each
 * holding only carries a small deterministic edge; without it the fabricated
 * `marketFactor` drawdowns are used instead.
 */
export function buildDemoHistory(
  userId: string,
  holdingRows: readonly DemoHistoryHolding[],
  dates: readonly string[],
  rates: Record<string, number> = {},
  marketPath: readonly DemoMarketPoint[] = [],
): DemoHistoryRows {
  const n = dates.length;
  const factor = marketPathFactor(marketPath, dates);
  const seriesById = new Map<string, number[]>();
  for (const holding of holdingRows) {
    const raw = predefinedSeries(holding, dates, factor ? MARKET_ENTRY_RANGE : DEFAULT_ENTRY_RANGE);
    seriesById.set(
      holding.id,
      factor ? raw.map((value, i) => value * factor[i]) : raw.map((value, i) => value * marketFactor(i, n)),
    );
  }
  const valueOn = (holding: DemoHistoryHolding, i: number) =>
    toGbp((seriesById.get(holding.id)?.[i] ?? holding.currentPrice) * holding.shares, holding.currency, rates);

  const holdingSnapshotRows = dates.flatMap((date, i) =>
    holdingRows.map((holding) => ({
      userId,
      holdingId: holding.id,
      date,
      value: valueOn(holding, i),
    })),
  );

  const totals = dates.map((date, i) => {
    let total = 0;
    const byPortfolio = new Map<string, number>();
    for (const holding of holdingRows) {
      const value = valueOn(holding, i);
      total += value;
      if (!holding.portfolioId) continue;
      byPortfolio.set(holding.portfolioId, (byPortfolio.get(holding.portfolioId) ?? 0) + value);
    }
    return { date, total, byPortfolio };
  });

  return {
    snapshotRows: totals.map(({ date, total }) => ({ userId, date, value: total })),
    portfolioRows: totals.flatMap(({ date, byPortfolio }) =>
      [...byPortfolio].map(([portfolioId, value]) => ({ userId, portfolioId, date, value })),
    ),
    holdingRows: holdingSnapshotRows,
  };
}

/**
 * True when at least one holding has fewer than `minPoints` history rows, i.e.
 * the tenant was seeded before per-holding history existed (or its insert was
 * interrupted).
 */
export function demoHistoryIncomplete(
  holdingRows: ReadonlyArray<{ id: string }>,
  pointsByHolding: ReadonlyMap<string, number>,
  minPoints = DEMO_HISTORY_MIN_POINTS,
): boolean {
  return holdingRows.some((holding) => (pointsByHolding.get(holding.id) ?? 0) < minPoints);
}

/** A single week never legitimately moves the demo total by this much. */
const REBASE_STEP_THRESHOLD = 0.1;

/**
 * How far the demo series may drift from the market path before it is treated
 * as stale. The per-holding deterministic edge is a few percent, so anything
 * wider than this is a series built by an older, market-agnostic seed.
 */
const MARKET_DRIFT_TOLERANCE = 0.2;

/**
 * True when a stored demo total series has to be rebuilt:
 *
 *  - its last step is a rebase gap (the daily price refresh moved the seeded
 *    prices, so the synthetic seed day no longer lines up with today), or
 *  - it does not follow the market path the current seed is built from, i.e. it
 *    was written by a build whose demo history was a fabricated curve. Such a
 *    series makes the performance chart contradict its own benchmark, so the
 *    tenant re-seeds itself instead of keeping the misleading chart.
 */
export function demoHistoryNeedsRebuild(
  totalSnapshots: ReadonlyArray<{ date: string; value: number }>,
  marketPath: readonly DemoMarketPoint[] = [],
): boolean {
  const ordered = totalSnapshots
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) return false;

  const latest = ordered[ordered.length - 1];
  const previous = ordered[ordered.length - 2];
  if (previous.value > 0 && Math.abs(latest.value / previous.value - 1) > REBASE_STEP_THRESHOLD) return true;

  const first = ordered[0];
  if (!(first.value > 0)) return true;
  const market = marketPathFactor(marketPath, [first.date, latest.date]);
  if (!market) return false;
  const marketRatio = 1 / market[0];
  if (!(marketRatio > 0)) return false;
  return Math.abs((latest.value / first.value) / marketRatio - 1) > MARKET_DRIFT_TOLERANCE;
}
