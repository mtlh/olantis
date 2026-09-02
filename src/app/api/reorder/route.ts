import { getDb } from "@/lib/db";
import { accounts, providers, portfolios } from "@/lib/db/schema";
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

const TABLES = { accounts, providers, portfolios } as const;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { table, ids } = await req.json() as { table: string; ids: string[] };
  if (!table || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "table and ids[] required" }, { status: 400 });
  }

  const schema = TABLES[table as keyof typeof TABLES];
  if (!schema) return Response.json({ error: "invalid table" }, { status: 400 });

  const db = getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.update(schema).set({ sortOrder: i }).where(eq(schema.id, ids[i]));
  }
  return Response.json({ ok: true });
}
