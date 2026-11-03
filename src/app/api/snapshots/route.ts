import { getDb } from "@/lib/db";
import { snapshots, portfolioSnapshots, holdingSnapshots, portfolios, holdings, providers, accounts } from "@/lib/db/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { todayISODate, rangeCutoff } from "@/lib/format";
import { windowSeries } from "@/lib/snapshot-window";

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ total: [], byPortfolio: {}, byHolding: {} });
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get("holdingId");
  const range = searchParams.get("range");
  const cutoff = range ? rangeCutoff(range) : null;
  const applyWindow = cutoff == null;

  if (holdingId) {
    const totalConds = [eq(snapshots.userId, userId)];
    if (cutoff) totalConds.push(gte(snapshots.date, cutoff));
    const holdingConds = [eq(holdingSnapshots.userId, userId), eq(holdingSnapshots.holdingId, holdingId)];
    if (cutoff) holdingConds.push(gte(holdingSnapshots.date, cutoff));

    const [totalRows, holdingRows, hRows] = await db.batch([
      db.select({ date: snapshots.date, value: snapshots.value }).from(snapshots).where(and(...totalConds)),
      db.select({ date: holdingSnapshots.date, value: holdingSnapshots.value, holdingId: holdingSnapshots.holdingId }).from(holdingSnapshots).where(and(...holdingConds)),
      db.select({ id: holdings.id, symbol: holdings.symbol, name: holdings.name }).from(holdings).where(eq(holdings.id, holdingId)),
    ]);

    const total = (totalRows as { date: string; value: number }[]).map((r) => ({ date: r.date, value: r.value }));
    const sortedTotal = total.sort((a, b) => a.date.localeCompare(b.date));
    const finalTotal = applyWindow ? windowSeries(sortedTotal) : sortedTotal;

    const byHolding: Record<string, { symbol: string; name: string; data: { date: string; value: number }[] }> = {};
    for (const r of holdingRows as { date: string; value: number; holdingId: string }[]) {
      const key = r.holdingId;
      if (!byHolding[key]) byHolding[key] = { symbol: "", name: "", data: [] };
      byHolding[key].data.push({ date: r.date, value: r.value });
    }
    const h = (hRows as { id: string; symbol: string; name: string }[])[0];
    for (const key of Object.keys(byHolding)) {
      const entry = byHolding[key];
      if (h) { entry.symbol = h.symbol; entry.name = h.name; }
      entry.data.sort((a, b) => a.date.localeCompare(b.date));
      if (applyWindow) entry.data = windowSeries(entry.data);
    }

    return Response.json(
      { total: finalTotal, byPortfolio: {}, byHolding },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } },
    );
  }

  const totalConds = [eq(snapshots.userId, userId)];
  if (cutoff) totalConds.push(gte(snapshots.date, cutoff));
  const portConds = [eq(portfolioSnapshots.userId, userId)];
  if (cutoff) portConds.push(gte(portfolioSnapshots.date, cutoff));
  const holdConds = [eq(holdingSnapshots.userId, userId)];
  if (cutoff) holdConds.push(gte(holdingSnapshots.date, cutoff));

  const [totalRows, perPort, ps, perHolding, hs] = await db.batch([
    db.select({ date: snapshots.date, value: snapshots.value }).from(snapshots).where(and(...totalConds)),
    db.select({ portfolioId: portfolioSnapshots.portfolioId, date: portfolioSnapshots.date, value: portfolioSnapshots.value }).from(portfolioSnapshots).where(and(...portConds)),
    db.select({ id: portfolios.id, name: portfolios.name }).from(portfolios).where(eq(portfolios.userId, userId)),
    db.select({ holdingId: holdingSnapshots.holdingId, date: holdingSnapshots.date, value: holdingSnapshots.value }).from(holdingSnapshots).where(and(...holdConds)),
    db.select({ id: holdings.id, symbol: holdings.symbol, name: holdings.name, userId: holdings.userId }).from(holdings).where(eq(holdings.userId, userId)),
  ]);

  const nameById = new Map((ps as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const byPortfolio: Record<string, { name: string; data: { date: string; value: number }[] }> = {};
  for (const r of perPort as { portfolioId: string; date: string; value: number }[]) {
    const key = r.portfolioId;
    if (!byPortfolio[key]) byPortfolio[key] = { name: nameById.get(key) ?? key.slice(0, 6), data: [] };
    byPortfolio[key].data.push({ date: r.date, value: r.value });
  }
  for (const k of Object.keys(byPortfolio)) {
    byPortfolio[k].data.sort((a, b) => a.date.localeCompare(b.date));
    if (applyWindow) byPortfolio[k].data = windowSeries(byPortfolio[k].data);
  }

  const byHolding: Record<string, { symbol: string; name: string; data: { date: string; value: number }[] }> = {};
  for (const r of perHolding as { holdingId: string; date: string; value: number }[]) {
    const key = r.holdingId;
    if (!byHolding[key]) byHolding[key] = { symbol: "", name: "", data: [] };
    byHolding[key].data.push({ date: r.date, value: r.value });
  }
  const holdingNameById = new Map((hs as { id: string; symbol: string; name: string }[]).map((h) => [h.id, h]));
  for (const key of Object.keys(byHolding)) {
    const entry = byHolding[key];
    const h = holdingNameById.get(key);
    if (h) { entry.symbol = h.symbol; entry.name = h.name; }
    entry.data.sort((a, b) => a.date.localeCompare(b.date));
    if (applyWindow) entry.data = windowSeries(entry.data);
  }

  const totalArr = (totalRows as { date: string; value: number }[]).map((r) => ({ date: r.date, value: r.value }));
  totalArr.sort((a, b) => a.date.localeCompare(b.date));
  const finalTotal = applyWindow ? windowSeries(totalArr) : totalArr;

  return Response.json(
    { total: finalTotal, byPortfolio, byHolding },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } },
  );
}

function finiteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
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
  if (batch.length) {
    await db.insert(portfolioSnapshots).values(batch.map((b) => ({ userId, portfolioId: b.portfolioId, date: d, value: b.value }))).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: sql`excluded.value` } });
  }

  if (Array.isArray(body.holdings)) {
    const hv = body.holdings as Array<{ id?: unknown; value?: unknown }>;
    const ids = hv.map((h) => h?.id).filter((x): x is string => typeof x === "string");
    if (ids.length) {
      const rows = await db.select().from(holdings).where(inArray(holdings.id, ids));
      const holdingBatch: { holdingId: string; value: number }[] = [];
      for (const h of rows) {
        const owned = (h.portfolioId && ownedPids.has(h.portfolioId)) || (h.providerId && ownedPrids.has(h.providerId)) || (h.accountId && ownedAids.has(h.accountId)) || h.userId === userId;
        if (!owned) continue;
        const src = hv.find((x) => x?.id === h.id);
        const v = finiteNumber(src?.value);
        if (v == null) continue;
        holdingBatch.push({ holdingId: h.id, value: v });
      }
      if (holdingBatch.length) {
        await db.insert(holdingSnapshots).values(holdingBatch.map((b) => ({ userId, holdingId: b.holdingId, date: d, value: b.value }))).onConflictDoUpdate({ target: [holdingSnapshots.userId, holdingSnapshots.holdingId, holdingSnapshots.date], set: { value: sql`excluded.value` } });
      }
    }
  }
  return Response.json({ ok: true });
}