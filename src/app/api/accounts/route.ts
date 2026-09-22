import { getDb } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return Response.json(rows);
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
  const body = (await req.json()) as { name?: string; id?: string; color?: string | null };
  const { name, id, color } = body;
  const db = getDb();
  if (id) {
    const existing = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
    const set: Partial<typeof accounts.$inferInsert> = {};
    if (name !== undefined) {
      const n = validName(name);
      if (!n) return Response.json({ error: "name must be 2-64 characters" }, { status: 400 });
      set.name = n;
    }
    if (color !== undefined) set.color = color || null;
    if (Object.keys(set).length) await db.update(accounts).set(set).where(eq(accounts.id, id));
    return Response.json({ id });
  }
  const n = validName(name);
  if (!n) return Response.json({ error: "name must be 2-64 characters" }, { status: 400 });
  const nid = crypto.randomUUID();
  await db.insert(accounts).values({ id: nid, userId, name: n, color: color || null, createdAt: Math.floor(Date.now() / 1000) });
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
