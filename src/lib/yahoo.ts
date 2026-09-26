import YahooFinance from "yahoo-finance2";
import { cached } from "@/lib/http-cache";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface YahooQuoteResult {
  regularMarketPrice?: number | null;
  currency?: string | null;
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
  const ex = exchange?.toUpperCase();
  if (ex === "LSE" || ex === "LON") return `${symbol}.L`;
  return symbol;
}

export type QuoteMap = Record<string, { price: number; currency: string }>;

const quoteKey = (symbol: string, exchange?: string | null) =>
  `${symbol.toUpperCase()}:${(exchange ?? "").toUpperCase()}`;

export async function fetchQuotes(
  symbols: Array<{ symbol: string; exchange?: string }>,
  opts?: { disambiguate?: boolean }
): Promise<QuoteMap> {
  const out: QuoteMap = {};
  const key = (symbol: string, exchange?: string) =>
    opts?.disambiguate ? quoteKey(symbol, exchange) : symbol.toUpperCase();
  await Promise.allSettled(
    symbols.map(async ({ symbol, exchange }) => {
      const ys = toYahooSymbol(symbol, exchange);
      try {
        // Cache per Yahoo symbol so repeated refreshes across holdings/requests
        // share one upstream call and survive 429s with the last good price.
        const q = await cached("quote", ys, async () => {
          const raw = (await yf.quote(ys)) as unknown as YahooQuoteResult;
          return { price: raw.regularMarketPrice ?? null, currency: raw.currency || "USD" };
        });
        const price = q.price;
        const currency = q.currency;
        if (!price) return;
        const entry = { price, currency };
        const up = symbol.toUpperCase();
        out[up] = entry;
        if (symbol !== up) out[symbol] = entry;
        out[key(symbol, exchange)] = entry;
        if (opts?.disambiguate) out[quoteKey(up, exchange)] = entry;
      } catch {
        /* symbol not found */
      }
    })
  );
  return out;
}

export function lookupQuote(
  quotes: QuoteMap,
  symbol: string,
  exchange?: string | null
): { price: number; currency: string } | undefined {
  const up = symbol.toUpperCase();
  return quotes[quoteKey(up, exchange)] ?? quotes[up] ?? quotes[symbol];
}

export type ChartPoint = { date: string; price: number };

const CHART_RANGES: Record<string, { days: number; interval: "1d" | "1wk" | "1mo" }> = {
  "1M": { days: 31, interval: "1d" },
  "3M": { days: 92, interval: "1d" },
  "1Y": { days: 365, interval: "1wk" },
  MAX: { days: 365 * 40, interval: "1mo" },
};

export const CHART_RANGE_KEYS = Object.keys(CHART_RANGES);

export async function fetchChart(symbol: string, exchange?: string, range = "1Y"): Promise<ChartPoint[]> {
  const ys = toYahooSymbol(symbol, exchange);
  const cfg = CHART_RANGES[range] ?? CHART_RANGES["1Y"];
  const period2 = new Date().toISOString().slice(0, 10);
  // Bucket the cache key by day so intraday refreshes within a day share the
  // result, but the series still rolls forward tomorrow.
  const cacheKey = `${ys}|${range}|${period2}`;
  return cached("chart", cacheKey, async () => {
    const period1 = new Date(Date.now() - cfg.days * 86400000).toISOString().slice(0, 10);
    try {
      const res = await yf.chart(ys, { period1, period2, interval: cfg.interval, return: "array" });
      type RawChart = { quotes?: Array<{ date?: string | number; close?: number | null }> };
      const quotes = (res as unknown as RawChart).quotes ?? [];
      const out: ChartPoint[] = [];
      for (const q of quotes) {
        if (q.close == null || q.date == null) continue;
        const d = typeof q.date === "number" ? new Date(q.date * 1000) : new Date(q.date);
        out.push({ date: d.toISOString().slice(0, 10), price: q.close });
      }
      return out;
    } catch {
      return [];
    }
  });
}

/**
 * Arbitrary-window weekly history, used by the demo seed. Shares the same
 * cache/limiter as the rest of the Yahoo access so a demo burst cannot starve
 * real quote traffic or trip 429s.
 */
export async function fetchHistory(
  symbol: string,
  period1: string,
  period2: string,
  interval: "1d" | "1wk" | "1mo" = "1wk"
): Promise<Array<{ date: string; close: number }>> {
  return cached("chart", `${symbol}|${interval}|${period1}|${period2}`, async () => {
    try {
      const res = await yf.chart(toYahooSymbol(symbol), { period1, period2, interval, return: "array" });
      type RawChart = { quotes?: Array<{ date?: string | number | Date; close?: number | null }> };
      const quotes = (res as unknown as RawChart).quotes ?? [];
      const out: Array<{ date: string; close: number }> = [];
      for (const q of quotes) {
        if (q.close == null || q.date == null) continue;
        out.push({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close });
      }
      return out;
    } catch {
      return [];
    }
  });
}

const EXCHANGE_MAP: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NYQ: "NYSE",
  NYS: "NYSE",
  ASE: "AMEX",
  AMX: "AMEX",
  LSE: "LSE",
  LON: "LSE",
  PNK: "OTC",
  OTC: "OTC",
};

export async function searchSymbols(query: string) {
  const q = query.trim();
  if (!q) return [];
  return cached("search", q.toLowerCase(), async () => {
    try {
      const res = (await yf.search(q)) as unknown as { quotes?: YahooSearchQuote[] };
      const quotes = res.quotes ?? [];
      const arr = Array.isArray(quotes) ? quotes : [];
      return arr
        .slice(0, 8)
        .map((item: YahooSearchQuote) => {
          const symbol = item.symbol ?? "";
          const name = item.longname ?? item.shortname ?? item.longName ?? item.shortName ?? symbol;
          const rawExchange = item.exchange ?? item.exchDisp ?? "";
          const exchDisp = item.exchDisp ?? item.exchange ?? "";
          const type = item.quoteType ?? item.quotedType ?? "";
          const normExchange = EXCHANGE_MAP[String(rawExchange).toUpperCase()] ?? rawExchange;
          return { symbol, name, exchange: normExchange, rawExchange, exchDisp, type, longname: name };
        })
        .filter((r) => r.symbol);
    } catch {
      return [];
    }
  });
}
