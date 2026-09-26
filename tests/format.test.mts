import assert from "node:assert/strict";
import test from "node:test";
import { filterByRange, holdingCostGBP, holdingValueGBP, toGBP } from "../src/lib/format.ts";

test("converts supported quoted currencies into GBP", () => {
  assert.equal(toGBP(125, "GBX"), 1.25);
  assert.equal(toGBP(125, "GBp"), 1.25);
  assert.equal(toGBP(127, "USD", { GBP: 1, USD: 100 / 127 }), 100);
  assert.equal(toGBP(117, "EUR", { GBP: 1, EUR: 100 / 117 }), 100);
});

test("holding market value and cost both use the same FX rate", () => {
  const holding = { shares: 2, currentPrice: 50, avgPrice: 40, currency: "USD" };
  const rates = { GBP: 1, USD: 0.8 };
  assert.equal(holdingValueGBP(holding, rates), 80);
  assert.equal(holdingCostGBP(holding, rates), 64);
});

test("range filtering uses calendar age rather than snapshot count", () => {
  const today = new Date();
  const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const rows = [1, 20, 45, 100, 400].map((age) => ({ date: iso(age), value: age }));
  assert.deepEqual(filterByRange(rows, "1M").map((row) => row.value), [1, 20]);
  assert.deepEqual(filterByRange(rows, "3M").map((row) => row.value), [1, 20, 45]);
  assert.deepEqual(filterByRange(rows, "1Y").map((row) => row.value), [1, 20, 45, 100]);
  assert.equal(filterByRange(rows, "MAX").length, 5);
});
