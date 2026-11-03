import { and, desc, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { isListedSymbol } from "@/lib/format";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await getDb().select().from(watchlistItems).where(eq(watchlistItems.userId, userId)).orderBy(desc(watchlistItems.createdAt));
    return Response.json(rows);
  } catch (error) {
    return Response.json({ error: "Unable to load watchlist", detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { symbol?: string; name?: string; exchange?: string; currency?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
  const symbol = body.symbol?.trim().toUpperCase() ?? "";
  if (!isListedSymbol(symbol)) return Response.json({ error: "valid symbol required" }, { status: 400 });
  const db = getDb();
  const prior = await db.select({ id: watchlistItems.id }).from(watchlistItems).where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol)));
  if (prior.length) return Response.json({ error: `${symbol} is already on your watchlist` }, { status: 409 });
  const id = crypto.randomUUID();
  await db.insert(watchlistItems).values({ id, userId, symbol, name: body.name?.trim().slice(0, 80) || symbol, exchange: body.exchange?.trim().slice(0, 16) || null, currency: body.currency?.trim().slice(0, 8) || null, createdAt: Math.floor(Date.now() / 1000) });
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await getDb().delete(watchlistItems).where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)));
  return Response.json({ ok: true });
}
