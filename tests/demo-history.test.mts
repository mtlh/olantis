import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemoHistory,
  demoHistoryIncomplete,
  demoHistoryNeedsRebuild,
  marketFactor,
  marketPathFactor,
  predefinedSeries,
  weeklyDates,
  DEMO_HISTORY_MIN_POINTS,
  DEMO_HISTORY_YEARS,
} from "../src/lib/demo-history.ts";

const NOW = new Date("2026-11-04T12:00:00Z");

const HOLDINGS = [
  { id: "h1", symbol: "VWRP", shares: 120, currentPrice: 106.4, portfolioId: "p1" },
  { id: "h2", symbol: "AAPL", shares: 15, currentPrice: 178, portfolioId: "p1" },
  { id: "h3", symbol: "VUAG", shares: 200, currentPrice: 74.2, portfolioId: "p2" },
];

test("weeklyDates spans the full demo window and ascends", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  assert.ok(dates.length >= 150, `expected ~157 weekly points, got ${dates.length}`);
  assert.equal(new Set(dates).size, dates.length);
  for (let i = 1; i < dates.length; i++) assert.ok(dates[i] > dates[i - 1]);
  // The synthetic curve ends today, so the last row must be the latest day.
  assert.equal(dates.at(-1), NOW.toISOString().slice(0, 10));
});

test("predefinedSeries is deterministic and lands exactly on today's price", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const a = predefinedSeries(HOLDINGS[0], dates);
  const b = predefinedSeries(HOLDINGS[0], dates);
  assert.deepEqual(a, b);
  assert.equal(a.at(-1), 106.4);
  assert.ok(a[0] < 106.4);
});

test("marketFactor returns to 1 outside the two drawdowns", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  assert.equal(marketFactor(0, dates.length), 1);
  assert.equal(marketFactor(dates.length - 1, dates.length), 1);
  assert.ok(marketFactor(Math.floor(dates.length * 0.32), dates.length) < 0.9);
});

test("buildDemoHistory emits a series per holding and consistent aggregates", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const rows = buildDemoHistory("demo:s_test", HOLDINGS, dates);

  assert.equal(rows.holdingRows.length, dates.length * HOLDINGS.length);
  assert.equal(rows.snapshotRows.length, dates.length);
  assert.equal(rows.portfolioRows.length, dates.length * 2);

  const holdingByDate = new Map<string, number>();
  for (const row of rows.holdingRows) {
    holdingByDate.set(row.date, (holdingByDate.get(row.date) ?? 0) + row.value);
  }
  const portfolioByDate = new Map<string, number>();
  for (const row of rows.portfolioRows) {
    portfolioByDate.set(row.date, (portfolioByDate.get(row.date) ?? 0) + row.value);
  }

  for (const row of rows.snapshotRows) {
    // Totals are the sum of their parts on every single day, so the portfolio
    // and holding charts can never disagree.
    const holdingValue = holdingByDate.get(row.date);
    const portfolioValue = portfolioByDate.get(row.date);
    assert.ok(holdingValue != null);
    assert.ok(portfolioValue != null);
    assert.ok(Math.abs(holdingValue - row.value) < 1e-6);
    assert.ok(Math.abs(portfolioValue - row.value) < 1e-6);
  }

  // The final point matches today's seeded values exactly.
  const last = rows.snapshotRows.at(-1);
  assert.ok(last);
  const expected = HOLDINGS.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
  assert.ok(Math.abs(last.value - expected) < 1e-6);
  assert.ok(rows.holdingRows.every((row) => row.userId === "demo:s_test"));
});

test("buildDemoHistory converts quoted currencies at the supplied rates", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const rows = buildDemoHistory(
    "demo:s_fx",
    [{ id: "h1", symbol: "AAPL", shares: 2, currentPrice: 100, portfolioId: "p1", currency: "USD" }],
    dates,
    { USD: 0.5 },
  );
  // 2 shares × $100 × 0.5 = £100, for the holding and its aggregate.
  assert.equal(rows.holdingRows.at(-1)?.value, 100);
  assert.equal(rows.snapshotRows.at(-1)?.value, 100);
});

test("demoHistoryIncomplete flags tenants seeded before per-holding history", () => {
  const complete = new Map(HOLDINGS.map((h) => [h.id, DEMO_HISTORY_MIN_POINTS]));
  assert.equal(demoHistoryIncomplete(HOLDINGS, complete), false);

  // A tenant from before the fix has one or two rows for the latest day.
  const legacy = new Map(HOLDINGS.map((h) => [h.id, 2]));
  assert.equal(demoHistoryIncomplete(HOLDINGS, legacy), true);

  // One partial holding is enough to trigger a top-up.
  const partial = new Map(complete);
  partial.set("h2", 1);
  assert.equal(demoHistoryIncomplete(HOLDINGS, partial), true);

  const empty = new Map<string, number>();
  assert.equal(demoHistoryIncomplete(HOLDINGS, empty), true);
  assert.equal(demoHistoryIncomplete([], empty), false);
});

/** Daily closes over the demo window, shaped like the stored benchmark series. */
function marketPath(dates: readonly string[], growth: number): Array<{ date: string; value: number }> {
  const start = Date.parse(`${dates[0]}T00:00:00Z`);
  return dates.map((date, i) => ({
    date,
    value: 100 * (1 + (growth - 1) * (i / (dates.length - 1))),
  })).concat([{ date: new Date(start - 86400000).toISOString().slice(0, 10), value: 100 }]);
}

test("marketPathFactor normalises the series to end at 1 and carries weekends forward", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const path = marketPath(dates, 1.53);
  const factor = marketPathFactor(path, dates);
  assert.ok(factor);
  assert.equal(factor.length, dates.length);
  assert.ok(Math.abs(factor[factor.length - 1] - 1) < 1e-12);
  // Every weekly point resamples the latest close on or before it.
  assert.ok(factor[0] < 0.7);

  // A date before the series starts cannot be anchored.
  assert.equal(marketPathFactor(path, ["2000-01-03", "2000-01-10"]), null);
  assert.equal(marketPathFactor([], dates), null);
});

test("buildDemoHistory follows the market path so the benchmark comparison holds", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const path = marketPath(dates, 1.53);
  const rows = buildDemoHistory("demo:s_market", HOLDINGS, dates, {}, path);

  const first = rows.snapshotRows[0];
  const last = rows.snapshotRows.at(-1);
  assert.ok(last);

  // The seeded value still lands exactly on today's prices.
  const expected = HOLDINGS.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
  assert.ok(Math.abs(last.value - expected) < 1e-6);

  // Three-year growth tracks the market (+53%) instead of a fabricated ~14%.
  const growth = last.value / first.value;
  assert.ok(growth > 1.45 && growth < 1.62, `expected ~1.53x, got ${growth.toFixed(3)}`);

  // Every holding follows the same market shape, so the portfolio cannot
  // contradict the benchmark series it is charted against.
  const byHolding = new Map<string, Map<string, number>>();
  for (const row of rows.holdingRows) {
    if (!byHolding.has(row.holdingId)) byHolding.set(row.holdingId, new Map());
    byHolding.get(row.holdingId)?.set(row.date, row.value);
  }
  for (const [, series] of byHolding) {
    const values = dates.map((date) => series.get(date) ?? 0);
    const finalMarket = path[dates.length - 1].value;
    for (let i = 0; i < values.length; i++) {
      assert.ok(values[i] > 0, "demo values must stay positive");
      // Same market trend within the deterministic per-holding edge.
      const ratio = values[i] / values[values.length - 1];
      const marketRatio = path[i].value / finalMarket;
      assert.ok(Math.abs(ratio / marketRatio - 1) < 0.15, `holding drifted ${(ratio / marketRatio - 1).toFixed(3)} from the market`);
    }
  }
});

test("demoHistoryNeedsRebuild rebuilds fabricated and rebase-gapped series", () => {
  const dates = weeklyDates(DEMO_HISTORY_YEARS, NOW);
  const path = marketPath(dates, 1.53);
  const shaped = buildDemoHistory("demo:s_shaped", HOLDINGS, dates, {}, path).snapshotRows;
  assert.equal(demoHistoryNeedsRebuild(shaped, path), false);

  // A series built by the old fabricated seed gains ~14% while the market gains 53%.
  const fabricated = shaped.map((row, i) => ({ date: row.date, value: 30000 * (1 + 0.14 * (i / (shaped.length - 1))) }));
  assert.equal(demoHistoryNeedsRebuild(fabricated, path), true);

  // Without a market path only the rebase step is checked.
  assert.equal(demoHistoryNeedsRebuild(fabricated), false);
  const stepped = shaped.slice(-3).map((row) => ({ ...row }));
  const inflated = stepped[stepped.length - 1];
  inflated.value *= 1.23;
  assert.equal(demoHistoryNeedsRebuild(stepped, path), true);
});
