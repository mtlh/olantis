import { getDb } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
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
    await sql`CREATE TABLE IF NOT EXISTS user_settings (user_id text PRIMARY KEY, currency text, date_format text, default_range text, show_trade_markers integer, updated_at integer NOT NULL)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color text`;
    await sql`ALTER TABLE providers ADD COLUMN IF NOT EXISTS color text`;
    await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS color text`;
  } catch {}
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({});
  await ensureTable();
  const db = getDb();
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return Response.json(rows[0] ?? { userId, currency: "GBP", dateFormat: "en-GB", defaultRange: "1Y", showTradeMarkers: 1 });
  } catch { return Response.json({}); }
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureTable();
  const body = await req.json();
  const { currency, dateFormat, defaultRange, showTradeMarkers } = body;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const vals: any = { userId, updatedAt: now };
  if (currency !== undefined) vals.currency = currency;
  if (dateFormat !== undefined) vals.dateFormat = dateFormat;
  if (defaultRange !== undefined) vals.defaultRange = defaultRange;
  if (showTradeMarkers !== undefined) vals.showTradeMarkers = showTradeMarkers ? 1 : 0;
  if (existing[0]) {
    await db.update(userSettings).set(vals).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({ userId, currency: currency ?? "GBP", dateFormat: dateFormat ?? "en-GB", defaultRange: defaultRange ?? "1Y", showTradeMarkers: showTradeMarkers ? 1 : 0, updatedAt: now });
  }
  return Response.json({ ok: true });
}
