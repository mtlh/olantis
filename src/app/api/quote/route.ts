import { fetchQuotes } from "@/lib/yahoo";
export async function POST(req: Request) {
  const { symbols } = (await req.json()) as { symbols: Array<{ symbol: string; exchange?: string }> };
  if (!symbols?.length) return Response.json({});
  return Response.json(await fetchQuotes(symbols));
}
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (!s) return Response.json({ error: "symbol required" }, { status: 400 });
  return Response.json(await fetchQuotes([{ symbol: s }]));
}
