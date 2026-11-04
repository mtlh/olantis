import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  aggregateValueSeries,
  asOfRate,
  buildConstantValueSeries,
  buildMarketValueSeries,
  buildSharesTimeline,
  downsampleForStorage,
  isoDay,
  isoWeekKey,
  rateForCurrency,
  sharesOn,
  type DatedValue,
} from "../src/lib/backfill-series.ts";

test("isoDay normalises datetimes and rejects junk", () => {
  assert.equal(isoDay("2024-01-15"), "2024-01-15");
  assert.equal(isoDay("2024-01-15T12:34:56.000Z"), "2024-01-15");
  assert.equal(isoDay("not-a-date"), null);
  assert.equal(isoDay(null), null);
  assert.equal(addDays("2024-02-28", 2), "2024-03-01"); // leap year
});

test("constant position is held from the purchase date", () => {
  const timeline = buildSharesTimeline({
    currentShares: 120,
    purchaseDate: "2024-01-15",
    transactions: [],
  });
  assert.deepEqual(timeline, [{ date: "2024-01-15", shares: 120 }]);
});

test("a ledger-only position starts at its first trade", () => {
  const timeline = buildSharesTimeline({
    currentShares: 10,
    purchaseDate: null,
    transactions: [{ type: "buy", shares: 10, date: "2024-01-10" }],
  });
  assert.deepEqual(timeline, [{ date: "2024-01-10", shares: 10 }]);
});

test("opening balance reconciles an imported position with later trades", () => {
  const timeline = buildSharesTimeline({
    currentShares: 15,
    purchaseDate: "2020-01-01",
    transactions: [{ type: "buy", shares: 5, date: "2024-01-01" }],
  });
  assert.deepEqual(timeline, [
    { date: "2020-01-01", shares: 10 },
    { date: "2024-01-01", shares: 15 },
  ]);
  assert.equal(sharesOn(timeline!, "2023-12-31"), 10);
  assert.equal(sharesOn(timeline!, "2024-01-02"), 15);
});

test("buys and sells replay in date order", () => {
  const timeline = buildSharesTimeline({
    currentShares: 6,
    purchaseDate: "2020-01-01",
    transactions: [
      { type: "buy", shares: 10, date: "2024-01-01", createdAt: 1 },
      { type: "sell", shares: 4, date: "2024-06-01", createdAt: 2 },
    ],
  });
  assert.deepEqual(timeline, [
    { date: "2020-01-01", shares: 0 },
    { date: "2024-01-01", shares: 10 },
    { date: "2024-06-01", shares: 6 },
  ]);
  assert.equal(sharesOn(timeline!, "2025-01-01"), 6);
});

test("same-day trades are aggregated and never oversell below zero", () => {
  const timeline = buildSharesTimeline({
    currentShares: 0,
    purchaseDate: null,
    transactions: [
      { type: "buy", shares: 10, date: "2024-01-01" },
      { type: "sell", shares: 6, date: "2024-01-01" },
      { type: "sell", shares: 9, date: "2024-02-01" },
    ],
  });
  // net = -5, so the opening balance is 5; 2024-01-01 = 5 + 10 - 6 = 9.
  assert.deepEqual(timeline, [
    { date: "2024-01-01", shares: 9 },
    { date: "2024-02-01", shares: 0 },
  ]);
});

test("an inconsistent ledger falls back to the current position", () => {
  const timeline = buildSharesTimeline({
    currentShares: 2,
    purchaseDate: "2024-01-01",
    transactions: [{ type: "buy", shares: 5, date: "2024-01-02" }],
  });
  assert.deepEqual(timeline, [{ date: "2024-01-01", shares: 2 }]);
});

test("nothing to place on a timeline returns null", () => {
  assert.equal(
    buildSharesTimeline({ currentShares: 0, purchaseDate: null, transactions: [] }),
    null,
  );
  assert.equal(
    buildSharesTimeline({ currentShares: 0, purchaseDate: "2024-01-01", transactions: [] }),
    null,
  );
});

test("as-of FX uses the most recent prior rate and falls back before the series", () => {
  const rates = [
    { date: "2024-01-01", rate: 0.8 },
    { date: "2024-01-05", rate: 0.9 },
  ];
  assert.equal(asOfRate(rates, "2024-01-03", 0.7), 0.8);
  assert.equal(asOfRate(rates, "2024-01-05", 0.7), 0.9);
  assert.equal(asOfRate(rates, "2024-02-01", 0.7), 0.9);
  assert.equal(asOfRate(rates, "2023-12-31", 0.7), 0.7);
});

test("GBX/GBp convert as pence, GBP as itself", () => {
  assert.equal(rateForCurrency("GBX", "2024-01-01", [], 1), 0.01);
  assert.equal(rateForCurrency("GBp", "2024-01-01", [], 1), 0.01);
  assert.equal(rateForCurrency("GBP", "2024-01-01", [], 0.5), 1);
  assert.equal(rateForCurrency(null, "2024-01-01", [], 0.5), 1);
});

test("market series applies the share count and as-of FX per trading day", () => {
  const series = buildMarketValueSeries({
    sharesTimeline: [
      { date: "2024-01-01", shares: 10 },
      { date: "2024-01-03", shares: 20 },
    ],
    prices: [
      { date: "2024-01-01", price: 100 },
      { date: "2024-01-02", price: 110 },
      { date: "2024-01-03", price: 120 },
      { date: "2024-01-04", price: 130 },
    ],
    currency: "USD",
    rates: [
      { date: "2024-01-01", rate: 0.8 },
      { date: "2024-01-02", rate: 0.9 },
    ],
    fallbackRate: 0.75,
    endDate: "2024-01-03",
  });
  assert.deepEqual(series, [
    { date: "2024-01-01", value: 10 * 100 * 0.8 },
    { date: "2024-01-02", value: 10 * 110 * 0.9 },
    { date: "2024-01-03", value: 20 * 120 * 0.9 },
  ]);
});

test("market series skips prices before the position existed", () => {
  const series = buildMarketValueSeries({
    sharesTimeline: [{ date: "2024-02-01", shares: 5 }],
    prices: [
      { date: "2024-01-01", price: 100 },
      { date: "2024-02-01", price: 120 },
    ],
    currency: "GBP",
    rates: [],
    endDate: "2024-02-02",
  });
  assert.deepEqual(series, [{ date: "2024-02-01", value: 600 }]);
});

test("constant series only emits change points inside the end date", () => {
  const series = buildConstantValueSeries({
    sharesTimeline: [
      { date: "2024-01-01", shares: 2 },
      { date: "2024-03-01", shares: 4 },
      { date: "2024-06-01", shares: 8 },
    ],
    gbpPerShare: 50,
    endDate: "2024-03-02",
  });
  assert.deepEqual(series, [
    { date: "2024-01-01", value: 100 },
    { date: "2024-03-01", value: 200 },
  ]);
});

test("aggregates sum staggered series with carry-forward", () => {
  const a: DatedValue[] = [
    { date: "2024-01-01", value: 100 },
    { date: "2024-01-03", value: 120 },
  ];
  const b: DatedValue[] = [{ date: "2024-01-02", value: 50 }];
  assert.deepEqual(aggregateValueSeries([a, b]), [
    { date: "2024-01-01", value: 100 },
    { date: "2024-01-02", value: 150 },
    { date: "2024-01-03", value: 170 },
  ]);
  assert.deepEqual(aggregateValueSeries([]), []);
});

test("storage downsampling keeps daily points near the end and one per week before", () => {
  const now = Date.parse("2024-06-10T00:00:00Z");
  const series: DatedValue[] = [
    { date: "2020-01-01", value: 1 }, // Monday
    { date: "2020-01-02", value: 2 }, // same ISO week, must win
    { date: "2020-01-08", value: 3 },
    { date: "2024-06-01", value: 4 },
    { date: "2024-06-10", value: 5 }, // filtered: not before endDate
  ];
  const out = downsampleForStorage(series, { now, dailyDays: 100, endDate: "2024-06-09" });
  assert.deepEqual(out, [
    { date: "2020-01-02", value: 2 },
    { date: "2020-01-08", value: 3 },
    { date: "2024-06-01", value: 4 },
  ]);
  assert.equal(isoWeekKey("2020-01-02"), "2019-12-30");
  assert.equal(isoWeekKey("2020-01-08"), "2020-01-06");
});
