import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] as any });
export function toYahooSymbol(symbol: string, exchange?: string) {
  if (symbol.includes(".")) {
    const p = symbol.split(".");
    if (p[p.length - 1].toUpperCase() === "LON") return `${p.slice(0, -1).join(".")}.L`;
    return symbol;
  }
  if (exchange?.toUpperCase() === "LSE" || exchange?.toUpperCase() === "LON") return `${symbol}.L`;
  return symbol;
}
export async function fetchQuotes(symbols: Array<{ symbol: string; exchange?: string }>) {
  const out: Record<string, { price: number; currency: string }> = {};
  for (const { symbol, exchange } of symbols) {
    const ys = toYahooSymbol(symbol, exchange);
    try {
      const q: any = await yf.quote(ys);
      let price = q.regularMarketPrice;
      let currency = q.currency || "USD";
      if (!price) continue;
      if (currency === "GBX" || currency === "GBp") { price /= 100; currency = "GBP"; }
      out[symbol] = { price, currency };
    } catch {}
  }
  return out;
}
