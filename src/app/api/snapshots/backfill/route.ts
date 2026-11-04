import { getUserId } from "@/lib/auth";
import { backfillUserHistory } from "@/lib/backfill";

export const maxDuration = 60;

/**
 * Rebuild portfolio history from holdings + transaction ledgers.
 *
 * Called by the client once when the chart starts later than the earliest
 * purchase date. Completed holdings are marked, so repeat calls are cheap
 * no-ops; failures are retried by the daily cron backstop.
 */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { limit?: unknown } = {};
  try {
    body = (await req.json()) as { limit?: unknown };
  } catch {
    // An empty body is the normal client call.
  }
  const requested = Number(body.limit);
  const limit = Number.isFinite(requested) ? Math.min(24, Math.max(1, Math.floor(requested))) : undefined;

  try {
    const summary = await backfillUserHistory(userId, { limit });
    return Response.json(
      { ok: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
