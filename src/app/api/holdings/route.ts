import { getDb } from "@/lib/db";
import { holdings, portfolios } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { cookies } from "next/headers";

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

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, portfolioId, symbol, name, shares, avgPrice, currentPrice, currency, purchaseDate, exchange } = body;
  const db = getDb();
  const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
  if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });
  if (id) {
    await db.update(holdings).set({ symbol: symbol.toUpperCase(), name, shares: Number(shares), avgPrice: Number(avgPrice), currentPrice: Number(currentPrice ?? avgPrice), currency, purchaseDate, exchange }).where(eq(holdings.id, id));
    return Response.json({ id });
  }
  const nid = crypto.randomUUID();
  await db.insert(holdings).values({ id: nid, portfolioId, symbol: symbol.toUpperCase(), name: name || symbol, shares: Number(shares), avgPrice: Number(avgPrice), currentPrice: Number(currentPrice ?? avgPrice), currency: currency || "GBP", purchaseDate, exchange, lastRefreshedAt: null });
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const h = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h[0]) return Response.json({ error: "not found" }, { status: 404 });
  const p = await db.select().from(portfolios).where(eq(portfolios.id, h[0].portfolioId));
  if (!p[0] || p[0].userId !== userId) return Response.json({ error: "forbidden" }, { status: 403 });
  await db.delete(holdings).where(eq(holdings.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { symbols, force } = await req.json() as { symbols: Record<string, { price: number; currency: string }>; force?: boolean };
  const db = getDb();
  const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  const pids = userPortfolios.map((p) => p.id);
  if (!pids.length) return Response.json({ ok: true, updated: 0 });
  const all = pids.length ? await db.select().from(holdings).where(inArray(holdings.portfolioId, pids)) : [];
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  let updated = 0;
  let skipped = 0;
  let nextAllowedAt: number | null = null;
  for (const h of all) {
    const upd = (symbols as any)[h.symbol];
    if (!upd) continue;
    if (!force && h.lastRefreshedAt && now - h.lastRefreshedAt < DAY) {
      skipped++;
      const wait = h.lastRefreshedAt + DAY;
      if (nextAllowedAt === null || wait < nextAllowedAt) nextAllowedAt = wait;
      continue;
    }
    await db.update(holdings).set({ currentPrice: upd.price, currency: upd.currency, lastRefreshedAt: now }).where(eq(holdings.id, h.id));
    updated++;
  }
  if (!force && updated === 0 && skipped > 0) {
    return Response.json({ ok: false, error: "daily limit", message: "Prices already refreshed within 24h", nextAllowedAt, skipped }, { status: 429 });
  }
  return Response.json({ ok: true, updated, skipped, nextAllowedAt });
}
