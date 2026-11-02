import assert from "node:assert/strict";
import test from "node:test";
import { evenAxisTicks, filterByRange, gbpAxisFormatter, holdingCostGBP, holdingValueGBP, toGBP, valueChangeOverRange } from "../src/lib/format.ts";

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

test("axis ticks for a value chart are evenly spaced and cover the data", () => {
  const axis = evenAxisTicks([34000, 46000, 52000, 39500]);
  assert.ok(axis);
  const steps = axis.ticks.slice(1).map((tick, i) => Number((tick - axis.ticks[i]).toPrecision(12)));
  assert.ok(steps.every((step) => step === steps[0]), `uneven steps: ${steps.join(",")}`);
  assert.ok(axis.ticks[0] <= 34000 && axis.ticks[axis.ticks.length - 1] >= 52000);
  assert.deepEqual(axis.domain, [axis.ticks[0], axis.ticks[axis.ticks.length - 1]]);
  assert.equal(evenAxisTicks([]), undefined);
  const flat = evenAxisTicks([42000]);
  assert.ok(flat && flat.ticks.length >= 2);
});

test("GBP axis labels zero without a trailing k", () => {
  assert.equal(gbpAxisFormatter([0, 20_000, 40_000])(0), "£0");
  assert.equal(gbpAxisFormatter([0, 20_000, 40_000])(20_000), "£20k");
});

test("period value change uses the last saved value at or before the range start", () => {
  const today = new Date();
  const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10);
  const rows = [
    { date: iso(400), value: 10 },
    { date: iso(100), value: 20 },
    { date: iso(40), value: 30 },
    { date: iso(10), value: 40 },
  ];
  assert.deepEqual(valueChangeOverRange(rows, "1M", 50), {
    amount: 20,
    percent: (20 / 30) * 100,
    fromDate: iso(40),
    baselineValue: 30,
  });
  assert.equal(valueChangeOverRange([], "1M", 50), null);
});
