import { getDb } from "@/lib/db";
import { providers, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { normalizeEntityIcon } from "@/lib/entity-icons";

function validName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.trim();
  if (t.length < 2 || t.length > 64) return null;
  return t;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const db = getDb();
  const rows = await db.select().from(providers).where(eq(providers.userId, userId));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name, id, accountId, color, icon } = (await req.json()) as { name?: string; id?: string; accountId?: string | null; color?: string | null; icon?: string | null };
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const iconId = normalizeEntityIcon(icon);
  if (icon && !iconId) return Response.json({ error: "unknown icon" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(providers).where(eq(providers.id, id));
  if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  const set: Partial<typeof providers.$inferInsert> = {};
  if (name !== undefined) {
    const n = validName(name);
    if (!n) return Response.json({ error: "name must be 2-64 characters" }, { status: 400 });
    set.name = n;
  }
  if (color !== undefined) set.color = color || null;
  if (icon !== undefined) set.icon = iconId;
  if (accountId !== undefined) {
    if (!accountId) return Response.json({ error: "accountId required to move provider" }, { status: 400 });
    const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!acc[0] || acc[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 400 });
    set.accountId = accountId;
  }
  if (Object.keys(set).length) await db.update(providers).set(set).where(eq(providers.id, id));
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(providers).where(eq(providers.id, id));
  if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(providers).where(eq(providers.id, id));
  return Response.json({ ok: true });
}
