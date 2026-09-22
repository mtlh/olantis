import { fetchQuotes } from "@/lib/yahoo";
import { getUserId } from "@/lib/auth";
import { isListedSymbol } from "@/lib/format";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { symbols } = (await req.json()) as { symbols?: Array<{ symbol?: string; exchange?: string }> };
  if (!Array.isArray(symbols) || !symbols.length) return Response.json({});
  const valid = symbols
    .slice(0, 20)
    .filter((s): s is { symbol: string; exchange?: string } => typeof s?.symbol === "string" && isListedSymbol(s.symbol));
  if (!valid.length) return Response.json({});
  return Response.json(await fetchQuotes(valid, { disambiguate: true }));
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  const exchange = searchParams.get("exchange") ?? undefined;
  if (!s) return Response.json({ error: "symbol required" }, { status: 400 });
  return Response.json(await fetchQuotes([{ symbol: s, exchange }], { disambiguate: true }));
}
