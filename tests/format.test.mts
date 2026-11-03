import assert from "node:assert/strict";
import test from "node:test";
import {
  carryForward,
  combineHistories,
  evenAxisTicks,
  filterByRange,
  gbpAxisFormatter,
  holdingCostGBP,
  holdingValueGBP,
  seriesCursor,
  toGBP,
  todayISODate,
  valueByDate,
  valueChangeOverRange,
  type DatedValue,
} from "../src/lib/format.ts";

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

// --- chart data merges -------------------------------------------------------
//
// Fixture: 8 portfolios over 320 snapshot days, each starting on its own day and
// skipping days (weekends, app closed). The single-pass merges must reproduce the
// per-date scans they replace, value for value.

const FIXTURE_START = "2025-01-06";
const FIXTURE_DAYS = 320;

function isoDay(offset: number) {
  return new Date(Date.parse(`${FIXTURE_START}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeHistories(seriesCount: number, days: number): DatedValue[][] {
  const random = lcg(42);
  return Array.from({ length: seriesCount }, (_, series) => {
    const history: DatedValue[] = [];
    let value = 10_000 + series * 2_500;
    for (let day = series * 7; day < days; day++) {
      if (day > series * 7 && random() < 0.25) continue;
      value *= 1 + (random() - 0.5) * 0.02;
      history.push({ date: isoDay(day), value });
    }
    return history;
  });
}

function dateAxis(histories: DatedValue[][]) {
  return [...new Set(histories.flatMap((history) => history.map((point) => point.date)))].sort((a, b) => a.localeCompare(b));
}

// The implementations these replace, kept here as the reference result.
function referenceCombine(histories: DatedValue[][], currentValue: number): DatedValue[] {
  const populated = histories.filter((history) => history.length > 0);
  const dates = dateAxis(populated);
  const combined = dates.map((date) => ({
    date,
    value: populated.reduce((sum, history) => {
      const latest = [...history].reverse().find((point) => point.date <= date);
      return sum + (latest?.value ?? 0);
    }, 0),
  }));
  if (!combined.length) return [{ date: todayISODate(), value: currentValue }];
  const today = todayISODate();
  const lastDate = combined.at(-1)?.date;
  if (lastDate && lastDate < today) combined.push({ date: today, value: currentValue });
  return combined;
}

test("combineHistories matches the reverse+find merge it replaces", () => {
  const histories = makeHistories(8, FIXTURE_DAYS);
  histories.push([]); // empty histories must be ignored, not zero-fill the axis
  const currentValue = 148_250.75;

  const merged = combineHistories(histories, currentValue);
  assert.deepEqual(merged, referenceCombine(histories, currentValue));
  assert.ok(merged.length > FIXTURE_DAYS * 0.9, `axis too short: ${merged.length}`);
  assert.equal(merged[0].date, isoDay(0));
  assert.equal(merged.at(-1)!.date, todayISODate());
  assert.equal(merged.at(-1)!.value, currentValue);
});

test("combineHistories falls back to today when no history has points", () => {
  assert.deepEqual(combineHistories([[], []], 500), [{ date: todayISODate(), value: 500 }]);
});

test("forward cursors carry the last value like a reverse scan", () => {
  const histories = makeHistories(8, FIXTURE_DAYS);
  const cursors = histories.map((history) => seriesCursor(history));

  for (const date of dateAxis(histories)) {
    histories.forEach((history, index) => {
      const scanned = [...history].reverse().find((point) => point.date <= date)?.value;
      assert.equal(carryForward(cursors[index], date), scanned, `series ${index} on ${date}`);
    });
  }
});

test("date-keyed series maps join the overview axis exactly like find", () => {
  const histories = makeHistories(8, FIXTURE_DAYS);
  const seriesMaps = histories.map((history) => valueByDate(history));

  for (const date of dateAxis(histories)) {
    histories.forEach((history, index) => {
      assert.equal(seriesMaps[index].get(date), history.find((point) => point.date === date)?.value);
    });
  }
  assert.equal(valueByDate(histories[0]).get("1990-01-01"), undefined);
});
