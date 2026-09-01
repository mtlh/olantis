import { getDb } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

async function getUserId() {
  const jar = await cookies();
  if (jar.get("olantis_demo")?.value === "1") return "demo";
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: false } as Record<string, unknown>);
    if (user && typeof user === "object" && "id" in user) return String((user as { id: unknown }).id);
  } catch {}
  return null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return Response.json(rows);
}

async function ensureColorColumn() { try { const { neon } = await import("@neondatabase/serverless"); const sql = neon(process.env.DATABASE_URL!); await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color text`; } catch {} }
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureColorColumn();
  const { name, id, color } = await req.json();
  const db = getDb();
  if (id) {
    const existing = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
    const set: Partial<typeof accounts.$inferInsert> = {};
    if (name !== undefined) {
      if (!name?.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
      set.name = name.trim();
    }
    if (color !== undefined) set.color = color || null;
    if (Object.keys(set).length) await db.update(accounts).set(set).where(eq(accounts.id, id));
    return Response.json({ id });
  }
  if (!name?.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
  const nid = crypto.randomUUID();
  await db.insert(accounts).values({ id: nid, userId, name: name.trim(), color: color || null, createdAt: Math.floor(Date.now() / 1000) } as typeof accounts.$inferInsert);
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(accounts).where(eq(accounts.id, id));
  return Response.json({ ok: true });
}
