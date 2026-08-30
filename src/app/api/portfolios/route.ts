import { getDb } from "@/lib/db";
import { portfolios, holdings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const db = getDb();
  const ps = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (ps.length === 0) return Response.json([]);
  const pids = ps.map((p) => p.id);
  const { inArray } = await import("drizzle-orm");
  const hs = await db.select().from(holdings).where(inArray(holdings.portfolioId, pids));
  const byPid = new Map<string, typeof hs>();
  for (const h of hs) {
    const arr = byPid.get(h.portfolioId) ?? [];
    arr.push(h);
    byPid.set(h.portfolioId, arr);
  }
  return Response.json(ps.map((p) => ({ ...p, holdings: byPid.get(p.id) ?? [] })));
}

async function ensurePortfolioProviderColumn() {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS provider_id text REFERENCES providers(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS color text`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color text`;
    await sql`ALTER TABLE providers ADD COLUMN IF NOT EXISTS color text`;
  } catch {}
}
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name, type, id, accountId, providerId, color } = await req.json();
  const db = getDb();
  await ensurePortfolioProviderColumn();
  if (id) {
    const existing = await db.select().from(portfolios).where(eq(portfolios.id, id));
    if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
    const set: any = {};
    if (name !== undefined) {
      if (!name.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
      set.name = name.trim();
    }
    if (type !== undefined) set.type = type;
    if (color !== undefined) set.color = color || null;
    if (accountId !== undefined) {
      if (accountId) {
        const { accounts } = await import("@/lib/db/schema");
        const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
        if (!acc[0] || acc[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 400 });
      }
      set.accountId = accountId || null;
    }
    if (providerId !== undefined) {
      if (providerId) {
        const { providers } = await import("@/lib/db/schema");
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
  if (!name?.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
  let finalAccountId: string | null = accountId || null;
  let finalProviderId: string | null = providerId || null;
  if (finalProviderId) {
    const { providers } = await import("@/lib/db/schema");
    const prov = await db.select().from(providers).where(eq(providers.id, finalProviderId));
    if (!prov[0] || prov[0].userId !== userId) return Response.json({ error: "provider not found" }, { status: 400 });
    finalAccountId = prov[0].accountId;
  }
  const nid = crypto.randomUUID();
  await db.insert(portfolios).values({ id: nid, userId, accountId: finalAccountId, providerId: finalProviderId, name, type, color: color || null, createdAt: Math.floor(Date.now() / 1000) } as any);
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
