/**
 * Sector classification for the allocation chart.
 *
 * `holdings.sector` is authoritative when set (manual entry, CSV import or a
 * Yahoo lookup). A lot of positions never get an explicit value, though, so we
 * keep a small deterministic map for the symbols people actually hold. That
 * makes the Sectors tab useful immediately — including the demo tenant, whose
 * dataset is built without any upstream calls.
 *
 * Fund trackers have no single GICS sector; they are labelled by exposure
 * instead ("Global Equity", "US Equity"), which is what an allocation view
 * should show for a broad index fund.
 */

export const UNCLASSIFIED_SECTOR = "Unclassified";

const SYMBOL_SECTORS: Record<string, string> = {
  // Technology
  AAPL: "Technology",
  ADBE: "Technology",
  AMD: "Technology",
  AVGO: "Technology",
  CRM: "Technology",
  INTC: "Technology",
  MSFT: "Technology",
  NVDA: "Technology",
  ORCL: "Technology",
  QCOM: "Technology",
  TSM: "Technology",
  // Communication services
  DIS: "Communication Services",
  GOOG: "Communication Services",
  GOOGL: "Communication Services",
  META: "Communication Services",
  NFLX: "Communication Services",
  T: "Communication Services",
  VZ: "Communication Services",
  // Consumer discretionary
  AMZN: "Consumer Discretionary",
  HD: "Consumer Discretionary",
  MCD: "Consumer Discretionary",
  NKE: "Consumer Discretionary",
  SBUX: "Consumer Discretionary",
  TSLA: "Consumer Discretionary",
  // Consumer staples
  COST: "Consumer Staples",
  KO: "Consumer Staples",
  PEP: "Consumer Staples",
  PG: "Consumer Staples",
  WMT: "Consumer Staples",
  // Financials
  BAC: "Financials",
  BRK: "Financials",
  JPM: "Financials",
  MA: "Financials",
  V: "Financials",
  // Health care
  JNJ: "Health Care",
  LLY: "Health Care",
  PFE: "Health Care",
  UNH: "Health Care",
  // Energy
  CVX: "Energy",
  XOM: "Energy",
  // Industrials
  BA: "Industrials",
  CAT: "Industrials",
  GE: "Industrials",
  // Utilities
  NEE: "Utilities",
  // Materials
  LIN: "Materials",
  // Real estate
  AMT: "Real Estate",
  PLD: "Real Estate",
  // Broad index funds
  EQQQ: "US Technology",
  QQQ: "US Technology",
  SPY: "US Equity",
  VOO: "US Equity",
  VTI: "US Equity",
  VUAG: "US Equity",
  VUSA: "US Equity",
  VWCE: "Global Equity",
  VWRA: "Global Equity",
  VWRL: "Global Equity",
  VWRP: "Global Equity",
  // Cash-like balances
  CASH: "Cash",
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(L|US|DE|PA|AS)$/i, "");
}

/** Static classification for a ticker, or `null` when we don't know it. */
export function sectorForSymbol(symbol: string): string | null {
  if (!symbol) return null;
  return SYMBOL_SECTORS[normalizeSymbol(symbol)] ?? null;
}

/**
 * The label a holding should appear under in the sector allocation:
 * explicit sector first, then the static map, then "Unclassified".
 */
export function holdingSector(holding: { symbol: string; sector?: string | null }): string {
  return holding.sector?.trim() || sectorForSymbol(holding.symbol) || UNCLASSIFIED_SECTOR;
}
