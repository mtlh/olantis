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

export async function searchSymbols(query: string) {
  if (!query || query.trim().length < 1) return [];
  try {
    const res: any = await yf.search(query.trim());
    const quotes = res.quotes ?? res ?? [];
    const arr = Array.isArray(quotes) ? quotes : [];
    return arr.slice(0, 8).map((q: any) => {
      const symbol = q.symbol ?? "";
      const name = q.longname ?? q.shortname ?? q.longName ?? q.shortName ?? symbol;
      const exchange = q.exchange ?? q.exchDisp ?? "";
      const exchDisp = q.exchDisp ?? q.exchange ?? "";
      const type = q.quoteType ?? q.quotedType ?? "";
      let normExchange = exchange;
      const up = String(exchange).toUpperCase();
      if (up === "NMS" || up === "NGM" || up === "NCM") normExchange = "NASDAQ";
      else if (up === "NYQ" || up === "NYS") normExchange = "NYSE";
      else if (up === "ASE" || up === "AMX") normExchange = "AMEX";
      else if (up === "LSE" || up === "LON") normExchange = "LSE";
      else if (up === "PNK" || up === "OTC") normExchange = "OTC";
      return { symbol, name, exchange: normExchange, rawExchange: exchange, exchDisp, type, longname: name };
    }).filter((r: any) => r.symbol);
  } catch { return []; }
}
