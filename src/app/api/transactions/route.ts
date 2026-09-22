import { getDb } from "@/lib/db";
import { holdings, portfolios, transactions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const holdingId = searchParams.get("holdingId");
  const symbol = searchParams.get("symbol");
  const db = getDb();
  let rows: typeof transactions.$inferSelect[] = [];
  try {
    const conds = [eq(transactions.userId, userId)];
    if (portfolioId) conds.push(eq(transactions.portfolioId, portfolioId));
    if (holdingId) conds.push(eq(transactions.holdingId, holdingId));
    if (symbol) conds.push(eq(transactions.symbol, symbol.toUpperCase()));
    rows = await db.select().from(transactions).where(and(...conds));
  } catch { return Response.json([]); }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { portfolioId?: string; holdingId?: string; symbol?: string; name?: string; type?: string; shares?: number; price?: number; date?: string; note?: string; currency?: string };
  const { portfolioId, holdingId, symbol, type, shares, price, date, note } = body;
  if (!portfolioId) return Response.json({ error: "portfolioId required" }, { status: 400 });
  if (!type || !["buy", "sell"].includes(type)) return Response.json({ error: "type must be buy or sell" }, { status: 400 });
  if (!shares || Number(shares) <= 0) return Response.json({ error: "shares > 0" }, { status: 400 });
  if (price == null || Number(price) <= 0) return Response.json({ error: "price > 0" }, { status: 400 });
  const db = getDb();
  const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
  if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });

  let holding: typeof holdings.$inferSelect | null = null;
  let targetSymbol = symbol?.toUpperCase()?.trim();
  let targetName = body.name?.trim() || targetSymbol;

  if (holdingId) {
    const hs = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    if (!hs[0]) return Response.json({ error: "holding not found" }, { status: 404 });
    if (hs[0].portfolioId !== portfolioId) return Response.json({ error: "holding mismatch" }, { status: 400 });
    holding = hs[0];
    targetSymbol = holding.symbol;
    targetName = holding.name;
  } else {
    if (!targetSymbol) return Response.json({ error: "symbol required" }, { status: 400 });
    const all = await db.select().from(holdings).where(eq(holdings.portfolioId, portfolioId));
    holding = all.find((h) => h.symbol === targetSymbol) ?? null;
  }

  const s = Number(shares);
  const pr = Number(price);
  const d = date || new Date().toISOString().split("T")[0];

  if (type === "sell") {
    if (!holding) return Response.json({ error: "no holding to sell" }, { status: 400 });
    if (s > holding.shares + 1e-6) return Response.json({ error: `cannot sell ${s} — only ${holding.shares} shares held` }, { status: 400 });
  }

  let createdHoldingId: string | null = null;
  if (type === "buy" && !holding) {
    createdHoldingId = crypto.randomUUID();
    const currency = typeof body.currency === "string" && body.currency ? body.currency : "GBP";
    await db.insert(holdings).values({
      id: createdHoldingId,
      portfolioId,
      userId,
      symbol: targetSymbol,
      name: targetName || targetSymbol,
      shares: s,
      avgPrice: pr,
      currentPrice: pr,
      currency,
      purchaseDate: d,
      exchange: null,
      lastRefreshedAt: null,
    });
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(transactions).values({
      id,
      userId,
      portfolioId,
      holdingId: holding?.id ?? createdHoldingId,
      symbol: targetSymbol,
      name: targetName,
      type,
      shares: s,
      price: pr,
      date: d,
      note: note || null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: unknown) {
    if (createdHoldingId) await db.delete(holdings).where(eq(holdings.id, createdHoldingId));
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  if (type === "buy") {
    if (holding) {
      const newShares = holding.shares + s;
      const newAvg = (holding.shares * holding.avgPrice + s * pr) / newShares;
      await db.update(holdings).set({ shares: newShares, avgPrice: newAvg }).where(eq(holdings.id, holding.id));
    }
  } else {
    const remaining = holding!.shares - s;
    if (remaining <= 1e-6) {
      await db.delete(holdings).where(eq(holdings.id, holding!.id));
    } else {
      await db.update(holdings).set({ shares: remaining }).where(eq(holdings.id, holding!.id));
    }
  }

  return Response.json({ id, ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const rows = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!rows[0] || rows[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(transactions).where(eq(transactions.id, id));
  return Response.json({ ok: true });
}
