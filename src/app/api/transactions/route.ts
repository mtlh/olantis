import { getDb } from "@/lib/db";
import { holdings, portfolios, transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

async function getUserId() {
  const jar = await cookies();
  if (jar.get("olantis_demo")?.value === "1") return "demo";
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: false } as any);
    if (user) return (user as any).id;
  } catch {}
  return null;
}

async function ensureTable() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`CREATE TABLE IF NOT EXISTS transactions (id text PRIMARY KEY, user_id text NOT NULL, portfolio_id text NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE, holding_id text REFERENCES holdings(id) ON DELETE SET NULL, symbol text NOT NULL, name text, type text NOT NULL, shares real NOT NULL, price real NOT NULL, date text NOT NULL, note text, created_at integer NOT NULL)`;
  } catch {}
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const holdingId = searchParams.get("holdingId");
  const symbol = searchParams.get("symbol");
  const db = getDb();
  let rows: any[] = [];
  try {
    rows = await db.select().from(transactions).where(eq(transactions.userId, userId));
  } catch { return Response.json([]); }
  let filtered = rows;
  if (portfolioId) filtered = filtered.filter((r) => r.portfolioId === portfolioId);
  if (holdingId) filtered = filtered.filter((r) => r.holdingId === holdingId);
  if (symbol) filtered = filtered.filter((r) => r.symbol === symbol.toUpperCase());
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return Response.json(filtered);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureTable();
  const body = await req.json();
  const { portfolioId, holdingId, symbol, type, shares, price, date, note } = body;
  if (!portfolioId) return Response.json({ error: "portfolioId required" }, { status: 400 });
  if (!type || !["buy", "sell"].includes(type)) return Response.json({ error: "type must be buy or sell" }, { status: 400 });
  if (!shares || Number(shares) <= 0) return Response.json({ error: "shares > 0" }, { status: 400 });
  if (price == null || Number(price) <= 0) return Response.json({ error: "price > 0" }, { status: 400 });
  const db = getDb();
  const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
  if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });

  let holding: any = null;
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

  if (type === "buy") {
    if (holding) {
      const newShares = holding.shares + s;
      const newAvg = (holding.shares * holding.avgPrice + s * pr) / newShares;
      await db.update(holdings).set({ shares: newShares, avgPrice: newAvg }).where(eq(holdings.id, holding.id));
    } else {
      const nid = crypto.randomUUID();
      await db.insert(holdings).values({
        id: nid,
        portfolioId,
        symbol: targetSymbol,
        name: targetName || targetSymbol,
        shares: s,
        avgPrice: pr,
        currentPrice: pr,
        currency: "GBP",
        purchaseDate: d,
        exchange: null,
        lastRefreshedAt: null,
      });
      holding = { id: nid, symbol: targetSymbol, name: targetName };
    }
  } else {
    if (!holding) return Response.json({ error: "no holding to sell" }, { status: 400 });
    if (s > holding.shares + 1e-9) return Response.json({ error: `cannot sell ${s} — only ${holding.shares} shares held` }, { status: 400 });
    const remaining = holding.shares - s;
    if (remaining <= 0.000001) {
      await db.delete(holdings).where(eq(holdings.id, holding.id));
    } else {
      await db.update(holdings).set({ shares: remaining }).where(eq(holdings.id, holding.id));
    }
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(transactions).values({
      id,
      userId,
      portfolioId,
      holdingId: holding?.id ?? null,
      symbol: targetSymbol,
      name: targetName,
      type,
      shares: s,
      price: pr,
      date: d,
      note: note || null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
  return Response.json({ id, ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const rows = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!rows[0] || rows[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(transactions).where(eq(transactions.id, id));
  return Response.json({ ok: true });
}
