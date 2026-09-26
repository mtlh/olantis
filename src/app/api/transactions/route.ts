import { getDb } from "@/lib/db";
import { holdings, portfolios, transactions, providers, accounts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json([]);
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  const holdingId = searchParams.get("holdingId");
  const symbol = searchParams.get("symbol");
  const db = getDb();
  let rows: typeof transactions.$inferSelect[] = [];
  try {
    const conds = [eq(transactions.userId, userId)];
    if (portfolioId) conds.push(eq(transactions.portfolioId, portfolioId));
    if (holdingId) conds.push(eq(transactions.holdingId, holdingId));
    if (symbol) conds.push(eq(transactions.symbol, symbol.toUpperCase()));
    rows = await db.select().from(transactions).where(and(...conds));
  } catch (error) { return Response.json({ error: "Unable to load transactions", detail: error instanceof Error ? error.message : String(error) }, { status: 503 }); }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return Response.json(rows);
}

async function ownsHolding(db: ReturnType<typeof getDb>, h: typeof holdings.$inferSelect, userId: string) {
  if (h.userId === userId) return true;
  if (h.portfolioId) {
    const p = await db.select({ userId: portfolios.userId }).from(portfolios).where(eq(portfolios.id, h.portfolioId));
    if (p[0]?.userId === userId) return true;
  }
  if (h.providerId) {
    const pr = await db.select({ userId: providers.userId }).from(providers).where(eq(providers.id, h.providerId));
    if (pr[0]?.userId === userId) return true;
  }
  if (h.accountId) {
    const a = await db.select({ userId: accounts.userId }).from(accounts).where(eq(accounts.id, h.accountId));
    if (a[0]?.userId === userId) return true;
  }
  return false;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { portfolioId?: string | null; holdingId?: string; symbol?: string; name?: string; type?: string; shares?: number; price?: number; date?: string; note?: string; currency?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
  const { holdingId, symbol, type, shares, price, date, note } = body;
  if (!type || !["buy", "sell"].includes(type)) return Response.json({ error: "type must be buy or sell" }, { status: 400 });
  // Number.isFinite rejects NaN/Infinity as well as non-numeric input. A plain
  // `Number(x) <= 0` check passes `"abc"` (NaN) and `"1e400"` (Infinity), both
  // of which would otherwise be written into the money/quantity columns and
  // permanently corrupt the holding.
  const s = Number(shares);
  const pr = Number(price);
  if (!Number.isFinite(s) || s <= 0) return Response.json({ error: "shares must be a finite number > 0" }, { status: 400 });
  if (!Number.isFinite(pr) || pr <= 0) return Response.json({ error: "price must be a finite number > 0" }, { status: 400 });
  const db = getDb();
  let portfolioId: string | null = body.portfolioId ?? null;

  let holding: typeof holdings.$inferSelect | null = null;
  let targetSymbol = symbol?.toUpperCase()?.trim();
  let targetName = body.name?.trim() || targetSymbol;

  if (holdingId) {
    const hs = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    if (!hs[0]) return Response.json({ error: "holding not found" }, { status: 404 });
    if (!(await ownsHolding(db, hs[0], userId))) return Response.json({ error: "forbidden" }, { status: 403 });
    if (portfolioId && portfolioId !== hs[0].portfolioId) return Response.json({ error: "holding mismatch" }, { status: 400 });
    holding = hs[0];
    portfolioId = holding.portfolioId;
    targetSymbol = holding.symbol;
    targetName = holding.name;
  } else if (portfolioId) {
    const p = await db.select().from(portfolios).where(eq(portfolios.id, portfolioId));
    if (!p[0] || p[0].userId !== userId) return Response.json({ error: "portfolio not found" }, { status: 404 });
    if (!targetSymbol) return Response.json({ error: "symbol required" }, { status: 400 });
    const all = await db.select().from(holdings).where(eq(holdings.portfolioId, portfolioId));
    holding = all.find((h) => h.symbol === targetSymbol) ?? null;
  } else {
    return Response.json({ error: "holdingId or portfolioId required" }, { status: 400 });
  }

  const d = date || new Date().toISOString().split("T")[0];

  if (type === "sell") {
    if (!holding) return Response.json({ error: "no holding to sell" }, { status: 400 });
    if (s > holding.shares + 1e-6) return Response.json({ error: `cannot sell ${s} — only ${holding.shares} shares held` }, { status: 400 });
  }

  let createdHoldingId: string | null = null;
  if (type === "buy" && !holding) {
    createdHoldingId = crypto.randomUUID();
    const currency = typeof body.currency === "string" && body.currency ? body.currency : "GBP";
    await db.insert(holdings).values({
      id: createdHoldingId,
      portfolioId,
      userId,
      symbol: targetSymbol,
      name: targetName || targetSymbol,
      shares: s,
      avgPrice: pr,
      currentPrice: pr,
      currency,
      purchaseDate: d,
      exchange: null,
      lastRefreshedAt: null,
    });
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(transactions).values({
      id,
      userId,
      portfolioId,
      holdingId: holding?.id ?? createdHoldingId,
      symbol: targetSymbol,
      name: targetName,
      type,
      shares: s,
      price: pr,
      date: d,
      note: note || null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: unknown) {
    if (createdHoldingId) await db.delete(holdings).where(eq(holdings.id, createdHoldingId));
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  if (type === "buy") {
    if (holding) {
      const newShares = holding.shares + s;
      const newAvg = (holding.shares * holding.avgPrice + s * pr) / newShares;
      await db.update(holdings).set({ shares: newShares, avgPrice: newAvg }).where(eq(holdings.id, holding.id));
    }
  } else {
    const remaining = holding!.shares - s;
    await db.update(holdings).set({ shares: Math.max(0, remaining) }).where(eq(holdings.id, holding!.id));
  }

  return Response.json({ id, ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const rows = await db.select().from(transactions).where(eq(transactions.id, id));
  const tx = rows[0];
  if (!tx || tx.userId !== userId) return Response.json({ error: "not found" }, { status: 404 });
  if (tx.type !== "buy" && tx.type !== "sell") return Response.json({ error: "Only buy/sell transactions affect holdings" }, { status: 400 });

  const candidates = (await db.select().from(holdings).where(eq(holdings.symbol, tx.symbol)))
    .filter((h) => !tx.portfolioId || h.portfolioId === tx.portfolioId);
  let holding = candidates.find((h) => tx.holdingId === h.id);
  if (!holding) {
    for (const candidate of candidates) {
      if (await ownsHolding(db, candidate, userId)) { holding = candidate; break; }
    }
  }
  if (!holding) return Response.json({ error: "The position for this transaction no longer exists" }, { status: 409 });
  if (!(await ownsHolding(db, holding, userId))) return Response.json({ error: "forbidden" }, { status: 403 });

  const ledger = (await db.select().from(transactions).where(and(
    eq(transactions.userId, userId),
    eq(transactions.symbol, tx.symbol),
    tx.portfolioId ? eq(transactions.portfolioId, tx.portfolioId) : eq(transactions.holdingId, holding.id),
  ))).filter((item) => item.type === "buy" || item.type === "sell");
  const ordered = [...ledger].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  // Recover the opening position by reversing the complete weighted-average
  // ledger from today's state, then replay it without the deleted trade.
  let shares = holding.shares;
  let average = holding.avgPrice;
  for (const item of [...ordered].reverse()) {
    if (item.type === "sell") shares += item.shares;
    else {
      const priorShares = shares - item.shares;
      if (priorShares < -1e-6) return Response.json({ error: "Cannot safely reverse this transaction history" }, { status: 409 });
      const priorCost = shares * average - item.shares * item.price;
      shares = Math.max(0, priorShares);
      average = shares > 1e-6 ? Math.max(0, priorCost) / shares : 0;
    }
  }
  for (const item of ordered) {
    if (item.id === id) continue;
    if (item.type === "buy") {
      const next = shares + item.shares;
      average = next > 0 ? (shares * average + item.shares * item.price) / next : 0;
      shares = next;
    } else {
      if (item.shares > shares + 1e-6) return Response.json({ error: "Deleting this transaction would leave a later sale uncovered" }, { status: 409 });
      shares = Math.max(0, shares - item.shares);
      if (shares <= 1e-6) { shares = 0; average = 0; }
    }
  }
  await db.delete(transactions).where(eq(transactions.id, id));
  await db.update(holdings).set({ shares, avgPrice: average }).where(eq(holdings.id, holding.id));
  return Response.json({ ok: true });
}
