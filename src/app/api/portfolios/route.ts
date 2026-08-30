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
  const hs = await db.select().from(holdings);
  const byPid = new Map<string, typeof hs>();
  for (const h of hs) {
    const arr = byPid.get(h.portfolioId) ?? [];
    arr.push(h);
    byPid.set(h.portfolioId, arr);
  }
  return Response.json(ps.filter((p) => p.userId === userId).map((p) => ({ ...p, holdings: byPid.get(p.id) ?? [] })));
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name, type, id, accountId } = await req.json();
  const db = getDb();
  if (id) {
    const set: any = {};
    if (name !== undefined) set.name = name;
    if (type !== undefined) set.type = type;
    if (accountId !== undefined) set.accountId = accountId || null;
    await db.update(portfolios).set(set).where(eq(portfolios.id, id));
    return Response.json({ id });
  }
  const nid = crypto.randomUUID();
  await db.insert(portfolios).values({ id: nid, userId, accountId: accountId || null, name, type, createdAt: Math.floor(Date.now() / 1000) });
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.delete(holdings).where(eq(holdings.portfolioId, id));
  await db.delete(portfolios).where(eq(portfolios.id, id));
  return Response.json({ ok: true });
}
