import { desc, sql } from "drizzle-orm";
import { fxRates } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { FxRates } from "@/lib/format";

export async function refreshFxRates() {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=GBP", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FX provider returned ${response.status}`);
  const payload = (await response.json()) as { date?: string; rates?: Record<string, number> };
  if (!payload.date || !payload.rates) throw new Error("FX provider returned an invalid response");
  const db = getDb();
  const rates = Object.entries(payload.rates)
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([currency, value]) => ({ currency, date: payload.date!, rateToGbp: 1 / value }));
  rates.push({ currency: "GBP", date: payload.date, rateToGbp: 1 });
  if (!rates.some((row) => row.currency === "USD") || !rates.some((row) => row.currency === "EUR")) throw new Error("FX provider omitted supported currencies");
  await db.insert(fxRates).values(rates).onConflictDoUpdate({
    target: [fxRates.currency, fxRates.date],
    set: { rateToGbp: sql`excluded.rate_to_gbp` },
  });
  return { date: payload.date, rates: Object.fromEntries(rates.map((row) => [row.currency, row.rateToGbp])) as FxRates };
}

export async function getLatestFxRates(): Promise<{ date: string | null; rates: FxRates }> {
  const db = getDb();
  const rows = await db.selectDistinctOn([fxRates.currency]).from(fxRates).orderBy(fxRates.currency, desc(fxRates.date));
  const rates: FxRates = { GBP: 1 };
  let date: string | null = null;
  for (const row of rows) {
    rates[row.currency] = row.rateToGbp;
    if (!date || row.date < date) date = row.date;
  }
  return { date, rates };
}
