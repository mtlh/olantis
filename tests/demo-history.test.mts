import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemoHistory,
  demoHistoryIncomplete,
  marketFactor,
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
    assert.ok(Math.abs(holdingByDate.get(row.date)! - row.value) < 1e-6);
    assert.ok(Math.abs(portfolioByDate.get(row.date)! - row.value) < 1e-6);
  }

  // The final point matches today's seeded values exactly.
  const last = rows.snapshotRows.at(-1)!;
  const expected = HOLDINGS.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);
  assert.ok(Math.abs(last.value - expected) < 1e-6);
  assert.ok(rows.holdingRows.every((row) => row.userId === "demo:s_test"));
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
