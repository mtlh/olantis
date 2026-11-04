import assert from "node:assert/strict";
import test from "node:test";
import {
  carryForward,
  combineHistories,
  evenAxisTicks,
  filterByRange,
  fmtDayMonth,
  fmtGBP,
  fmtMoney,
  fmtPrice,
  fmtSnapshotDate,
  fmtTimestamp,
  gbpAxisFormatter,
  holdingCostGBP,
  holdingCurrency,
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

test("cash is a GBP balance even when a quote put a foreign currency on it", () => {
  const holding = { symbol: "CASH", shares: 1, currentPrice: 2899, avgPrice: 2899, currency: "USD" };
  const rates = { GBP: 1, USD: 0.8 };
  assert.equal(holdingCurrency(holding), "GBP");
  assert.equal(holdingValueGBP(holding, rates), 2899);
  assert.equal(holdingCostGBP(holding, rates), 2899);
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

  // Unsorted input still resolves the same baseline as the sorted path.
  const shuffled = [rows[2], rows[0], rows[3], rows[1]];
  assert.deepEqual(valueChangeOverRange(shuffled, "1M", 50), valueChangeOverRange(rows, "1M", 50));
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

test("cached GBP formatter keeps whole-pound and pence output", () => {
  assert.equal(fmtGBP(1234.567), "£1,235");
  assert.equal(fmtGBP(-1234.567), "-£1,235");
  // Under £100 pence are kept so small balances do not collapse to "£0".
  assert.equal(fmtGBP(12.5), "£12.50");
  assert.equal(fmtGBP(-12.5), "-£12.50");
  assert.equal(fmtGBP(0), "£0");
  assert.equal(fmtGBP(Number.NaN), "—");
  assert.equal(fmtGBP(Number.POSITIVE_INFINITY), "—");
  assert.equal(fmtGBP(Number.NEGATIVE_INFINITY), "—");
});

test("cached price formatter keeps GBP/USD/EUR and pence output", () => {
  assert.equal(fmtPrice(1234.567, "GBP"), "£1,234.57");
  assert.equal(fmtPrice(12.5, "GBP"), "£12.50");
  assert.equal(fmtPrice(0, "GBP"), "£0.00");
  assert.equal(fmtPrice(1234.567, "USD"), "$1234.57");
  assert.equal(fmtPrice(1234.567, "EUR"), "€1234.57");
  assert.equal(fmtMoney(1234.567, "GBP"), "£1,234.57");
  // GBX/GBp quote pence: rounded whole pence, no currency symbol.
  assert.equal(fmtPrice(1234.4, "GBX"), "1,234p");
  assert.equal(fmtPrice(1234.4, "GBp"), "1,234p");
  assert.equal(fmtPrice(12.5, "GBX"), "13p");
  assert.equal(fmtPrice(-12.5, "GBX"), "-12p");
  assert.equal(fmtPrice(0, "GBX"), "0p");
  // Unknown and missing currencies keep the plain two-decimal form.
  assert.equal(fmtPrice(1234.567, "SEK"), "1234.57 SEK");
  assert.equal(fmtPrice(1234.567), "1234.57");
  assert.equal(fmtPrice(Number.NaN, "GBP"), "£NaN");
});

test("repeated formatting calls return identical strings", () => {
  const calls: Array<() => string> = [
    () => fmtGBP(1234.567),
    () => fmtGBP(12.5),
    () => fmtPrice(98.765, "GBP"),
    () => fmtPrice(1234.4, "GBX"),
    () => fmtSnapshotDate("2026-01-05"),
    () => fmtTimestamp(1767225600),
  ];
  for (const call of calls) {
    const first = call();
    for (let i = 0; i < 5; i++) assert.equal(call(), first);
  }
});

test("cached date formatters match the uncached Intl output", () => {
  assert.equal(fmtSnapshotDate("2026-01-05"), "5 Jan 2026");
  assert.equal(fmtSnapshotDate("2026-01-05", "en-US"), "Jan 5, 2026");
  assert.equal(fmtSnapshotDate("nope"), "nope");
  assert.equal(fmtDayMonth("2026-01-05"), "5 Jan");
  assert.equal(fmtDayMonth("2026-01-05", "en-US"), "Jan 5");
  assert.equal(fmtDayMonth("nope"), "nope");

  const ts = 1767225600;
  assert.equal(fmtTimestamp(ts, "en-GB"), new Date(ts * 1000).toLocaleString("en-GB"));
  assert.equal(fmtTimestamp(ts, "en-US"), new Date(ts * 1000).toLocaleString("en-US"));
});
