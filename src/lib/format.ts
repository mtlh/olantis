export type MoneyHolding = {
  shares: number;
  avgPrice?: number;
  currentPrice?: number;
  currency?: string | null;
};

/** Convert a quoted amount into GBP (GBX/GBp pence → pounds). */
export type FxRates = Record<string, number>;

// Each entry is the number of GBP represented by one unit of that currency.
export const DEFAULT_FX_RATES: FxRates = { GBP: 1, USD: 0.7874, EUR: 0.8547, CAD: 0.5814, AUD: 0.5128, JPY: 0.00526, CHF: 0.8929, HKD: 0.101, CNY: 0.1087 };

export function toGBP(value: number, currency?: string | null, rates: FxRates = DEFAULT_FX_RATES): number {
  if (currency === "GBX" || currency === "GBp") return value / 100;
  const code = currency?.toUpperCase() ?? "GBP";
  if (code === "GBP") return value;
  const rateToGbp = rates[code];
  return rateToGbp && Number.isFinite(rateToGbp) ? value * rateToGbp : value;
}

export function holdingValueGBP(h: MoneyHolding, rates?: FxRates): number {
  return toGBP(h.shares * (h.currentPrice ?? 0), h.currency, rates);
}

export function holdingCostGBP(h: MoneyHolding, rates?: FxRates): number {
  return toGBP(h.shares * (h.avgPrice ?? 0), h.currency, rates);
}

/** Earliest ISO day ("2026-01-05") included by a range; null for "MAX". */
export function rangeCutoff(range: string): string | null {
  if (range === "MAX") return null;
  const days = range === "1M" ? 31 : range === "3M" ? 92 : 365;
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/** Filters rows whose `date` is an ISO day. Chart rows with a formatted label must filter on `dateISO` instead. */
export function filterByRange<T extends { date: string }>(rows: T[], range: string): T[] {
  const cutoff = rangeCutoff(range);
  if (cutoff == null) return rows;
  return rows.filter((row) => row.date >= cutoff);
}

export type ValueChange = {
  amount: number;
  percent: number | null;
  fromDate: string;
  baselineValue: number;
};

/** Compare today's value with the latest saved value at or before the range start. */
export function valueChangeOverRange(
  rows: Array<{ date: string; value: number }>,
  range: string,
  currentValue: number,
): ValueChange | null {
  const ordered = rows
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length || !Number.isFinite(currentValue)) return null;

  const cutoff = rangeCutoff(range) ?? ordered[0].date;
  const baseline = [...ordered].reverse().find((row) => row.date <= cutoff) ?? ordered[0];
  const amount = currentValue - baseline.value;

  return {
    amount,
    percent: baseline.value > 0 ? (amount / baseline.value) * 100 : null,
    fromDate: baseline.date,
    baselineValue: baseline.value,
  };
}

export type DatedValue = { date: string; value: number };

/** Forward cursor over one ascending series. */
export type SeriesCursor<T extends DatedValue = DatedValue> = { points: readonly T[]; index: number };

export function seriesCursor<T extends DatedValue>(points: readonly T[]): SeriesCursor<T> {
  return { points, index: -1 };
}

/**
 * Latest value at or before `date`, carrying the previous value forward.
 * Queries must be in non-decreasing date order and `points` must be ascending,
 * which makes walking a merged date axis a single pass per series.
 */
export function carryForward<T extends DatedValue>(cursor: SeriesCursor<T>, date: string): number | undefined {
  const { points } = cursor;
  let index = cursor.index;
  while (index + 1 < points.length && points[index + 1].date <= date) index++;
  cursor.index = index;
  return index >= 0 ? points[index].value : undefined;
}

/** Date → value lookup for exact-day joins; the first value for a date wins, like `Array.find`. */
export function valueByDate<T extends DatedValue>(points: readonly T[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of points) if (!map.has(point.date)) map.set(point.date, point.value);
  return map;
}

/**
 * Merge ascending per-item histories onto one date axis. A history holds its
 * last known value on days it has no snapshot; `currentValue` closes the series
 * when the latest snapshot predates today.
 */
export function combineHistories(histories: ReadonlyArray<readonly DatedValue[]>, currentValue: number): DatedValue[] {
  const populated = histories.filter((history) => history.length > 0);
  const dates = new Set<string>();
  for (const history of populated) for (const point of history) dates.add(point.date);
  const orderedDates = [...dates].sort((a, b) => a.localeCompare(b));
  if (!orderedDates.length) return [{ date: todayISODate(), value: currentValue }];

  const cursors = populated.map((history) => seriesCursor(history));
  const combined = orderedDates.map((date) => {
    let value = 0;
    for (const cursor of cursors) value += carryForward(cursor, date) ?? 0;
    return { date, value };
  });

  const today = todayISODate();
  const lastDate = combined[combined.length - 1].date;
  if (lastDate < today) combined.push({ date: today, value: currentValue });
  return combined;
}

// Constructing an Intl formatter costs ~30 µs, these run per table cell, sidebar
// row and chart tick — so build each shape once and reuse it.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${options?.style ?? ""}|${options?.currency ?? ""}|${options?.minimumFractionDigits ?? ""}|${options?.maximumFractionDigits ?? ""}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, formatter);
  }
  return formatter;
}

function dateFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${options?.year ?? ""}|${options?.month ?? ""}|${options?.day ?? ""}|${options?.hour ?? ""}|${options?.minute ?? ""}|${options?.second ?? ""}|${options?.hour12 ?? ""}`;
  let formatter = dateFormats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, formatter);
  }
  return formatter;
}

export function fmtGBP(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Below £100 show pence — otherwise small balances all render as "£0".
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 100 ? 2 : 0;
  return numberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Format a raw amount in a specific currency (used for per-holding prices). */
export function fmtMoney(n: number, currency?: string | null): string {
  if (!Number.isFinite(n)) return "—";
  return fmtPrice(n, currency ?? "GBP");
}

/** Default currency for new holdings/trades, from the user's settings. */
export const SUPPORTED_CURRENCIES = ["GBP", "USD", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function fmtPrice(n: number, currency?: string | null): string {
  if (currency === "GBX" || currency === "GBp") return `${numberFormat("en-GB").format(Math.round(n))}p`;
  if (currency === "GBP") {
    return numberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (currency === "USD") return `$${Number(n).toFixed(2)}`;
  if (currency === "EUR") return `€${Number(n).toFixed(2)}`;
  return `${Number(n).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

/** ISO day ("2026-01-05") → "5 Jan 2026" in the user's locale. */
export function fmtSnapshotDate(iso: string, locale = "en-GB"): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return dateFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

/** Unix seconds → localised date and time (holding row tooltip; same text as `toLocaleString`). */
export function fmtTimestamp(ts: number, locale = "en-GB"): string {
  return dateFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).format(new Date(ts * 1000));
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtRelative(ts?: number | null, locale = "en-GB"): string {
  if (!ts) return "never";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(locale);
}

export function isListedSymbol(symbol: string): boolean {
  return /^[A-Z0-9.\-]{1,12}$/i.test(symbol);
}

const AXIS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** ISO day ("2026-09-20") → chart axis label ("Sept 20"; other years get a suffix: "Sept 20 '25"). */
export function chartDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = AXIS_MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  const label = `${month} ${Number(m[3])}`;
  return m[1] === String(new Date().getFullYear()) ? label : `${label} '${m[1].slice(2)}`;
}

/** Every numeric field across chart rows (the `date` key is skipped). */
export function numericValues(rows: Array<Record<string, unknown>>): number[] {
  const out: number[] = [];
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "date") continue;
      const n = typeof v === "number" ? v : Number(v);
      if (v !== null && v !== "" && Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function extent(nums: number[]): { min: number; max: number; span: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0, span: 1 };
  // A flat series still needs distinct ticks — fall back to 5% of the value.
  const span = max - min || Math.abs(max) * 0.05 || 1;
  return { min, max, span };
}

/**
 * Relative Y domain for the visible range, padded ~8% top and bottom so a
 * non-zero-based axis never renders the line flush against the frame.
 */
export function paddedDomain(values: number[]): [number, number] | undefined {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return undefined;
  const { min, max, span } = extent(nums);
  const pad = span * 0.08;
  return [min - pad, max + pad];
}

/**
 * Evenly spaced, round Y ticks for a relative (non-zero-based) axis.
 *
 * The padded domain alone lets recharts invent its own ticks, which can land on
 * uneven steps (4k / 19k / 34k / 46k) and make the grid look lopsided. Here the
 * domain and the ticks are derived from one nice step, so every grid line sits
 * the same distance from the last and the labels stay round numbers.
 */
export function evenAxisTicks(values: number[], tickCount = 4): { domain: [number, number]; ticks: number[] } | undefined {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return undefined;
  const { min, max, span } = extent(nums);
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max((hi - lo) / Math.max(1, tickCount), Number.EPSILON)));

  // Candidate round steps, from a tenth of the rough step up to ten times it.
  // Pick the one landing nearest the wanted number of gaps, then the one that
  // wastes least space — a coarse step otherwise strands the data in the middle.
  let best: { start: number; end: number; step: number; gaps: number } | undefined;
  for (const scale of [0.1, 1, 10]) {
    for (const fraction of [1, 2, 2.5, 5]) {
      const step = fraction * magnitude * scale;
      if (!Number.isFinite(step) || step <= 0) continue;
      const start = Math.floor(lo / step) * step;
      const end = Math.ceil(hi / step) * step;
      const gaps = Math.round((end - start) / step);
      if (gaps < 2) continue;
      const better = !best
        || Math.abs(gaps - tickCount) < Math.abs(best.gaps - tickCount)
        || (Math.abs(gaps - tickCount) === Math.abs(best.gaps - tickCount) && end - start < best.end - best.start);
      if (better) best = { start, end, step, gaps };
    }
  }
  if (!best) return undefined;

  const ticks: number[] = [];
  for (let i = 0; i <= best.gaps; i++) ticks.push(Number((best.start + i * best.step).toPrecision(12)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
}

/**
 * GBP axis ticks adapt to the visible range. The axis is relative (not zero-based),
 * so precision has to follow the zoom level or every tick rounds to the same label.
 */
export function gbpAxisFormatter(values: number[]): (v: number) => string {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return (v) => fmtGBP(v);
  const { max, span } = extent(nums);
  if (max < 10_000) return (v) => fmtGBP(v);
  // A relative axis that happens to reach zero should say "£0", not "£0k".
  const thousands = (v: number, digits: number) => v === 0 ? "£0" : `£${(v / 1000).toFixed(digits)}k`;
  if (span >= 10_000) return (v) => thousands(v, 0);
  if (span >= 1_000) return (v) => thousands(v, 1);
  return (v) => thousands(v, 2);
}

/** Price axis ticks: full precision only when the visible range is tight enough to need it. */
export function priceAxisFormatter(values: number[], currency?: string | null): (v: number) => string {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return (v) => fmtPrice(v, currency);
  const { span } = extent(nums);
  if (span >= 50) return (v) => fmtPrice(v, currency).replace(/\.\d+/, "");
  return (v) => fmtPrice(v, currency);
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
