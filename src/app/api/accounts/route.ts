import { getDb } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
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
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name, id } = await req.json();
  const db = getDb();
  if (id) {
    await db.update(accounts).set({ name }).where(eq(accounts.id, id));
    return Response.json({ id });
  }
  const nid = crypto.randomUUID();
  await db.insert(accounts).values({ id: nid, userId, name: name.trim(), createdAt: Math.floor(Date.now() / 1000) });
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.delete(accounts).where(eq(accounts.id, id));
  return Response.json({ ok: true });
}
