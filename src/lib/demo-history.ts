/**
 * Deterministic synthetic history for demo tenants.
 *
 * Pure maths only (no database, no network, no Next imports) so `/api/demo`
 * stays a thin writer and the node test runner can load this module directly.
 *
 * The demo dataset has to look like a real account: a three-year curve that
 * ends exactly at today's seeded price, with the same two market drawdowns in
 * every series so the portfolio, provider and holding charts agree.
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
};

export type DemoHistoryRows = {
  snapshotRows: { userId: string; date: string; value: number }[];
  portfolioRows: { userId: string; portfolioId: string; date: string; value: number }[];
  holdingRows: { userId: string; holdingId: string; date: string; value: number }[];
};

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

/**
 * Build a predefined weekly price series for a symbol. Deterministic: the same
 * symbol always yields the same curve, starting at a derived entry price and
 * ending exactly at `currentPrice` with no discontinuity.
 */
export function predefinedSeries(holding: { symbol: string; currentPrice: number }, dates: readonly string[]): number[] {
  const rnd = mulberry32(hashString(holding.symbol));
  const n = dates.length;
  const target = holding.currentPrice;
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
 * Every snapshot row a demo tenant needs: one series per holding plus the
 * portfolio and total aggregates derived from those series (never computed
 * separately, so the charts always agree).
 */
export function buildDemoHistory(
  userId: string,
  holdingRows: readonly DemoHistoryHolding[],
  dates: readonly string[],
): DemoHistoryRows {
  const n = dates.length;
  const seriesById = new Map<string, number[]>();
  for (const holding of holdingRows) {
    const raw = predefinedSeries(holding, dates);
    seriesById.set(holding.id, raw.map((value, i) => value * marketFactor(i, n)));
  }
  const valueOn = (holding: DemoHistoryHolding, i: number) =>
    (seriesById.get(holding.id)?.[i] ?? holding.currentPrice) * holding.shares;

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
  holdingRows: readonly { id: string }[],
  pointsByHolding: ReadonlyMap<string, number>,
  minPoints = DEMO_HISTORY_MIN_POINTS,
): boolean {
  return holdingRows.some((holding) => (pointsByHolding.get(holding.id) ?? 0) < minPoints);
}
