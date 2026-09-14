import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] as unknown as never[] });

interface YahooQuoteResult {
  regularMarketPrice?: number;
  currency?: string;
}

interface YahooSearchQuote {
  symbol?: string;
  longname?: string;
  shortname?: string;
  longName?: string;
  shortName?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  quotedType?: string;
}

export function toYahooSymbol(symbol: string, exchange?: string) {
  if (symbol.includes(".")) {
    const p = symbol.split(".");
    if (p[p.length - 1].toUpperCase() === "LON") return `${p.slice(0, -1).join(".")}.L`;
    return symbol;
  }
  if (exchange?.toUpperCase() === "LSE" || exchange?.toUpperCase() === "LON") return `${symbol}.L`;
  return symbol;
}
export async function fetchQuotes(symbols: Array<{ symbol: string; exchange?: string }>, opts?: { disambiguate?: boolean }) {
  const out: Record<string, { price: number; currency: string }> = {};
  const key = (symbol: string, exchange?: string) => (opts?.disambiguate ? `${symbol}:${exchange ?? ""}` : symbol);
  await Promise.allSettled(
    symbols.map(async ({ symbol, exchange }) => {
      const ys = toYahooSymbol(symbol, exchange);
      try {
        const q = (await yf.quote(ys)) as unknown as YahooQuoteResult;
        const price = q.regularMarketPrice;
        const currency = q.currency || "USD";
        if (!price) return;
        out[symbol] = { price, currency };
        if (symbol !== symbol.toUpperCase()) out[symbol.toUpperCase()] = { price, currency };
        out[key(symbol, exchange)] = { price, currency };
      } catch {}
    })
  );
  return out;
}

export async function searchSymbols(query: string) {
  if (!query || query.trim().length < 1) return [];
  try {
    const res = (await yf.search(query.trim())) as unknown as { quotes?: YahooSearchQuote[] };
    const quotes = res.quotes ?? [];
    const arr = Array.isArray(quotes) ? quotes : [];
    return arr.slice(0, 8).map((q: YahooSearchQuote) => {
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
    }).filter((r) => r.symbol);
  } catch { return []; }
}
