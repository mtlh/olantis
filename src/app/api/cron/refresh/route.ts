import { fetchQuotes } from "@/lib/yahoo";
import { getDb } from "@/lib/db";
import { holdings, snapshots, portfolioSnapshots, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const REFRESH_GUARD_SECONDS = 23 * 60 * 60; // 23h, not 24h — avoids the daily-cron flip-flop
let lastRunAt = 0;

type HoldingRow = typeof holdings.$inferSelect;

function isAuthed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / no secret configured
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

const quoteKey = (symbol: string, exchange?: string | null) => `${symbol}:${exchange ?? ""}`;

async function doRefresh(body: { symbols?: Array<{ symbol: string; exchange?: string }>; force?: boolean }) {
  const db = getDb();

  let symbols = body.symbols ?? [];
  const targetHoldings: HoldingRow[] = await db.select().from(holdings);

  if (!symbols.length) {
    const map = new Map<string, { symbol: string; exchange?: string }>();
    for (const h of targetHoldings) {
      if (/^CASH$/i.test(h.symbol.trim())) continue;
      map.set(quoteKey(h.symbol, h.exchange), { symbol: h.symbol, exchange: h.exchange as string | undefined });
    }
    symbols = [...map.values()];
  }

  if (symbols.length === 0) return { success: true, symbolsUpdated: 0, skipped: 0, updatedAt: new Date().toISOString(), message: "No holdings" };

  let quotes: Record<string, { price: number; currency: string }> = {};
  try {
    quotes = await fetchQuotes(symbols, { disambiguate: true });
  } catch {}

  const unixNow = Math.floor(Date.now() / 1000);
  const applied = new Map<string, { price: number; currency: string }>();
  let updated = 0;
  let skipped = 0;

  const updates: Promise<unknown>[] = [];
  for (const h of targetHoldings) {
    if (/^CASH$/i.test(h.symbol.trim())) { skipped++; continue; }
    const q = quotes[quoteKey(h.symbol, h.exchange)];
    if (!q) continue;
    if (!body.force && h.lastRefreshedAt && unixNow - h.lastRefreshedAt < REFRESH_GUARD_SECONDS) { skipped++; continue; }
    updates.push(db.update(holdings).set({ currentPrice: q.price, currency: q.currency, lastRefreshedAt: unixNow }).where(eq(holdings.id, h.id)));
    applied.set(h.id, { price: q.price, currency: q.currency });
    updated++;
  }
  await Promise.all(updates);

  const refreshedHoldings = targetHoldings.map((h) => {
    const a = applied.get(h.id);
    return a ? { ...h, currentPrice: a.price, currency: a.currency, lastRefreshedAt: unixNow } : h;
  });
  await createSnapshots(refreshedHoldings);

  return { success: true, symbolsUpdated: updated, skipped, updatedAt: new Date().toISOString() };
}

async function createSnapshots(allHoldings: HoldingRow[]) {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];
  const userHoldings = new Map<string, HoldingRow[]>();
  for (const h of allHoldings) {
    if (!h.userId) continue;
    const arr = userHoldings.get(h.userId) ?? [];
    arr.push(h);
    userHoldings.set(h.userId, arr);
  }

  const valGBP = (h: HoldingRow) => {
    const v = h.shares * (h.currentPrice ?? 0);
    return h.currency === "GBX" || h.currency === "GBp" ? v / 100 : v;
  };

  for (const [userId, hs] of userHoldings) {
    const totalValue = hs.reduce((sum, h) => sum + valGBP(h), 0);
    if (totalValue === 0) continue;

    await db.insert(snapshots).values({ userId, date: today, value: totalValue }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: totalValue } });

    const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
    const pidToHoldings = new Map<string, HoldingRow[]>();
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

export async function POST(req: Request) {
  if (!isAuthed(req)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });

  const now = Date.now();
  if (now - lastRunAt < SIX_HOURS) {
    return Response.json({ success: true, skipped: "debounced", retryAfter: Math.ceil((SIX_HOURS - (now - lastRunAt)) / 1000) });
  }
  lastRunAt = now;

  let body: { symbols?: Array<{ symbol: string; exchange?: string }>; force?: boolean } = {};
  try { body = await req.json(); } catch {}

  return Response.json(await doRefresh(body));
}

export async function GET(req: Request) {
  if (!isAuthed(req)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const s = searchParams.get("symbol");
  if (s) {
    const quotes = await fetchQuotes([{ symbol: s }], { disambiguate: true });
    return Response.json({ success: true, quotes });
  }
  return Response.json(await doRefresh({}));
}
