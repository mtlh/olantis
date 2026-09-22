export type MoneyHolding = {
  shares: number;
  avgPrice?: number;
  currentPrice?: number;
  currency?: string | null;
};

/** Convert a quoted amount into GBP (GBX/GBp pence → pounds). */
export function toGBP(value: number, currency?: string | null): number {
  if (currency === "GBX" || currency === "GBp") return value / 100;
  return value;
}

export function holdingValueGBP(h: MoneyHolding): number {
  return toGBP(h.shares * (h.currentPrice ?? 0), h.currency);
}

export function holdingCostGBP(h: MoneyHolding): number {
  return toGBP(h.shares * (h.avgPrice ?? 0), h.currency);
}

export function fmtGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

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

export function fmtRelative(ts?: number | null): string {
  if (!ts) return "never";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-GB");
}

export function isListedSymbol(symbol: string): boolean {
  return /^[A-Z0-9.\-]{1,12}$/i.test(symbol);
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
