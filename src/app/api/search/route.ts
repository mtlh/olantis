import { searchSymbols, fetchQuotes } from "@/lib/yahoo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  if (!q.trim()) return Response.json([]);
  const results = await searchSymbols(q);
  if (results.length === 0) return Response.json([]);
  const enriched = await Promise.all(results.slice(0, 5).map(async (r: any) => {
    try {
      const quotes = await fetchQuotes([{ symbol: r.symbol, exchange: r.exchange }]);
      const hit = (quotes as any)[r.symbol];
      return { ...r, price: hit?.price ?? null, currency: hit?.currency ?? null };
    } catch { return r; }
  }));
  return Response.json(enriched);
}
