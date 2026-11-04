import { desc, inArray, sql } from "drizzle-orm";
import { fxRates } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import type { FxRates } from "@/lib/format";
import type { DatedRate } from "@/lib/backfill-series";

const FX_CHUNK = 500;

/** Supported quote currencies, upper-cased and de-duplicated, excluding GBP/GBX. */
function foreignCodes(currencies: readonly string[]): string[] {
  return [...new Set(currencies.map((code) => code.toUpperCase()))].filter(
    (code) => code !== "GBP" && code !== "GBX" && /^[A-Z]{3}$/.test(code),
  );
}

/**
 * Import daily FX history so backfilled values are converted at the rate that
 * applied on each date rather than today's rate. Frankfurter returns business
 * days only; the backfill carries the last known rate forward.
 */
export async function importFxHistory(
  fromISO: string,
  toISO: string,
  currencies: readonly string[],
): Promise<number> {
  const codes = foreignCodes(currencies);
  if (!codes.length) return 0;

  const url = `https://api.frankfurter.dev/v1/${fromISO}..${toISO}?base=GBP&symbols=${codes.join(",")}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`FX provider returned ${response.status}`);
  const payload = (await response.json()) as { rates?: Record<string, Record<string, number>> };
  if (!payload.rates) throw new Error("FX provider returned an invalid response");

  const rows: Array<{ currency: string; date: string; rateToGbp: number }> = [];
  for (const [date, rates] of Object.entries(payload.rates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const code of codes) {
      const value = rates[code];
      if (Number.isFinite(value) && value > 0) rows.push({ currency: code, date, rateToGbp: 1 / value });
    }
  }
  if (!rows.length) return 0;

  const db = getDb();
  for (let i = 0; i < rows.length; i += FX_CHUNK) {
    await db
      .insert(fxRates)
      .values(rows.slice(i, i + FX_CHUNK))
      .onConflictDoUpdate({ target: [fxRates.currency, fxRates.date], set: { rateToGbp: sql`excluded.rate_to_gbp` } });
  }
  return rows.length;
}

/** Earliest stored date per currency, so the backfill only imports what it lacks. */
export async function earliestFxDates(currencies: readonly string[]): Promise<Map<string, string>> {
  const codes = foreignCodes(currencies);
  const out = new Map<string, string>();
  if (!codes.length) return out;
  const rows = await getDb()
    .select({ currency: fxRates.currency, date: sql<string | null>`min(${fxRates.date})` })
    .from(fxRates)
    .where(inArray(fxRates.currency, codes))
    .groupBy(fxRates.currency);
  for (const row of rows) if (row.date) out.set(row.currency, row.date);
  return out;
}

/** Ascending daily rates per currency, for as-of-date lookups during backfill. */
export async function getFxRateSeries(currencies: readonly string[]): Promise<Map<string, DatedRate[]>> {
  const codes = foreignCodes(currencies);
  const out = new Map<string, DatedRate[]>();
  if (!codes.length) return out;
  const rows = await getDb()
    .select({ currency: fxRates.currency, date: fxRates.date, rate: fxRates.rateToGbp })
    .from(fxRates)
    .where(inArray(fxRates.currency, codes))
    .orderBy(fxRates.currency, fxRates.date);
  for (const row of rows) {
    const list = out.get(row.currency) ?? [];
    list.push({ date: row.date, rate: row.rate });
    out.set(row.currency, list);
  }
  return out;
}

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
