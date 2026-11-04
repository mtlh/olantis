import { getUserId } from "@/lib/auth";
import { BENCHMARKS, earliestPortfolioDate, ensureBenchmarkSeries, isBenchmarkSymbol } from "@/lib/benchmark";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Daily benchmark closes, served from the database and topped up from Yahoo
 * when a new trading day has closed. The chart anchors the series to the first
 * portfolio snapshot, so `from` is the caller's earliest history date.
 */
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "";
  if (!isBenchmarkSymbol(symbol)) return Response.json({ error: "unknown benchmark" }, { status: 400 });

  const fromParam = searchParams.get("from");
  // Never fetch earlier than the oldest portfolio history in the database: the
  // chart cannot show it, and it keeps the upstream window bounded.
  const earliest = await earliestPortfolioDate();
  const requested = fromParam && ISO_DAY.test(fromParam) ? fromParam : earliest;
  const from = requested > earliest ? requested : earliest;

  try {
    const prices = await ensureBenchmarkSeries(symbol, from);
    return Response.json(
      { symbol, name: BENCHMARKS[symbol].name, currency: BENCHMARKS[symbol].currency, prices },
      { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch {
    return Response.json({ error: "benchmark unavailable" }, { status: 502 });
  }
}
