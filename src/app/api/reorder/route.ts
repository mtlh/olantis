import { getDb } from "@/lib/db";
import { accounts, providers, portfolios } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
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
  // One statement for the whole list. The previous `Promise.all` of one UPDATE
  // per id still issued N HTTP round trips to Neon (in parallel, but each with
  // its own request overhead); `UPDATE ... FROM (VALUES ...)` does it in one.
  const values = ids.map((id, i) => sql`(${id}::text, ${i}::integer)`);
  await db.execute(sql`
    UPDATE ${schema} AS t
    SET sort_order = v.sort_order
    FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, sort_order)
    WHERE t.id = v.id AND t.user_id = ${userId}
  `);
  return Response.json({ ok: true });
}
