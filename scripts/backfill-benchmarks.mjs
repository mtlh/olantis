import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import YahooFinance from "yahoo-finance2";
import { neon } from "@neondatabase/serverless";

/**
 * Rebuild the benchmark_daily table from scratch.
 *
 * The performance chart compares portfolios against a market benchmark. Yahoo's
 * MAX range returns month-end points, which anchors the comparison up to a
 * month before the first portfolio snapshot and inflates the benchmark return.
 * This script stores an accurate daily close series instead, starting from the
 * earliest date any user has portfolio history.
 *
 * Usage: node scripts/backfill-benchmarks.mjs [--from=YYYY-MM-DD]
 */

const BENCHMARKS = {
  "VWRL.L": { currency: "GBP", label: "VWRL" },
  "^FTSE": { currency: "GBP", label: "FTSE 100" },
  "^GSPC": { currency: "USD", label: "S&P 500" },
  MSFT: { currency: "USD", label: "Microsoft" },
};

const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

async function earliestPortfolioDate() {
  const rows = await sql`
    SELECT MIN(d) AS date FROM (
      SELECT MIN(date) AS d FROM snapshots
      UNION ALL
      SELECT to_timestamp(MIN(created_at))::date::text AS d FROM portfolios
    ) AS starts
  `;
  const value = rows?.[0]?.date;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "2020-01-01";
}

async function fetchDaily(symbol, from, to) {
  const result = await yf.chart(symbol, {
    period1: addDays(from, -7),
    period2: addDays(to, 1),
    interval: "1d",
    return: "array",
  });
  const points = [];
  for (const quote of result.quotes ?? []) {
    if (quote?.close == null || quote?.date == null) continue;
    const close = Number(quote.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    points.push({ date: isoDay(new Date(quote.date)), price: close });
  }
  return points;
}

async function replaceSeries(symbol, points) {
  const currency = BENCHMARKS[symbol].currency;
  const updatedAt = Math.floor(Date.now() / 1000);
  await sql`DELETE FROM benchmark_daily WHERE symbol = ${symbol}`;
  const CHUNK = 400;
  for (let offset = 0; offset < points.length; offset += CHUNK) {
    const chunk = points.slice(offset, offset + CHUNK);
    const placeholders = chunk
      .map((_, index) => {
        const base = index * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(", ");
    const params = chunk.flatMap((point) => [symbol, point.date, point.price, currency, updatedAt]);
    await sql.query(
      `INSERT INTO benchmark_daily (symbol, date, price, currency, updated_at)
       VALUES ${placeholders}
       ON CONFLICT (symbol, date) DO UPDATE SET
         price = excluded.price,
         currency = excluded.currency,
         updated_at = excluded.updated_at`,
      params,
    );
  }
}

await sql`
  CREATE TABLE IF NOT EXISTS "benchmark_daily" (
    "symbol" text NOT NULL,
    "date" text NOT NULL,
    "price" numeric NOT NULL,
    "currency" text,
    "updated_at" integer NOT NULL,
    CONSTRAINT "benchmark_daily_symbol_date_pk" PRIMARY KEY("symbol","date")
  )
`;

const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
const from = fromArg ? fromArg.slice("--from=".length) : await earliestPortfolioDate();
const to = isoDay(new Date());
console.log(`Backfilling benchmark_daily from ${from} to ${to}`);

for (const symbol of Object.keys(BENCHMARKS)) {
  const points = await fetchDaily(symbol, from, to);
  if (!points.length) {
    console.warn(`  ${symbol}: no data returned — leaving existing rows untouched`);
    continue;
  }
  await replaceSeries(symbol, points);
  console.log(`  ${BENCHMARKS[symbol].label.padEnd(10)} ${String(points.length).padStart(5)} daily closes  (${points[0].date} → ${points.at(-1).date})`);
}

const counts = await sql`SELECT symbol, COUNT(*)::int AS n, MIN(date) AS first, MAX(date) AS last FROM benchmark_daily GROUP BY symbol ORDER BY symbol`;
console.log("\nStored series:");
for (const row of counts) console.log(`  ${row.symbol.padEnd(8)} ${String(row.n).padStart(5)} rows  ${row.first} → ${row.last}`);

const sample = await sql`
  SELECT date, price FROM benchmark_daily
  WHERE symbol = 'VWRL.L' AND date IN ('2023-11-17', '2023-11-20', '2023-12-11')
  ORDER BY date
`;
if (sample.length) {
  console.log("\nVWRL accuracy check:");
  for (const row of sample) console.log(`  ${row.date}  ${Number(row.price).toFixed(2)}`);
  const start = sample.find((row) => row.date === "2023-11-20");
  const end = sample.find((row) => row.date === "2023-12-11");
  if (start && end) console.log(`  2023-11-20 → 2023-12-11: ${(((Number(end.price) / Number(start.price)) - 1) * 100).toFixed(2)}%`);
}
