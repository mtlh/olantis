# Plan: backfill portfolio history before first sign-up

Status: implemented · Scope: `snapshots` / `portfolio_snapshots` / `holding_snapshots`

## 1. Problem

History starts the day the app first records a snapshot, not the day the user actually
bought the assets.

Today snapshots are only written by:

- the daily cron (`src/app/api/cron/refresh/route.ts:90` `createSnapshots`) — one row per
  user/portfolio/holding for **today** only;
- the client (`src/lib/store.ts:292-314` → `POST /api/snapshots`) — today's value whenever
  the computed total changes;
- the demo seed (`src/app/api/demo/route.ts:186-251`) — 3 years of synthetic weekly points.

So a user who imports a position bought in 2021 sees a chart with a few days of data,
`1M/3M/1Y` movers resolve to `null` or a meaningless baseline, and the "MAX" selector
shows only the app-usage window.

We already hold the two ingredients needed to reconstruct the past:

- `holdings.shares` + `holdings.purchaseDate` (`src/lib/db/schema.ts:76,81`);
- `transactions` — a dated buy/sell ledger (`src/lib/db/schema.ts:111-128`);
- and Yahoo daily history is already reachable (`src/lib/yahoo.ts:189` `fetchHistory`,
  currently only used by the demo seed).

The chart read path already downsamples anything older than 92 days to one point per
week (`src/lib/snapshot-window.ts`), so long histories are cheap to ship once stored.

## 2. What gets generated

For each backfillable holding, reconstruct a daily GBP value series from its earliest
known date to yesterday, then derive the aggregate series:

```
holdingValue(d) = sharesAt(d) × close(symbol, d) × fxToGBP(currency, d)
portfolioValue(d) = Σ holdingValue(d) for holdings in that portfolio
totalValue(d)     = Σ holdingValue(d) for all holdings (including direct, no portfolio)
```

This mirrors exactly how the cron computes today's rows (`createSnapshots`), just run
over a date axis instead of a single day.

## 3. Design decisions

### 3.1 Price source

Extend `src/lib/yahoo.ts` with a history fetch that accepts the exchange (the current
`fetchHistory` drops it, so LSE symbols must already carry `.L`):

```ts
fetchDailyHistory(symbol, exchange, fromISO, toISO): Promise<{ date: string; close: number }[]>
```

- `yf.chart(ys, { period1, period2, interval: "1d", return: "array" })`, routed through
  the existing `cached("chart", …)` funnel so the concurrency cap (4), 120 ms spacing,
  429 backoff and per-day cache key all apply.
- Cap the requested window (recommend **15 years**) and the number of points stored.
- Non-trading days simply have no close; carry the previous close forward when
  aggregating (the `seriesCursor` / `carryForward` helpers in `src/lib/format.ts:97-112`
  already do this).
- Skip CASH symbols and `manual` portfolios (user-entered values, no market history).

### 3.2 FX history

`fx_rates` only ever gets the *latest* date (`src/lib/fx.ts:6`), so a 2021 USD holding
would be converted at today's rate — materially wrong.

- Add `backfillFxRates(fromISO, toISO, currencies)` using frankfurter's time series:
  `https://api.frankfurter.dev/v1/{from}..{to}?base=GBP&symbols=USD,EUR,…`
  → `rateToGbp = 1 / rate`, upserted into `fx_rates` (same shape as `refreshFxRates`).
- Resolve each date with "latest rate at or before `d`", falling back to the newest
  stored rate, then `DEFAULT_FX_RATES`. GBP is always 1; GBX/GBp are handled by
  `toGBP` (divide by 100).
- Only fetch currencies actually present in the user's backfillable holdings.

### 3.3 Shares over time

Use the transaction ledger when it is consistent, otherwise assume the current position
was held constant from `purchaseDate`:

```
ledger   = transactions for the holding (by holdingId, else symbol+portfolioId), ordered by (date, createdAt)
net      = Σ buys.shares − Σ sells.shares
opening  = holding.shares − net

if opening < −ε  → ledger inconsistent; use constant holding.shares from purchaseDate
else             → sharesAt(d) = max(0, opening + Σ signed shares where date ≤ d)
```

Start date = `min(purchaseDate, first ledger date)`; if neither exists, nothing to
backfill. Transactions are matched with the same fallback rule the delete endpoint
already uses (`src/app/api/transactions/route.ts:175-190`).

### 3.4 Storage granularity

Write **daily** points for the last ~100 days (the read path keeps daily inside the
92-day window) and **weekly** (ISO week, last point kept) for everything older. This
matches `windowSeries`, keeps row counts sane (~50k rows for 20 holdings × 15 years),
and means no information the UI can display is lost.

### 3.5 Write policy — never clobber real data

Recorded rows (cron, client POST, demo seed) are ground truth and must win.

Add an `origin` column to all three snapshot tables:

| table | new column |
| --- | --- |
| `snapshots` | `origin text not null default 'recorded'` |
| `portfolio_snapshots` | `origin text not null default 'recorded'` |
| `holding_snapshots` | `origin text not null default 'recorded'` |

- Backfill deletes only `origin = 'backfilled'` rows for the affected holding / portfolio
  / user, then inserts with `ON CONFLICT DO NOTHING`.
- Backfill never writes **today** — leave it to the cron/client so the live price wins.
- Existing upserts (`createSnapshots`, `POST /api/snapshots`, demo seed) must also set
  `origin = 'recorded'` in their `DO UPDATE` clause, otherwise a row first written by a
  backfill stays marked wrongly after the cron corrects it.
- Add `holdings.history_backfilled_at integer` (unix seconds). `NULL` = pending;
  re-run detection is then just that column.

### 3.6 Invalidation

Historical values change when a holding's `shares`, `purchaseDate`, `symbol`, `currency`
or `exchange` changes, when a transaction is added/deleted, or when a holding moves
portfolio.

- `POST /api/holdings` (create + update) and `POST`/`DELETE /api/transactions` set
  `history_backfilled_at = NULL` on the affected holding.
- Next backfill run deletes that holding's `backfilled` rows and rebuilds them, then
  rebuilds the affected portfolio and total series (same delete-and-recompute pass).
- Aggregates are rebuilt from all holdings' series with carry-forward, so one holding
  changing cannot silently corrupt the portfolio line.

### 3.7 Trigger and scheduling

Vercel's cron function has no `maxDuration` override in `vercel.json`, so a many-user
backfill cannot be done in one tick. Use both paths:

1. **On demand (primary, immediate):** `POST /api/snapshots/backfill`
   - authenticated (`getUserId`, only the caller's holdings);
   - processes a bounded batch (recommend ≤ 12 holdings per call);
   - returns `{ done, holdingsBackfilled, pending }`.
   - Client: in `useSnapshots`, after bootstrap, if the total series is empty or starts
     after `min(purchaseDate)`, call it once (guard with `sessionStorage` to avoid
     repeat calls), then `refresh()`. Result: the chart fills in seconds after import.
2. **Daily sweep (backstop):** after `createSnapshots` in
   `src/app/api/cron/refresh/route.ts`, call `backfillPending({ limit: 5 })` — picks the
   oldest `history_backfilled_at IS NULL` holdings across all users, so failed or
   interrupted on-demand runs complete within a day.

Demo tenants (`demo:%`) and `manual` portfolios are excluded, consistent with the
existing refresh filter (`src/app/api/cron/refresh/route.ts:34-43`).

## 4. New module

`src/lib/backfill.ts` — pure logic split out so it is unit-testable without network:

```ts
buildSharesTimeline(holding, transactions): Array<{ date: string; shares: number }>
buildHoldingValueSeries(holding, sharesTimeline, prices, fxAsOf): DatedValue[]
aggregateSeries(series: DatedValue[][]): DatedValue[]        // union of dates + carry forward
downsampleForStorage(series): DatedValue[]                   // daily ≤100d, weekly older
asOfRate(rates: Array<{date,rateToGbp}>, date): number
backfillHolding(userId, holding): Promise<BackfillResult>    // Yahoo + FX + deletes/inserts
backfillUserHistory(userId, opts?): Promise<BackfillSummary>
backfillPending(opts): Promise<BackfillSummary>
```

Data access stays `db.batch`-friendly; inserts are chunked (≈400 rows per statement).

## 5. Migration

`drizzle/0003_history_backfill.sql` (plus regenerated `drizzle/meta`):

```sql
ALTER TABLE "snapshots"           ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'recorded';
ALTER TABLE "portfolio_snapshots" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'recorded';
ALTER TABLE "holding_snapshots"   ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'recorded';
ALTER TABLE "holdings"            ADD COLUMN IF NOT EXISTS "history_backfilled_at" integer;
ALTER TABLE "holdings"            ADD COLUMN IF NOT EXISTS "history_backfill_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "holdings"            ADD COLUMN IF NOT EXISTS "history_backfill_error" text;
```

`history_backfill_attempts` + `history_backfill_error` stop us retrying an invalid or
delisted symbol on every cron forever (give up after 3 attempts, surface a warning in
Settings later).

## 6. Edge cases

| Case | Behaviour |
| --- | --- |
| No `purchaseDate`, no transactions | Skip (nothing to place in time); mark attempted. |
| Yahoo returns nothing (delisted/invalid) | Skip, increment attempts, keep existing history. |
| Ledger inconsistent (net > current shares) | Fall back to constant current shares from `purchaseDate`. |
| Sold-out holding (`shares = 0`) | Included if it has a ledger, so the pre-sale value is correct; value clamps at 0 after the last sale. |
| Holding moved between portfolios | Whole history attributed to its current portfolio (documented limitation). |
| Deleted holding | Not reconstructed — its `holdingSnapshots` were cascaded away. Out of scope (see §9). |
| Manual portfolio / CASH | Value held constant from `purchaseDate` (no market series) — cheap and avoids a fake line. |
| Weekend/holiday | No row; carry forward on aggregates. |
| Timezone | All dates are UTC ISO days, matching `todayISODate()`. |
| Yahoo quota | Serialised through `cached`/`withRetry`; bounded batch per request; cron backstop is small. |

## 7. User-visible effect

- `MAX` now means "since first purchase", not "since first login".
- `valueChangeOverRange` (`src/lib/format.ts:70`) gets a real baseline, so movers' 1M/3M/1Y
  figures become meaningful instead of `null`.
- Buy/sell days show value jumps; that is expected for a raw value chart (no
  contribution-adjusted series exists today).
- No API shape change: `GET /api/snapshots` and `/api/snapshots?holdingId=` already read
  whatever rows exist; `windowSeries` keeps the payload flat.

## 8. Testing

New `tests/backfill.test.mts` (wired into the `test` script), covering pure logic:

- opening-balance reconciliation from a buy/sell ledger (incl. inconsistent ledger);
- shares timeline with multiple buys/sells and `date`/`createdAt` ties;
- constant-shares fallback when no transactions exist;
- aggregate union + carry-forward across staggered series;
- downsample boundary (daily ≤ 100 days, weekly older, latest point kept);
- FX as-of lookup with gaps, and GBP/GBX handling;
- idempotency: re-running produces the same rows; recorded rows are never deleted.

Manual checks on a dev database: import a holding dated 2 years back, confirm the chart
spans it, `1Y` mover is non-null, and a second page load does not call Yahoo again.

## 9. Implementation phases

1. **Schema + migration** — `origin` on the three tables; backfill bookkeeping columns on
   `holdings`; update the three existing upserts to write `origin = 'recorded'`.
2. **Pure logic + tests** — `buildSharesTimeline`, `aggregateSeries`,
   `downsampleForStorage`, `asOfRate` in `src/lib/backfill.ts`; test file; no network.
3. **Market/FX fetching** — `fetchDailyHistory` (with exchange) in `yahoo.ts`;
   `backfillFxRates` + `asOfRate` support in `fx.ts`.
4. **Engine + route** — `backfillHolding` / `backfillUserHistory`; `POST
   /api/snapshots/backfill` with auth and a per-call batch cap.
5. **Client trigger** — one-shot call from `useSnapshots` when history is missing, then
   `refresh()`; set `history_backfilled_at = NULL` from holdings/transactions mutations.
6. **Cron backstop** — `backfillPending({ limit: 5 })` after `createSnapshots`.
7. **Verify** — `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`,
   then a dev-database walk-through.

## 10. Decisions taken (formerly open questions)

1. **Depth cap** — 15 years (`BACKFILL_MAX_YEARS`), bounded further by Yahoo
   availability and the holding's own purchase date.
2. **Deleted positions** — reconstructing a position whose `holdings` row no longer
   exists remains a follow-up: `transactions` has no currency/exchange and
   `holding_snapshots.holding_id` is a foreign key, so it needs a ledger-only series
   shape. Fully sold positions that *still* have a row (`shares = 0`) are backfilled
   from their ledger today.
3. **Manual portfolios** — value held constant from `purchaseDate` (same for CASH and
   non-listed symbols), so the chart does not start mid-life for pensions/property.
4. **On-add latency** — immediate: the dashboard calls `POST /api/snapshots/backfill`
   once when the saved series starts after the earliest purchase, with the daily cron
   as backstop.
5. **Contribution-adjusted series** — out of scope, as before.

## 11. Implementation map

| Area | File |
| --- | --- |
| Schema + migration | `src/lib/db/schema.ts`, `drizzle/0003_history_backfill.sql` |
| Pure series maths + tests | `src/lib/backfill-series.ts`, `tests/backfill.test.mts` |
| Engine + cron sweep | `src/lib/backfill.ts` |
| On-demand endpoint | `src/app/api/snapshots/backfill/route.ts` |
| Client trigger | `src/lib/store.ts` (`useSnapshots`) |
| Cron hook | `src/app/api/cron/refresh/route.ts` |
| Invalidation on write | `src/app/api/holdings/route.ts`, `src/app/api/transactions/route.ts` |
| Recorded-origin upserts | `src/app/api/snapshots/route.ts`, `src/app/api/cron/refresh/route.ts` |

## 12. Out of scope

- Rebuilding history for deleted holdings or symbols no longer held.
- Dividends, splits, or total-return (vs. price-return) series.
- Any change to the chart UI or range selector.
