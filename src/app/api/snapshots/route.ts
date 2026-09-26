import { getDb } from "@/lib/db";
import { snapshots, portfolioSnapshots, holdingSnapshots, portfolios, holdings, accounts, providers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { todayISODate } from "@/lib/format";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ total: [], byPortfolio: {}, byHolding: {} });
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get("holdingId");
  const total = await db.select().from(snapshots).where(eq(snapshots.userId, userId));
  const perPort = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId));
  const ps = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  const nameById = new Map(ps.map((p) => [p.id, p.name]));
  const byPortfolio: Record<string, { name: string; data: { date: string; value: number }[] }> = {};
  for (const r of perPort) {
    const key = r.portfolioId;
    if (!byPortfolio[key]) byPortfolio[key] = { name: nameById.get(key) ?? key.slice(0, 6), data: [] };
    byPortfolio[key].data.push({ date: r.date, value: r.value });
  }
  for (const k of Object.keys(byPortfolio)) byPortfolio[k].data.sort((a, b) => a.date.localeCompare(b.date));
  const perHolding = await db.select().from(holdingSnapshots).where(eq(holdingSnapshots.userId, userId));
  const hs = holdingId ? await db.select().from(holdings).where(eq(holdings.id, holdingId)) : [];
  const inFilter = holdingId ? new Set(hs.map((h) => h.id)) : null;
  const byHolding: Record<string, { symbol: string; name: string; data: { date: string; value: number }[] }> = {};
  for (const r of perHolding) {
    if (inFilter && !inFilter.has(r.holdingId)) continue;
    const key = r.holdingId;
    if (!byHolding[key]) byHolding[key] = { symbol: "", name: "", data: [] };
    byHolding[key].data.push({ date: r.date, value: r.value });
  }
  const hIds = Object.keys(byHolding);
  if (hIds.length) {
    const rows = await db.select().from(holdings).where(eq(holdings.userId, userId));
    for (const h of rows) {
      const entry = byHolding[h.id];
      if (entry) { entry.symbol = h.symbol; entry.name = h.name; }
    }
  }
  for (const k of hIds) byHolding[k].data.sort((a, b) => a.date.localeCompare(b.date));
  total.sort((a, b) => a.date.localeCompare(b.date));
  return Response.json({ total: total.map((r) => ({ date: r.date, value: r.value })), byPortfolio, byHolding });
}

function finiteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  // Demo sessions are per-visitor isolated tenants (see lib/auth.ts), so demo
  // writes are safe and keep the sandbox interactive. Only the caller's own
  // rows are ever touched.
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: { value?: unknown; date?: unknown; portfolios?: unknown; portfolioId?: unknown; portfolioValue?: unknown; holdings?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
  const d = typeof body.date === "string" && body.date ? body.date : todayISODate();
  const db = getDb();

  const ownedPf = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.userId, userId));
  const ownedPids = new Set(ownedPf.map((p) => p.id));
  const ownedPr = await db.select({ id: providers.id }).from(providers).where(eq(providers.userId, userId));
  const ownedPrids = new Set(ownedPr.map((p) => p.id));
  const ownedAcc = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId));
  const ownedAids = new Set(ownedAcc.map((a) => a.id));

  const topValue = finiteNumber(body.value);
  if (topValue != null) {
    await db.insert(snapshots).values({ userId, date: d, value: topValue }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: topValue } });
  }

  const batch: { portfolioId: string; value: number }[] = [];
  if (Array.isArray(body.portfolios)) {
    for (const p of body.portfolios as Array<{ id?: unknown; value?: unknown }>) {
      if (!p?.id || typeof p.id !== "string" || !ownedPids.has(p.id)) continue;
      const v = finiteNumber(p.value);
      if (v == null) continue;
      batch.push({ portfolioId: p.id, value: v });
    }
  }
  if (typeof body.portfolioId === "string" && body.portfolioId && ownedPids.has(body.portfolioId)) {
    const v = finiteNumber(body.portfolioValue ?? body.value);
    if (v != null) batch.push({ portfolioId: body.portfolioId, value: v });
  }
  for (const b of batch) {
    await db.insert(portfolioSnapshots).values({ userId, portfolioId: b.portfolioId, date: d, value: b.value }).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: b.value } });
  }

  if (Array.isArray(body.holdings)) {
    const hv = body.holdings as Array<{ id?: unknown; value?: unknown }>;
    const ids = hv.map((h) => h?.id).filter((x): x is string => typeof x === "string");
    if (ids.length) {
      const rows = await db.select().from(holdings).where(inArray(holdings.id, ids));
      for (const h of rows) {
        const owned = (h.portfolioId && ownedPids.has(h.portfolioId)) || (h.providerId && ownedPrids.has(h.providerId)) || (h.accountId && ownedAids.has(h.accountId)) || h.userId === userId;
        if (!owned) continue;
        const src = hv.find((x) => x?.id === h.id);
        const v = finiteNumber(src?.value);
        if (v == null) continue;
        await db.insert(holdingSnapshots).values({ userId, holdingId: h.id, date: d, value: v }).onConflictDoUpdate({ target: [holdingSnapshots.userId, holdingSnapshots.holdingId, holdingSnapshots.date], set: { value: v } });
      }
    }
  }
  return Response.json({ ok: true });
}
