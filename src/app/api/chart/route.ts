import { fetchChart } from "@/lib/yahoo";
import { getUserId } from "@/lib/auth";

const RANGES = new Set(["1M", "3M", "1Y", "MAX"]);

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (!s) return Response.json({ error: "symbol required" }, { status: 400 });
  const exchange = searchParams.get("exchange") ?? undefined;
  const rangeParam = searchParams.get("range") ?? "1Y";
  const range = RANGES.has(rangeParam) ? rangeParam : "1Y";
  const chart = await fetchChart(s, exchange, range);
  if (!chart.length) return Response.json({ error: "no chart data" }, { status: 404 });
  return Response.json({ chart });
}
