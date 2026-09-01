import { searchSymbols, fetchQuotes } from "@/lib/yahoo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  if (!q.trim()) return Response.json([]);
  const results = await searchSymbols(q);
  if (results.length === 0) return Response.json([]);
  const enriched = await Promise.all(results.slice(0, 5).map(async (r: Record<string, unknown>) => {
    try {
      const quotes = await fetchQuotes([{ symbol: r.symbol as string, exchange: r.exchange as string }]);
      const hit = (quotes as Record<string, { price: number; currency: string }>)[r.symbol as string];
      return { ...r, price: hit?.price ?? null, currency: hit?.currency ?? null };
    } catch { return r; }
  }));
  return Response.json(enriched);
}
