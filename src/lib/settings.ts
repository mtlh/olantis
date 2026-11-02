import { DEFAULT_FX_RATES, type FxRates } from "@/lib/format";

export type AppSettings = {
  currency: string;
  dateFormat: string;
  defaultRange: "1M" | "3M" | "1Y" | "MAX";
  showTradeMarkers: boolean;
  fxRates: FxRates;
  fxDate: string | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "GBP",
  dateFormat: "en-GB",
  defaultRange: "1Y",
  showTradeMarkers: true,
  fxRates: DEFAULT_FX_RATES,
  fxDate: null,
};

const RANGE_KEYS = ["1M", "3M", "1Y", "MAX"] as const;

/** Normalise the raw `/api/settings` row into the shape the dashboard uses. */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw ?? {}) as Partial<Record<keyof AppSettings, unknown>>;
  const range = typeof r.defaultRange === "string" && (RANGE_KEYS as readonly string[]).includes(r.defaultRange)
    ? (r.defaultRange as AppSettings["defaultRange"])
    : DEFAULT_SETTINGS.defaultRange;
  return {
    currency: typeof r.currency === "string" && r.currency ? r.currency : DEFAULT_SETTINGS.currency,
    dateFormat: typeof r.dateFormat === "string" && r.dateFormat ? r.dateFormat : DEFAULT_SETTINGS.dateFormat,
    defaultRange: range,
    showTradeMarkers: r.showTradeMarkers == null ? DEFAULT_SETTINGS.showTradeMarkers : Number(r.showTradeMarkers) !== 0,
    fxRates: DEFAULT_FX_RATES,
    fxDate: null,
  };
}
