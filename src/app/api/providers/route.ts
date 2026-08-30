import { getDb } from "@/lib/db";
import { providers, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

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
async function ensureTable() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name text NOT NULL, created_at integer NOT NULL)`;
    try { await sql`ALTER TABLE providers ADD COLUMN IF NOT EXISTS color text`; } catch {}
    try { await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color text`; } catch {}
    try { await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS provider_id text REFERENCES providers(id) ON DELETE SET NULL`; } catch {}
    try { await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS color text`; } catch {}
  } catch {}
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  await ensureTable();
  const db = getDb();
  try {
    const rows = await db.select().from(providers).where(eq(providers.userId, userId));
    return Response.json(rows);
  } catch { return Response.json([]); }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureTable();
  const { name, id, accountId, color } = await req.json();
  const db = getDb();
  if (id) {
    const existing = await db.select().from(providers).where(eq(providers.id, id));
    if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
    const set: any = {};
    if (name !== undefined) {
      if (!name.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
      set.name = name.trim();
    }
    if (color !== undefined) set.color = color || null;
    if (accountId !== undefined) {
      if (!accountId) return Response.json({ error: "accountId required to move provider" }, { status: 400 });
      const { accounts } = await import("@/lib/db/schema");
      const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!acc[0] || acc[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 400 });
      set.accountId = accountId;
    }
    if (Object.keys(set).length) await db.update(providers).set(set).where(eq(providers.id, id));
    return Response.json({ id });
  }
  if (!name?.trim() || name.trim().length < 2) return Response.json({ error: "name too short" }, { status: 400 });
  if (!accountId) return Response.json({ error: "accountId required" }, { status: 400 });
  const { accounts } = await import("@/lib/db/schema");
  const acc = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!acc[0] || acc[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 400 });
  const nid = crypto.randomUUID();
  await db.insert(providers).values({ id: nid, userId, accountId, name: name.trim(), color: color || null, createdAt: Math.floor(Date.now() / 1000) } as any);
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureTable();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(providers).where(eq(providers.id, id));
  if (!existing[0] || existing[0].userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  await db.delete(providers).where(eq(providers.id, id));
  return Response.json({ ok: true });
}
