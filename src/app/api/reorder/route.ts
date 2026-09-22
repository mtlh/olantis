import { getDb } from "@/lib/db";
import { accounts, providers, portfolios } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

const TABLES = { accounts, providers, portfolios } as const;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { table, ids } = (await req.json()) as { table: string; ids: string[] };
  if (!table || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "table and ids[] required" }, { status: 400 });
  }

  const schema = TABLES[table as keyof typeof TABLES];
  if (!schema) return Response.json({ error: "invalid table" }, { status: 400 });

  const db = getDb();
  await Promise.all(ids.map((id, i) => db.update(schema).set({ sortOrder: i }).where(and(eq(schema.id, id), eq(schema.userId, userId)))));
  return Response.json({ ok: true });
}
