import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { accounts, providers, portfolios, holdings, snapshots, portfolioSnapshots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";

function weeklyDates(years = 3): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setFullYear(start.getFullYear() - years);
  const d = new Date(start);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  while (d <= today) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  if (out[out.length - 1] !== today.toISOString().slice(0, 10)) out.push(today.toISOString().slice(0, 10));
  return out;
}

async function seedDemo(userId: string) {
  const db = getDb();
  const existing = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (existing.length > 0) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`CREATE TABLE IF NOT EXISTS providers (id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name text NOT NULL, created_at integer NOT NULL)`;
    await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS provider_id text REFERENCES providers(id) ON DELETE SET NULL`;
  } catch {}
  const accHousehold = { id: crypto.randomUUID(), userId, name: "Household", createdAt: now };
  const accPersonal = { id: crypto.randomUUID(), userId, name: "Personal", createdAt: now };
  await db.insert(accounts).values([accHousehold, accPersonal]);
  const provVanguard = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, name: "Vanguard", createdAt: now };
  const provT212 = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, name: "Trading 212", createdAt: now };
  const provHL = { id: crypto.randomUUID(), userId, accountId: accPersonal.id, name: "Hargreaves Lansdown", createdAt: now };
  try { await db.insert(providers).values([provVanguard, provT212, provHL]); } catch { const sql = neon(process.env.DATABASE_URL!); for(const pr of [provVanguard, provT212, provHL]) await sql`INSERT INTO providers (id, user_id, account_id, name, created_at) VALUES (${pr.id}, ${pr.userId}, ${pr.accountId}, ${pr.name}, ${pr.createdAt}) ON CONFLICT DO NOTHING`; }
  const p1 = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, providerId: provVanguard.id, name: "ISA — Global Tracker", type: "live", createdAt: now };
  const p2 = { id: crypto.randomUUID(), userId, accountId: accHousehold.id, providerId: provT212.id, name: "Trading 212 — Growth", type: "live", createdAt: now };
  const p3 = { id: crypto.randomUUID(), userId, accountId: accPersonal.id, providerId: provHL.id, name: "SIPP — Retirement", type: "live", createdAt: now };
  await db.insert(portfolios).values([p1, p2, p3] as any);
  const hs = [
    { id: crypto.randomUUID(), portfolioId: p1.id, symbol: "VWRP", name: "Vanguard FTSE All-World", shares: 120, avgPrice: 98, currentPrice: 106.4, currency: "GBP", purchaseDate: "2024-01-15", exchange: "LSE" },
    { id: crypto.randomUUID(), portfolioId: p1.id, symbol: "AAPL", name: "Apple Inc", shares: 15, avgPrice: 145, currentPrice: 178, currency: "USD", purchaseDate: "2024-03-10", exchange: "NASDAQ" },
    { id: crypto.randomUUID(), portfolioId: p1.id, symbol: "NVDA", name: "NVIDIA", shares: 8, avgPrice: 420, currentPrice: 485, currency: "USD", purchaseDate: "2024-05-20", exchange: "NASDAQ" },
    { id: crypto.randomUUID(), portfolioId: p2.id, symbol: "VUAG", name: "Vanguard S&P 500", shares: 200, avgPrice: 68, currentPrice: 74.2, currency: "GBP", purchaseDate: "2023-11-01", exchange: "LSE" },
    { id: crypto.randomUUID(), portfolioId: p3.id, symbol: "VWCE", name: "Vanguard FTSE All-World Acc", shares: 85, avgPrice: 95, currentPrice: 102.3, currency: "GBP", purchaseDate: "2024-02-10", exchange: "LSE" },
  ];
  await db.insert(holdings).values(hs as any);

  const yahoo = await import("yahoo-finance2").then((m: any) => new m.default({ suppressNotices: ["yahooSurvey", "ripHistorical"] }));
  const dates = weeklyDates(3);
  const period1 = dates[0];
  const period2 = dates[dates.length - 1];
  const priceMap = new Map<string, Map<string, number>>();
  for (const h of hs) {
    const m = new Map<string, number>();
    try {
      const chart: any = await yahoo.chart(h.symbol, { period1, period2, interval: "1wk" });
      for (const r of chart.quotes ?? []) {
        const key = new Date(r.date).toISOString().slice(0, 10);
        if (r.close != null) m.set(key, r.close);
      }
    } catch {}
    if (m.size < 20) {
      let p = h.avgPrice * (0.88 + Math.random() * 0.08);
      for (const d of dates) {
        const r = Math.random();
        let ret: number;
        if (r < 0.1) ret = Math.random() * 0.05 - 0.045;
        else if (r < 0.2) ret = Math.random() * 0.055 + 0.015;
        else ret = Math.random() * 0.068 - 0.034;
        p = p * (1 + ret);
        p = Math.max(p, h.avgPrice * 0.55);
        if (!m.has(d)) m.set(d, p);
      }
      const last = dates[dates.length - 1];
      if (m.has(last)) {
        const cur = m.get(last)!;
        const target = h.currentPrice;
        const scale = target / cur;
        const blended = new Map<string, number>();
        for (const [k, v] of m) {
          const idx = dates.indexOf(k);
          const t = idx / dates.length;
          const w = Math.pow(t, 1.5);
          blended.set(k, v * (1 + (scale - 1) * w));
        }
        priceMap.set(h.symbol, blended);
        continue;
      }
    }
    priceMap.set(h.symbol, m);
  }
  {
    const n = dates.length;
    const c1 = Math.floor(n * 0.32);
    const c2 = Math.floor(n * 0.70);
    function marketFactor(idx: number) {
      let f = 1;
      const s1 = c1 - 7, b1 = c1 + 2, e1 = c1 + 18, d1 = 0.19;
      if (idx >= s1 && idx <= e1) {
        if (idx <= b1) f = 1 - d1 * ((idx - s1) / (b1 - s1));
        else f = 1 - d1 * (1 - (idx - b1) / (e1 - b1));
      }
      const s2 = c2 - 8, b2 = c2 + 3, e2 = c2 + 20, d2 = 0.22;
      if (idx >= s2 && idx <= e2) {
        let f2 = 1;
        if (idx <= b2) f2 = 1 - d2 * ((idx - s2) / (b2 - s2));
        else f2 = 1 - d2 * (1 - (idx - b2) / (e2 - b2));
        f = Math.min(f, f2);
      }
      return f;
    }
    for (const m of priceMap.values()) {
      const entries = [...m.entries()];
      for (const [k, v] of entries) {
        const idx = dates.indexOf(k);
        const useIdx = idx >= 0 ? idx : (() => { let best = 0, bd = Infinity; for (let i = 0; i < dates.length; i++) { const d = Math.abs(new Date(k).getTime() - new Date(dates[i]).getTime()); if (d < bd) { bd = d; best = i; } } return best; })();
        m.set(k, v * marketFactor(useIdx));
      }
    }
  }
  function priceFor(symbol: string, date: string): number | undefined {
    const m = priceMap.get(symbol);
    if (!m) return undefined;
    if (m.has(date)) return m.get(date);
    let best: string | undefined;
    for (const k of m.keys()) if (k <= date && (!best || k > best)) best = k;
    if (best) return m.get(best);
    const first = [...m.keys()].sort()[0];
    return first ? m.get(first) : undefined;
  }
  for (const date of dates) {
    let total = 0;
    const byPort = new Map<string, number>();
    for (const h of hs) {
      const v = (priceFor(h.symbol, date) ?? h.currentPrice) * h.shares;
      total += v;
      byPort.set(h.portfolioId, (byPort.get(h.portfolioId) ?? 0) + v);
    }
    await db.insert(snapshots).values({ userId, date, value: total }).onConflictDoUpdate({ target: [snapshots.userId, snapshots.date], set: { value: total } });
    for (const [pid, val] of byPort) {
      await db.insert(portfolioSnapshots).values({ userId, portfolioId: pid, date, value: val }).onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.portfolioId, portfolioSnapshots.date], set: { value: val } });
    }
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clear = url.searchParams.get("clear");
  const jar = await cookies();
  if (clear) {
    const db = getDb();
    try { await db.delete(snapshots).where(eq(snapshots.userId, "demo")); } catch {}
    try { await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.userId, "demo")); } catch {}
    try {
      const ps = await getDb().select().from(portfolios).where(eq(portfolios.userId, "demo"));
      for (const p of ps) await getDb().delete(holdings).where(eq(holdings.portfolioId, p.id));
      await getDb().delete(portfolios).where(eq(portfolios.userId, "demo"));
      try { await db.delete(providers).where(eq(providers.userId, "demo")); } catch { try { const sql = neon(process.env.DATABASE_URL!); await sql`DELETE FROM providers WHERE user_id='demo'`; } catch {} }
      await getDb().delete(accounts).where(eq(accounts.userId, "demo"));
    } catch {}
    jar.delete("olantis_demo");
    redirect("/");
  }
  jar.set("olantis_demo", "1", { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  await seedDemo("demo");
  redirect("/dashboard");
}
