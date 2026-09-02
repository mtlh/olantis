import { fetchQuotes } from "@/lib/yahoo";
import { getDb } from "@/lib/db";
import { holdings, snapshots, portfolioSnapshots, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SIX_HOURS = 6 * 60 * 60 * 1000;
let lastRunAt = 0;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  const isCron = secret && auth === `Bearer ${secret}`;

  const now = Date.now();
  if (!isCron && now - lastRunAt < SIX_HOURS) {
    return Response.json({ success: true, skipped: "debounced", retryAfter: Math.ceil((SIX_HOURS - (now - lastRunAt)) / 1000) });
  }
  lastRunAt = now;

  let body: { symbols?: Array<{ symbol: string; exchange?: string }>; force?: boolean } = {};
  try { body = await req.json(); } catch {}
  const db = getDb();

  let symbols = body.symbols ?? [];
  let targetHoldings = await db.select().from(holdings);

  if (!symbols.length) {
    const allHoldings = await db.select().from(holdings);
    const map = new Map<string, { symbol: string; exchange?: string }>();
    for (const h of allHoldings) {
      if (/^CASH$/i.test(h.symbol.trim())) continue;
      map.set(`${h.symbol}:${h.exchange ?? ""}`, { symbol: h.symbol, exchange: h.exchange as string | undefined });
    }
    symbols = [...map.values()];
    targetHoldings = allHoldings;
  }

  if (symbols.length === 0) return Response.json({ success: true, symbolsUpdated: 0, message: "No holdings" });

  const quotes = await fetchQuotes(symbols);
  const unixNow = Math.floor(Date.now() / 1000);
  let updated = 0;
  let skipped = 0;
  for (const h of targetHoldings) {
    const q = (quotes as Record<string, { price: number; currency: string }>)[h.symbol];
    if (!q) continue;
    if (/^CASH$/i.test(h.symbol.trim())) { skipped++; continue; }
    if (!body.force && h.lastRefreshedAt && unixNow - h.lastRefreshedAt < 86400) { skipped++; continue; }
    await db.update(holdings).set({ currentPrice: q.price, currency: q.currency, lastRefreshedAt: unixNow }).where(eq(holdings.id, h.id));
    updated++;
  }

  await createSnapshots(db);

  return Response.json({ success: true, symbolsUpdated: updated, skipped, updatedAt: new Date().toISOString() });
}

async function createSnapshots(db: ReturnType<typeof getDb>) {
  const today = new Date().toISOString().split("T")[0];
  const allHoldings = await db.select().from(holdings);
  const userHoldings = new Map<string, typeof allHoldings>();
  for (const h of allHoldings) {
    if (!h.userId) continue;
    const arr = userHoldings.get(h.userId) ?? [];
    arr.push(h);
    userHoldings.set(h.userId, arr);
  }

  const valGBP = (h: typeof allHoldings[number]) => {
    const v = h.shares * (h.currentPrice ?? 0);
    return h.currency === "GBX" || h.currency === "GBp" ? v / 100 : v;
  };

  for (const [userId, hs] of userHoldings) {
    const totalValue = hs.reduce((sum, h) => sum + valGBP(h), 0);
    if (totalValue === 0) continue;

    await db.insert(snapshots).values({ userId, date: today, value: totalValue }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: totalValue } });

    const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
    const pidToHoldings = new Map<string, typeof hs>();
    for (const h of hs) {
      if (!h.portfolioId) continue;
      const arr = pidToHoldings.get(h.portfolioId) ?? [];
      arr.push(h);
      pidToHoldings.set(h.portfolioId, arr);
    }
    for (const p of userPortfolios) {
      const phs = pidToHoldings.get(p.id) ?? [];
      const pfValue = phs.reduce((sum, h) => sum + valGBP(h), 0);
      if (pfValue === 0) continue;
      await db.insert(portfolioSnapshots).values({ userId, portfolioId: p.id, date: today, value: pfValue }).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: pfValue } });
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (s) {
    const quotes = await fetchQuotes([{ symbol: s }]);
    return Response.json({ success: true, quotes });
  }
  return Response.json({ success: true, message: "Cron endpoint ready. POST — no body needed for daily auto refresh. Send Authorization: Bearer $CRON_SECRET to bypass 6h debounce. Use {force:true} to bypass 24h price limit." });
}
