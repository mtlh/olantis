import { timingSafeEqual } from "node:crypto";
import { fetchQuotes, lookupQuote } from "@/lib/yahoo";
import { getDb } from "@/lib/db";
import { holdings, snapshots, portfolioSnapshots, holdingSnapshots, portfolios } from "@/lib/db/schema";
import { eq, sql, notLike, isNull, or } from "drizzle-orm";
import { toGBP, todayISODate, DEFAULT_FX_RATES } from "@/lib/format";
import { getLatestFxRates, refreshFxRates } from "@/lib/fx";
import { pruneDemoSessions } from "@/lib/demo-cleanup";

const REFRESH_GUARD_SECONDS = 23 * 60 * 60;

type HoldingRow = typeof holdings.$inferSelect;

function isAuthed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const quoteKey = (symbol: string, exchange?: string | null) => `${symbol.toUpperCase()}:${(exchange ?? "").toUpperCase()}`;

async function doRefresh(body: { symbols?: Array<{ symbol: string; exchange?: string }>; force?: boolean }) {
  const db = getDb();
  try { await refreshFxRates(); } catch { /* retain the most recent stored rates */ }
  let fxRates = DEFAULT_FX_RATES;
  try { fxRates = { ...DEFAULT_FX_RATES, ...(await getLatestFxRates()).rates }; } catch {}

  let symbols = body.symbols ?? [];
  // Demo tenants (`demo:*`) carry a predefined dataset and are deliberately
  // excluded: refreshing them would overwrite the fixed demo prices and burn
  // Yahoo quota on throwaway sandboxes.
  const targetHoldings: HoldingRow[] = await db
    .select()
    .from(holdings)
      .where(or(isNull(holdings.userId), notLike(holdings.userId, "demo:%")));
  const manualRows = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.type, "manual"));
  const manualPortfolioIds = new Set(manualRows.map((p) => p.id));
  const refreshableHoldings = targetHoldings.filter((h) => !h.portfolioId || !manualPortfolioIds.has(h.portfolioId));

  if (!symbols.length) {
    const map = new Map<string, { symbol: string; exchange?: string }>();
    for (const h of refreshableHoldings) {
      if (/^CASH$/i.test(h.symbol.trim())) continue;
      map.set(quoteKey(h.symbol, h.exchange), { symbol: h.symbol, exchange: h.exchange ?? undefined });
    }
    symbols = [...map.values()];
  }

  if (symbols.length === 0) return { success: true, symbolsUpdated: 0, skipped: 0, failed: [], updatedAt: new Date().toISOString(), message: "No holdings" };

  let quotes: Record<string, { price: number; currency: string }> = {};
  try {
    quotes = await fetchQuotes(symbols, { disambiguate: true });
  } catch {}

  const unixNow = Math.floor(Date.now() / 1000);
  const applied = new Map<string, { price: number; currency: string }>();
  let updated = 0;
  let skipped = 0;
  const failed = symbols.filter((s) => !lookupQuote(quotes, s.symbol, s.exchange)).map((s) => s.symbol);

  const updates: Promise<unknown>[] = [];
  for (const h of refreshableHoldings) {
    if (/^CASH$/i.test(h.symbol.trim())) { skipped++; continue; }
    const q = lookupQuote(quotes, h.symbol, h.exchange);
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
  await createSnapshots(refreshedHoldings, fxRates);

  return { success: true, symbolsUpdated: updated, skipped, failed: [...new Set(failed)], updatedAt: new Date().toISOString() };
}

async function createSnapshots(allHoldings: HoldingRow[], fxRates: Record<string, number>) {
  const db = getDb();
  const today = todayISODate();
  const userHoldings = new Map<string, HoldingRow[]>();
  for (const h of allHoldings) {
    if (!h.userId) continue;
    const arr = userHoldings.get(h.userId) ?? [];
    arr.push(h);
    userHoldings.set(h.userId, arr);
  }

  const valGBP = (h: HoldingRow) => toGBP(h.shares * (h.currentPrice ?? 0), h.currency, fxRates);

  for (const [userId, hs] of userHoldings) {
    const totalValue = hs.reduce((sum, h) => sum + valGBP(h), 0);
    await db.insert(snapshots).values({ userId, date: today, value: totalValue }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: totalValue } });

    const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
    const pidToHoldings = new Map<string, HoldingRow[]>();
    for (const h of hs) {
      if (!h.portfolioId) continue;
      const arr = pidToHoldings.get(h.portfolioId) ?? [];
      arr.push(h);
      pidToHoldings.set(h.portfolioId, arr);
    }
    const pfRows: { userId: string; portfolioId: string; date: string; value: number }[] = [];
    for (const p of userPortfolios) {
      const phs = pidToHoldings.get(p.id) ?? [];
      pfRows.push({ userId, portfolioId: p.id, date: today, value: phs.reduce((sum, h) => sum + valGBP(h), 0) });
    }
    if (pfRows.length) {
      await db.insert(portfolioSnapshots).values(pfRows).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: sql`excluded.value` } });
    }

    const hBatch = hs.map((h) => ({ userId, holdingId: h.id, date: today, value: valGBP(h) }));
    if (hBatch.length) {
      await db.insert(holdingSnapshots).values(hBatch).onConflictDoUpdate({ target: [holdingSnapshots.userId, holdingSnapshots.holdingId, holdingSnapshots.date], set: { value: sql`excluded.value` } });
    }
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
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
  const result = await doRefresh({});
  // Demo housekeeping rides along with the scheduled refresh instead of running
  // on every "Try demo" click.
  await pruneDemoSessions();
  return Response.json(result);
}
