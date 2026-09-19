import { fetchChart } from "@/lib/yahoo";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (!s) return Response.json({ error: "symbol required" }, { status: 400 });
  const exchange = searchParams.get("exchange") ?? undefined;
  const range = searchParams.get("range") ?? "1Y";
  const chart = await fetchChart(s, exchange, range);
  if (!chart.length) return Response.json({ error: "no chart data" }, { status: 404 });
  return Response.json({ currency: null, chart });
}
