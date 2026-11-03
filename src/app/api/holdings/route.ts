import { getDb } from "@/lib/db";
import { holdings, portfolios, accounts, providers, transactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { loadOwnedHoldings } from "@/lib/ownership";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const providerId = searchParams.get("providerId");
  const accountId = searchParams.get("accountId");
  const db = getDb();
  let rows: typeof holdings.$inferSelect[] = [];
  try {
    rows = await loadOwnedHoldings(db, userId, { portfolioId, providerId, accountId });
  } catch (error) {
    return Response.json({ error: "Unable to load holdings", detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
  return Response.json(rows);
}

function capStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { id?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; symbol?: string; name?: string; shares?: number; avgPrice?: number; currentPrice?: number; currency?: string; sector?: string | null; purchaseDate?: string; exchange?: string };
  const { id, portfolioId, providerId, accountId, symbol, name, shares, avgPrice, currentPrice, currency, sector, purchaseDate, exchange } = body;
  const symbolStr = capStr(symbol, 12).toUpperCase().trim();
  const sharesNum = Number(shares);
  const avgPriceNum = Number(avgPrice);
  const currentPriceNum = currentPrice == null ? avgPriceNum : Number(currentPrice);
  const nameStr = capStr(name, 80).trim();
  const currencyStr = capStr(currency, 8) || "GBP";
  const exchangeStr = exchange != null ? capStr(exchange, 16) || null : null;
  const db = getDb();
  if (id) {
    const existing = await db.select().from(holdings).where(eq(holdings.id, id));
    if (!existing[0]) return Response.json({ error: "holding not found" }, { status: 404 });
    const h = existing[0];
    let allowed = false;
    if (h.portfolioId) {
      const p = await db.select().from(portfolios).where(eq(portfolios.id, h.portfolioId));
      if (p[0] && p[0].userId === userId) allowed = true;
    } else if (h.providerId) {
      const pr = await db.select().from(providers).where(eq(providers.id, h.providerId));
      if (pr[0] && pr[0].userId === userId) allowed = true;
    } else if (h.accountId) {
      const a = await db.select().from(accounts).where(eq(accounts.id, h.accountId));
      if (a[0] && a[0].userId === userId) allowed = true;
    } else if (h.userId === userId) allowed = true;
    if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });
    const patch: Partial<typeof holdings.$inferInsert> = {};
    if (symbolStr) {
      if (!Number.isFinite(sharesNum) || sharesNum <= 0) return Response.json({ error: "shares must be > 0" }, { status: 400 });
      if (!Number.isFinite(avgPriceNum) || avgPriceNum <= 0) return Response.json({ error: "avgPrice must be > 0" }, { status: 400 });
      if (!Number.isFinite(currentPriceNum)) return Response.json({ error: "currentPrice must be a finite number" }, { status: 400 });
      patch.symbol = symbolStr;
      patch.name = nameStr || symbolStr;
      patch.shares = sharesNum;
      patch.avgPrice = avgPriceNum;
      patch.currentPrice = currentPriceNum;
      patch.currency = currencyStr;
      patch.sector = typeof sector === "string" ? capStr(sector, 48).trim() || null : null;
      patch.purchaseDate = purchaseDate;
      patch.exchange = exchangeStr;
    }
    if (portfolioId !== undefined && portfolioId !== h.portfolioId) {
      if (portfolioId) {
        const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
        if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });
        patch.portfolioId = portfolioId;
        patch.accountId = p[0].accountId;
        patch.providerId = p[0].providerId;
      } else {
        patch.portfolioId = null;
      }
    }
    if (Object.keys(patch).length === 0) return Response.json({ error: "nothing to update" }, { status: 400 });
    await db.update(holdings).set(patch).where(eq(holdings.id, id));
    if (patch.portfolioId !== undefined) {
      await db.update(transactions).set({ portfolioId: patch.portfolioId }).where(eq(transactions.holdingId, id));
    }
    return Response.json({ id });
  }
  if (!symbolStr) return Response.json({ error: "symbol required" }, { status: 400 });
  if (!Number.isFinite(sharesNum) || sharesNum <= 0) return Response.json({ error: "shares must be > 0" }, { status: 400 });
  if (!Number.isFinite(avgPriceNum) || avgPriceNum <= 0) return Response.json({ error: "avgPrice must be > 0" }, { status: 400 });
  if (!Number.isFinite(currentPriceNum)) return Response.json({ error: "currentPrice must be a finite number" }, { status: 400 });
  const hasPortfolio = !!portfolioId;
  const hasProvider = !!providerId;
  const hasAccount = !!accountId;
  if (!hasPortfolio && !hasProvider && !hasAccount) return Response.json({ error: "portfolioId, providerId or accountId required" }, { status: 400 });
  if (hasPortfolio) {
    const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId!));
    if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });
  }
  if (hasProvider) {
    const pr = await db.select().from(providers).where(eq(providers.id, providerId!));
    if (!pr[0] || pr[0].userId !== userId) return Response.json({ error: "provider not found" }, { status: 404 });
  }
  if (hasAccount) {
    const a = await db.select().from(accounts).where(eq(accounts.id, accountId!));
    if (!a[0] || a[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 404 });
  }
  const nid = crypto.randomUUID();
  await db.insert(holdings).values({ id: nid, portfolioId: portfolioId || null, providerId: providerId || null, accountId: accountId || null, userId, symbol: symbolStr, name: nameStr || symbolStr, shares: sharesNum, avgPrice: avgPriceNum, currentPrice: currentPriceNum, currency: currencyStr, sector: typeof sector === "string" ? capStr(sector, 48).trim() || null : null, purchaseDate, exchange: exchangeStr, lastRefreshedAt: null });
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const h = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h[0]) return Response.json({ error: "not found" }, { status: 404 });
  const row = h[0];
  let allowed = false;
  if (row.portfolioId) {
    const p = await db.select().from(portfolios).where(eq(portfolios.id, row.portfolioId));
    if (p[0] && p[0].userId === userId) allowed = true;
  } else if (row.providerId) {
    const pr = await db.select().from(providers).where(eq(providers.id, row.providerId));
    if (pr[0] && pr[0].userId === userId) allowed = true;
  } else if (row.accountId) {
    const a = await db.select().from(accounts).where(eq(accounts.id, row.accountId));
    if (a[0] && a[0].userId === userId) allowed = true;
  } else if (row.userId === userId) allowed = true;
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });
  await db.delete(holdings).where(eq(holdings.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { symbols, force } = (await req.json()) as { symbols: Record<string, { price: number; currency: string }>; force?: boolean };
  const db = getDb();
  let all: typeof holdings.$inferSelect[] = [];
  try {
    all = await loadOwnedHoldings(db, userId);
  } catch (error) {
    return Response.json({ error: "Unable to load holdings", detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
  const portfolioTypes = await db.select({ id: portfolios.id, type: portfolios.type }).from(portfolios).where(eq(portfolios.userId, userId));
  const manualIds = new Set(portfolioTypes.filter((p) => p.type === "manual").map((p) => p.id));
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  let updated = 0;
  let skipped = 0;
  let manualSkipped = 0;
  let nextAllowedAt: number | null = null;
  const toUpdate: { id: string; price: number; currency: string; ts: number }[] = [];
  for (const h of all) {
    const upd = symbols[h.symbol];
    if (!upd) continue;
    if (h.portfolioId && manualIds.has(h.portfolioId)) { manualSkipped++; continue; }
    if (/^CASH$/i.test(h.symbol.trim())) { skipped++; continue; }
    if (!force && h.lastRefreshedAt && now - h.lastRefreshedAt < DAY) {
      skipped++;
      const wait = h.lastRefreshedAt + DAY;
      if (nextAllowedAt === null || wait < nextAllowedAt) nextAllowedAt = wait;
      continue;
    }
    toUpdate.push({ id: h.id, price: upd.price, currency: upd.currency, ts: now });
    updated++;
  }
  if (toUpdate.length) {
    await db.execute(sql`UPDATE holdings SET current_price = v.price, currency = v.currency, last_refreshed_at = v.ts FROM (VALUES ${sql.join(toUpdate.map((u) => sql`(${u.id}, ${u.price}, ${u.currency}, ${u.ts})`), sql`, `)}) AS v(id, price, currency, ts) WHERE holdings.id = v.id`);
  }
  if (!force && updated === 0 && skipped > 0) {
    return Response.json({ ok: false, error: "daily limit", message: "Prices already refreshed within 24h", nextAllowedAt, skipped }, { status: 429 });
  }
  return Response.json({ ok: true, updated, skipped, manualSkipped, nextAllowedAt });
}
