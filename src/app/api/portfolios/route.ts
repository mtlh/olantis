import { getDb } from "@/lib/db";
import { portfolios, holdings, accounts, providers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const db = getDb();
  const ps = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (ps.length === 0) return Response.json([]);
  const pids = ps.map((p) => p.id);
  const hs = await db.select().from(holdings).where(inArray(holdings.portfolioId, pids));
  const byPid = new Map<string, typeof hs>();
  for (const h of hs) {
    const arr = byPid.get(h.portfolioId!) ?? [];
    arr.push(h);
    byPid.set(h.portfolioId!, arr);
  }
  return Response.json(ps.map((p) => ({ ...p, holdings: byPid.get(p.id) ?? [] })));
}

function validName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (t.length < 2 || t.length > 64) return null;
  return t;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name, type, id, accountId, providerId, color } = (await req.json()) as { name?: string; type?: string; id?: string; accountId?: string | null; providerId?: string | null; color?: string | null };
  const db = getDb();
  if (id) {
    const existing = await db.select().from(portfolios).where(eq(portfolios.id, id));
    if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
    const set: Partial<typeof portfolios.$inferInsert> = {};
    if (name !== undefined) {
      const n = validName(name);
      if (!n) return Response.json({ error: "name must be 2-64 characters" }, { status: 400 });
      set.name = n;
    }
    if (type !== undefined) {
      if (type !== "live" && type !== "manual") return Response.json({ error: "type must be live or manual" }, { status: 400 });
      set.type = type;
    }
    if (color !== undefined) set.color = color || null;
    if (accountId !== undefined) {
      if (accountId) {
        const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
        if (!acc[0] || acc[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 400 });
      }
      set.accountId = accountId || null;
    }
    if (providerId !== undefined) {
      if (providerId) {
        const prov = await db.select().from(providers).where(eq(providers.id, providerId));
        if (!prov[0] || prov[0].userId !== userId) return Response.json({ error: "provider not found" }, { status: 400 });
        set.providerId = providerId;
        if (prov[0].accountId) set.accountId = prov[0].accountId;
      } else {
        set.providerId = null;
      }
    }
    await db.update(portfolios).set(set).where(eq(portfolios.id, id));
    return Response.json({ id });
  }
  const n = validName(name);
  if (!n) return Response.json({ error: "name must be 2-64 characters" }, { status: 400 });
  if (type !== "live" && type !== "manual") return Response.json({ error: "type must be live or manual" }, { status: 400 });
  let finalAccountId: string | null = accountId || null;
  const finalProviderId: string | null = providerId || null;
  if (finalProviderId) {
    const prov = await db.select().from(providers).where(eq(providers.id, finalProviderId));
    if (!prov[0] || prov[0].userId !== userId) return Response.json({ error: "provider not found" }, { status: 400 });
    finalAccountId = prov[0].accountId;
  }
  const nid = crypto.randomUUID();
  await db.insert(portfolios).values({ id: nid, userId, accountId: finalAccountId, providerId: finalProviderId, name: n, type, color: color || null, createdAt: Math.floor(Date.now() / 1000) });
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(portfolios).where(eq(portfolios.id, id));
  if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(holdings).where(eq(holdings.portfolioId, id));
  await db.delete(portfolios).where(eq(portfolios.id, id));
  return Response.json({ ok: true });
}
