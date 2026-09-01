import { fetchQuotes } from "@/lib/yahoo";
import { getDb } from "@/lib/db";
import { holdings, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { symbols?: Array<{ symbol: string; exchange?: string }>; force?: boolean } = {};
  try { body = await req.json(); } catch {}
  const db = getDb();

  let symbols = body.symbols ?? [];
  let targetHoldings = await db.select().from(holdings);

  if (!symbols.length) {
    const allHoldings = await db.select().from(holdings);
    const map = new Map<string, { symbol: string; exchange?: string }>();
    for (const h of allHoldings) map.set(`${h.symbol}:${h.exchange ?? ""}`, { symbol: h.symbol, exchange: h.exchange as string | undefined });
    symbols = [...map.values()];
    targetHoldings = allHoldings;
  }

  if (symbols.length === 0) return Response.json({ success: true, symbolsUpdated: 0, message: "No holdings" });

  const quotes = await fetchQuotes(symbols);
  const now = Math.floor(Date.now() / 1000);
  let updated = 0;
  let skipped = 0;
  for (const h of targetHoldings) {
    const q = (quotes as any)[h.symbol];
    if (!q) continue;
    if (!body.force && h.lastRefreshedAt && now - h.lastRefreshedAt < 86400) { skipped++; continue; }
    await db.update(holdings).set({ currentPrice: q.price, currency: q.currency, lastRefreshedAt: now }).where(eq(holdings.id, h.id));
    updated++;
  }

  return Response.json({ success: true, symbolsUpdated: updated, skipped, updatedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized — send Authorization: Bearer $CRON_SECRET" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (s) {
    const quotes = await fetchQuotes([{ symbol: s }]);
    return Response.json({ success: true, quotes });
  }
  return Response.json({ success: true, message: "Cron endpoint ready. POST with Authorization: Bearer $CRON_SECRET — no body needed for daily auto refresh (respects 24h limit, use {force:true} to bypass)." });
}
