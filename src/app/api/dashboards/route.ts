import { and, eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { normalizeDashboardColor, normalizeDashboardName, parseDashboardWidgets, type DashboardWidget } from "@/lib/dashboards";

type DashboardBody = {
  id?: string;
  name?: unknown;
  color?: unknown;
  widgets?: unknown;
};

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await getDb().select().from(dashboards).where(eq(dashboards.userId, userId));
    return Response.json(rows);
  } catch (error) {
    return Response.json(
      { error: "Unable to load dashboards", detail: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: DashboardBody;
  try {
    body = (await req.json()) as DashboardBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const name = normalizeDashboardName(body.name);
  if (!name) return Response.json({ error: "name must be 2–40 characters" }, { status: 400 });
  const widgets = parseDashboardWidgets(body.widgets);
  if (!widgets) return Response.json({ error: "invalid widget layout" }, { status: 400 });

  const db = getDb();

  if (body.id) {
    const existing = await db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, body.id), eq(dashboards.userId, userId)));
    if (!existing.length) return Response.json({ error: "dashboard not found" }, { status: 404 });

    const set: { name: string; color: string | null; widgets: DashboardWidget[] } = {
      name,
      color: normalizeDashboardColor(body.color),
      widgets,
    };
    await db.update(dashboards).set(set).where(and(eq(dashboards.id, body.id), eq(dashboards.userId, userId)));
    return Response.json({ id: body.id });
  }

  const nextOrder = await db
    .select({ value: sql<number>`coalesce(max(${dashboards.sortOrder}), 0) + 1` })
    .from(dashboards)
    .where(eq(dashboards.userId, userId));
  const id = crypto.randomUUID();
  await db.insert(dashboards).values({
    id,
    userId,
    name,
    color: normalizeDashboardColor(body.color),
    widgets,
    sortOrder: Number(nextOrder[0]?.value ?? 1),
    createdAt: Math.floor(Date.now() / 1000),
  });
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const existing = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)));
  if (!existing.length) return Response.json({ error: "dashboard not found" }, { status: 404 });

  await db.delete(dashboards).where(and(eq(dashboards.id, id), eq(dashboards.userId, userId)));
  return Response.json({ ok: true });
}
