import { searchSymbols, fetchQuotes } from "@/lib/yahoo";
import { getUserId } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? searchParams.get("query") ?? "").slice(0, 50);
  if (!q.trim()) return Response.json([]);
  const results = await searchSymbols(q);
  if (results.length === 0) return Response.json([]);
  const enriched = await Promise.all(results.slice(0, 5).map(async (r) => {
    try {
      const quotes = await fetchQuotes([{ symbol: r.symbol, exchange: r.exchange }], { disambiguate: true });
      const hit = quotes[r.symbol] ?? quotes[`${r.symbol}:${r.exchange ?? ""}`];
      return { ...r, price: hit?.price ?? null, currency: hit?.currency ?? null };
    } catch { return { ...r, price: null, currency: null }; }
  }));
  return Response.json(enriched);
}
