import { getDb } from "@/lib/db";
import { snapshots, portfolioSnapshots, portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
async function getUserId() {
  const jar = await cookies();
  if (jar.get("olantis_demo")?.value === "1") return "demo";
  try {
    const { withAuth } = await import("@workos-inc/authkit-nextjs");
    const { user } = await withAuth({ ensureSignedIn: false } as Record<string, unknown>);
    if (user && typeof user === "object" && "id" in user) return String((user as { id: unknown }).id);
  } catch {}
  return null;
}
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ total: [], byPortfolio: {} });
  const db = getDb();
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
  total.sort((a, b) => a.date.localeCompare(b.date));
  return Response.json({ total: total.map((r) => ({ date: r.date, value: r.value })), byPortfolio });
}
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId || userId === "demo") return Response.json({ ok: true, skipped: "demo" });
  const { value, date, portfolios: pfVals, portfolioId, portfolioValue } = await req.json();
  const d = date ?? new Date().toISOString().split("T")[0];
  const db = getDb();
  if (value != null) await db.insert(snapshots).values({ userId, date: d, value: Number(value) }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: Number(value) } });
  const batch: { portfolioId: string; value: number }[] = [];
  if (Array.isArray(pfVals)) for (const p of pfVals) if (p?.id) batch.push({ portfolioId: p.id, value: Number(p.value) });
  if (portfolioId) batch.push({ portfolioId, value: Number(portfolioValue ?? value) });
  for (const b of batch) await db.insert(portfolioSnapshots).values({ userId, portfolioId: b.portfolioId, date: d, value: b.value }).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: b.value } });
  return Response.json({ ok: true });
}
