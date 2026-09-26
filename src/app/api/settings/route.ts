import { getDb } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({});
  const db = getDb();
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return Response.json(rows[0] ?? { userId, currency: "GBP", dateFormat: "en-GB", defaultRange: "1Y", showTradeMarkers: 1 });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { currency?: string; dateFormat?: string; defaultRange?: string; showTradeMarkers?: boolean | number };
  const { currency, dateFormat, defaultRange, showTradeMarkers } = body;
  if (dateFormat !== undefined && !["en-GB", "en-US", "de-DE", "fr-FR"].includes(dateFormat)) return Response.json({ error: "unsupported date format" }, { status: 400 });
  if (defaultRange !== undefined && !["1M", "3M", "1Y", "MAX"].includes(defaultRange)) return Response.json({ error: "unsupported chart range" }, { status: 400 });
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const vals: Partial<typeof userSettings.$inferInsert> & { userId: string; updatedAt: number } = { userId, updatedAt: now };
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
