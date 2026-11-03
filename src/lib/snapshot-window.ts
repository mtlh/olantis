/**
 * Window a time series so long histories stay cheap to ship.
 *
 * Policy:
 *  - Keep every point from the last 92 days.
 *  - Older points are downsampled to one per ISO week (Monday-based), keeping
 *    the last point in that week.
 *  - Ascending date order is preserved.
 *  - The latest point is always retained.
 *
 * The input is never mutated; a fresh array is returned.
 */
export type SeriesPoint = { date: string; value: number };

function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getUTCDay(); // 0..6, Sun=0
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(d.getTime() - mondayOffset * 86400000);
  return monday.toISOString().slice(0, 10);
}

export function windowSeries<T extends { date: string; value: number }>(
  rows: readonly T[],
): T[] {
  if (!rows || rows.length === 0) return [];

  // Work on a sorted copy so the input is untouched.
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  const cutoff = new Date(Date.now() - 92 * 86400000).toISOString().slice(0, 10);

  // Older points grouped by ISO week; keep the last (latest) point per week.
  const olderByWeek = new Map<string, T>();
  const recent: T[] = [];

  for (const row of sorted) {
    if (row.date >= cutoff) {
      recent.push(row);
    } else {
      olderByWeek.set(isoWeekKey(row.date), row);
    }
  }

  // Re-assemble in ascending order: weekly older (already in week order because
  // sorted input and Map preserves insertion order for string keys in V8) then
  // recent. Map insertion order follows first occurrence; rebuild sorted by key.
  const olderWeekly = [...olderByWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row]) => row);

  const result: T[] = [...olderWeekly, ...recent];

  // Guarantee the latest point is present.
  const latest = sorted[sorted.length - 1];
  if (!result.includes(latest)) {
    result.push(latest);
    result.sort((a, b) => a.date.localeCompare(b.date));
  }

  // De-duplicate by date (keep first occurrence).
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const row of result) {
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    deduped.push(row);
  }
  return deduped;
}