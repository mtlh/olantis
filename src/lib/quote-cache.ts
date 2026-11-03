import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export interface QuoteDaily {
  price: number;
  currency: string;
}

const FIFTEEN_MIN = 15 * 60_000;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read a fresh row from the durable quote_daily table. Returns null when the
 * table is missing or the row is stale/absent. Never throws.
 */
export async function readQuoteDaily(symbol: string): Promise<QuoteDaily | null> {
  try {
    const db = getDb();
    const cutoff = Date.now() - FIFTEEN_MIN;
    const rows = (await db.execute(
      sql`SELECT price, currency, updated_at FROM quote_daily WHERE symbol = ${symbol.toUpperCase()} AND date = ${today()} AND updated_at >= ${cutoff} LIMIT 1`
    )) as unknown as { rows?: Array<{ price: number | string; currency: string | null; updated_at: number | string }> };
    const r = rows?.rows?.[0];
    if (!r) return null;
    const price = typeof r.price === "string" ? Number(r.price) : r.price;
    if (!Number.isFinite(price)) return null;
    return { price, currency: r.currency || "USD" };
  } catch {
    return null;
  }
}

/**
 * Upsert a quote into quote_daily. Never throws.
 */
export async function writeQuoteDaily(symbol: string, price: number, currency: string): Promise<void> {
  await writeQuoteDailyBatch([{ symbol, price, currency }]);
}

export async function readQuoteDailyBatch(symbols: string[]): Promise<Map<string, QuoteDaily>> {
  const out = new Map<string, QuoteDaily>();
  try {
    if (!symbols.length) return out;
    const db = getDb();
    const cutoff = Date.now() - FIFTEEN_MIN;
    const syms = symbols.map((s) => s.toUpperCase());
    const rows = (await db.execute(
      sql`SELECT symbol, price, currency, updated_at FROM quote_daily WHERE symbol = ANY(${syms}) AND date = ${today()} AND updated_at >= ${cutoff}`
    )) as unknown as { rows?: Array<{ symbol: string; price: number | string; currency: string | null }> };
    for (const r of rows?.rows ?? []) {
      const price = typeof r.price === "string" ? Number(r.price) : r.price;
      if (!Number.isFinite(price)) continue;
      out.set(String(r.symbol).toUpperCase(), { price, currency: r.currency || "USD" });
    }
  } catch {
    /* table may not exist yet; fall back silently */
  }
  return out;
}

export async function writeQuoteDailyBatch(entries: Array<{ symbol: string; price: number; currency: string }>): Promise<void> {
  try {
    if (!entries.length) return;
    const db = getDb();
    const now = Date.now();
    const d = today();
    const values = entries.map((e) => sql`(${e.symbol.toUpperCase()}, ${d}, ${e.price}, ${e.currency}, ${now})`);
    await db.execute(
      sql`INSERT INTO quote_daily (symbol, date, price, currency, updated_at)
          VALUES ${sql.join(values, sql`, `)}
          ON CONFLICT (symbol, date) DO UPDATE SET
            price = excluded.price,
            currency = excluded.currency,
            updated_at = excluded.updated_at`
    );
  } catch {
    /* table may not exist yet; fall back silently to in-memory cache */
  }
}