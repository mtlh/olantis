import { getLatestFxRates } from "@/lib/fx";
import { getUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await getLatestFxRates());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "FX rates unavailable" }, { status: 503 });
  }
}
