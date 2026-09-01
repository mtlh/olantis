import { getDb } from "@/lib/db";
import { holdings, portfolios, accounts, providers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { neon } from "@neondatabase/serverless";

async function ensureHoldingsColumns() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`ALTER TABLE holdings ALTER COLUMN portfolio_id DROP NOT NULL`;
    await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS provider_id text REFERENCES providers(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS account_id text REFERENCES accounts(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS user_id text`;
  } catch {}
}

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

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  await ensureHoldingsColumns();
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const providerId = searchParams.get("providerId");
  const accountId = searchParams.get("accountId");
  const db = getDb();
  let rows: any[] = [];
  try {
    const p = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
    const pids = new Set(p.map(x=>x.id));
    const a = await db.select().from(accounts).where(eq(accounts.userId, userId));
    const aids = new Set(a.map(x=>x.id));
    const pr = await db.select().from(providers).where(eq(providers.userId, userId));
    const prid = new Set(pr.map(x=>x.id));
    const all = await db.select().from(holdings);
    rows = all.filter((h: any) => {
      if (h.portfolioId && pids.has(h.portfolioId)) return true;
      if (h.providerId && prid.has(h.providerId)) return true;
      if (h.accountId && aids.has(h.accountId)) return true;
      if (h.userId === userId) return true;
      return false;
    });
  } catch { rows = []; }
  if (portfolioId) rows = rows.filter((h:any)=> h.portfolioId===portfolioId);
  if (providerId) rows = rows.filter((h:any)=> h.providerId===providerId);
  if (accountId) rows = rows.filter((h:any)=> h.accountId===accountId);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureHoldingsColumns();
  const body = await req.json();
  const { id, portfolioId, providerId, accountId, symbol, name, shares, avgPrice, currentPrice, currency, purchaseDate, exchange } = body;
  if (!symbol?.trim()) return Response.json({ error: "symbol required" }, { status: 400 });
  if (!shares || Number(shares) <= 0) return Response.json({ error: "shares must be > 0" }, { status: 400 });
  if (avgPrice == null || Number(avgPrice) <= 0) return Response.json({ error: "avgPrice must be > 0" }, { status: 400 });
  const db = getDb();
  if (id) {
    const existing = await db.select().from(holdings).where(eq(holdings.id, id));
    if (!existing[0]) return Response.json({ error: "holding not found" }, { status: 404 });
    const h = existing[0] as any;
    let allowed = false;
    if (h.portfolioId) {
      const p = await db.select().from(portfolios).where(eq(portfolios.id, h.portfolioId));
      if (p[0] && p[0].userId===userId) allowed = true;
    } else if (h.providerId) {
      const pr = await db.select().from(providers).where(eq(providers.id, h.providerId));
      if (pr[0] && pr[0].userId===userId) allowed = true;
    } else if (h.accountId) {
      const a = await db.select().from(accounts).where(eq(accounts.id, h.accountId));
      if (a[0] && a[0].userId===userId) allowed = true;
    } else if (h.userId===userId) allowed = true;
    if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });
    await db.update(holdings).set({ symbol: symbol.toUpperCase().trim(), name: name?.trim() || symbol.toUpperCase().trim(), shares: Number(shares), avgPrice: Number(avgPrice), currentPrice: Number(currentPrice ?? avgPrice), currency: currency || "GBP", purchaseDate, exchange }).where(eq(holdings.id, id));
    return Response.json({ id });
  }
  const hasPortfolio = !!portfolioId;
  const hasProvider = !!providerId;
  const hasAccount = !!accountId;
  if (!hasPortfolio && !hasProvider && !hasAccount) return Response.json({ error: "portfolioId, providerId or accountId required" }, { status: 400 });
  if (hasPortfolio) {
    const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
    if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });
  }
  if (hasProvider) {
    const pr = await db.select().from(providers).where(eq(providers.id, providerId));
    if (!pr[0] || pr[0].userId !== userId) return Response.json({ error: "provider not found" }, { status: 404 });
  }
  if (hasAccount) {
    const a = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!a[0] || a[0].userId !== userId) return Response.json({ error: "account not found" }, { status: 404 });
  }
  const nid = crypto.randomUUID();
  await db.insert(holdings).values({ id: nid, portfolioId: portfolioId || null, providerId: providerId || null, accountId: accountId || null, userId, symbol: symbol.toUpperCase(), name: name || symbol, shares: Number(shares), avgPrice: Number(avgPrice), currentPrice: Number(currentPrice ?? avgPrice), currency: currency || "GBP", purchaseDate, exchange, lastRefreshedAt: null } as any);
  return Response.json({ id: nid });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureHoldingsColumns();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const h = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h[0]) return Response.json({ error: "not found" }, { status: 404 });
  const row = h[0] as any;
  let allowed = false;
  if (row.portfolioId) {
    const p = await db.select().from(portfolios).where(eq(portfolios.id, row.portfolioId));
    if (p[0] && p[0].userId===userId) allowed=true;
  } else if (row.providerId) {
    const pr = await db.select().from(providers).where(eq(providers.id, row.providerId));
    if (pr[0] && pr[0].userId===userId) allowed=true;
  } else if (row.accountId) {
    const a = await db.select().from(accounts).where(eq(accounts.id, row.accountId));
    if (a[0] && a[0].userId===userId) allowed=true;
  } else if (row.userId===userId) allowed=true;
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });
  await db.delete(holdings).where(eq(holdings.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureHoldingsColumns();
  const { symbols, force } = await req.json() as { symbols: Record<string, { price: number; currency: string }>; force?: boolean };
  const db = getDb();
  const userPortfolios = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const userProviders = await db.select().from(providers).where(eq(providers.userId, userId));
  const pids = userPortfolios.map((p) => p.id);
  const aids = userAccounts.map(a=>a.id);
  const prids = userProviders.map(p=>p.id);
  let all: any[] = [];
  try {
    const allHoldings = await db.select().from(holdings);
    all = allHoldings.filter((h:any)=>{
      if (h.portfolioId && pids.includes(h.portfolioId)) return true;
      if (h.providerId && prids.includes(h.providerId)) return true;
      if (h.accountId && aids.includes(h.accountId)) return true;
      if (h.userId===userId) return true;
      return false;
    });
  } catch { all = pids.length ? await db.select().from(holdings).where(inArray(holdings.portfolioId, pids)) : []; }
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  let updated = 0;
  let skipped = 0;
  let nextAllowedAt: number | null = null;
  for (const h of all) {
    const upd = (symbols as any)[h.symbol];
    if (!upd) continue;
    if (!force && h.lastRefreshedAt && now - h.lastRefreshedAt < DAY) {
      skipped++;
      const wait = h.lastRefreshedAt + DAY;
      if (nextAllowedAt === null || wait < nextAllowedAt) nextAllowedAt = wait;
      continue;
    }
    await db.update(holdings).set({ currentPrice: upd.price, currency: upd.currency, lastRefreshedAt: now }).where(eq(holdings.id, h.id));
    updated++;
  }
  if (!force && updated === 0 && skipped > 0) {
    return Response.json({ ok: false, error: "daily limit", message: "Prices already refreshed within 24h", nextAllowedAt, skipped }, { status: 429 });
  }
  return Response.json({ ok: true, updated, skipped, nextAllowedAt });
}
