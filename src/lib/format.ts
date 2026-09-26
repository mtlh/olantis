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

export function filterByRange<T extends { date: string }>(rows: T[], range: string): T[] {
  if (range === "MAX") return rows;
  const days = range === "1M" ? 31 : range === "3M" ? 92 : 365;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return rows.filter((row) => row.date >= cutoff);
}

export function fmtGBP(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Below £100 show pence — otherwise small balances all render as "£0".
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 100 ? 2 : 0;
  return new Intl.NumberFormat("en-GB", {
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
  if (currency === "GBX" || currency === "GBp") return `${Math.round(n).toLocaleString("en-GB")}p`;
  if (currency === "GBP") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (currency === "USD") return `$${Number(n).toFixed(2)}`;
  if (currency === "EUR") return `€${Number(n).toFixed(2)}`;
  return `${Number(n).toFixed(2)}${currency ? ` ${currency}` : ""}`;
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
 * GBP axis ticks adapt to the visible range. The axis is relative (not zero-based),
 * so precision has to follow the zoom level or every tick rounds to the same label.
 */
export function gbpAxisFormatter(values: number[]): (v: number) => string {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return (v) => fmtGBP(v);
  const { max, span } = extent(nums);
  if (max < 10_000) return (v) => fmtGBP(v);
  if (span >= 10_000) return (v) => `£${Math.round(v / 1000)}k`;
  if (span >= 1_000) return (v) => `£${(v / 1000).toFixed(1)}k`;
  return (v) => `£${(v / 1000).toFixed(2)}k`;
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
