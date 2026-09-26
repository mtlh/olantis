import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await getDb().select().from(goals).where(eq(goals.userId, userId)));
  } catch (error) {
    return Response.json({ error: "Unable to load goals", detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { id?: string; name?: string; targetValue?: number; targetDate?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
  const name = body.name?.trim() ?? "";
  const targetValue = Number(body.targetValue);
  const targetDate = body.targetDate ?? "";
  if (name.length < 2 || name.length > 64) return Response.json({ error: "name must be 2–64 characters" }, { status: 400 });
  if (!Number.isFinite(targetValue) || targetValue <= 0) return Response.json({ error: "targetValue must be a positive number" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate <= new Date().toISOString().slice(0, 10)) return Response.json({ error: "targetDate must be a future date" }, { status: 400 });
  const db = getDb();
  if (body.id) {
    const existing = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, body.id), eq(goals.userId, userId)));
    if (!existing.length) return Response.json({ error: "goal not found" }, { status: 404 });
    await db.update(goals).set({ name, targetValue, targetDate }).where(and(eq(goals.id, body.id), eq(goals.userId, userId)));
    return Response.json({ id: body.id });
  }
  const id = crypto.randomUUID();
  await db.insert(goals).values({ id, userId, name, targetValue, targetDate, createdAt: Math.floor(Date.now() / 1000) });
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await getDb().delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  return Response.json({ ok: true });
}
