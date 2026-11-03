"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartZoom, ZoomResetButton, ZoomSelectionArea } from "@/components/ChartZoom";
import { chartDateLabel, rangeCutoff, paddedDomain, fmtPct } from "@/lib/format";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import type { Snapshot } from "@/lib/store";

export type PerformanceChartRow = {
  date: string;
  dateISO: string;
  [key: string]: string | number | null;
};

export type PerformanceSeries = { key: string; name: string; color: string };

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";

// Module-level cache of benchmark series, keyed by symbol, so remounts/route
// changes do not refetch the benchmark MAX chart.
const benchmarkCache = new Map<string, Array<{ date: string; price: number }>>();
const SUB = "mt-2 text-[11px] text-zinc-600";

function tone(value: number | null | undefined) {
  if (value == null) return "text-zinc-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-zinc-300";
}

function drawdownLabel(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

export function PerformanceChart({
  snapshots,
  byPortfolio,
  series,
  range,
  onRangeChange,
  benchmark,
  onBenchmarkChange,
}: {
  snapshots: Snapshot[];
  byPortfolio: Record<string, { name: string; data: Snapshot[] }>;
  series: PerformanceSeries[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  benchmark: string;
  onBenchmarkChange: (benchmark: string) => void;
}) {
  const [benchmarkPrices, setBenchmarkPrices] = useState<{ key: string; rows: Array<{ date: string; price: number }> } | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (benchmark === "__none__") return;
    const cacheKey = `${benchmark}:MAX`;
    const cachedRows = benchmarkCache.get(cacheKey);
    if (cachedRows) {
      const rows = cachedRows;
      setTimeout(() => setBenchmarkPrices({ key: cacheKey, rows }), 0);
      return;
    }
    let cancelled = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(benchmark)}&range=MAX`)
      .then(async (response) => response.ok ? (await response.json()).chart as Array<{ date: string; price: number }> : [])
      .then((rows) => {
        benchmarkCache.set(cacheKey, rows);
        if (!cancelled) setBenchmarkPrices({ key: cacheKey, rows });
      })
      .catch(() => {
        benchmarkCache.set(cacheKey, []);
        if (!cancelled) setBenchmarkPrices({ key: cacheKey, rows: [] });
      });
    return () => { cancelled = true; };
  }, [benchmark]);

  const data = useMemo<PerformanceChartRow[]>(() => {
    const totalHistory = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const portfolioHistories = Object.entries(byPortfolio).map(([id, info]) => ({
      id,
      history: [...info.data].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    const dates = new Set<string>(totalHistory.map((snapshot) => snapshot.date));
    for (const { history } of portfolioHistories) for (const snapshot of history) dates.add(snapshot.date);
    const orderedDates = [...dates].sort((a, b) => a.localeCompare(b));
    if (!orderedDates.length) return [];

    const percentAt = (history: Snapshot[], date: string): number | null => {
      const first = history[0];
      if (!first || first.value <= 0 || date < first.date) return null;
      let latest: Snapshot | undefined;
      for (const snapshot of history) {
        if (snapshot.date > date) break;
        latest = snapshot;
      }
      return latest ? ((latest.value / first.value) - 1) * 100 : null;
    };

    const benchmarkHistory = benchmarkPrices?.key === `${benchmark}:MAX`
      ? [...benchmarkPrices.rows].filter((point) => Number.isFinite(point.price) && point.price > 0).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const userDataStart = orderedDates[0];
    const benchmarkBase = [...benchmarkHistory].reverse().find((point) => point.date <= userDataStart)
      ?? benchmarkHistory.find((point) => point.date >= userDataStart);

    return orderedDates.map((date) => {
      const row: PerformanceChartRow = { date: chartDateLabel(date), dateISO: date };
      const totalPct = percentAt(totalHistory, date);
      if (totalPct != null) row.total = totalPct;
      for (const { id, history } of portfolioHistories) {
        const value = percentAt(history, date);
        if (value != null) row[id] = value;
      }
      if (benchmarkBase && date >= userDataStart && date >= benchmarkBase.date) {
        let latestPrice: number | undefined;
        for (const point of benchmarkHistory) {
          if (point.date > date) break;
          latestPrice = point.price;
        }
        if (latestPrice != null) row.benchmark = ((latestPrice / benchmarkBase.price) - 1) * 100;
      }
      return row;
    });
  }, [snapshots, byPortfolio, benchmarkPrices, benchmark]);
  // Rows carry a formatted `date` label for the axis, so the range cut has to
  // compare against `dateISO` — comparing labels against an ISO cutoff never matches.
  const rangedData = useMemo(() => {
    const cutoff = rangeCutoff(range);
    if (cutoff == null) return data;
    return data.filter((row) => row.dateISO >= cutoff);
  }, [data, range]);
  const chartZoom = useChartZoom(rangedData);
  const benchmarkName = useMemo(() => {
    if (benchmark === "__none__") return null;
    if (benchmark === "VWRL.L") return "VWRL";
    if (benchmark === "^FTSE") return "FTSE 100";
    if (benchmark === "^GSPC") return "S&P 500";
    return benchmark;
  }, [benchmark]);
  const visibleKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!hiddenSeries.has("total")) keys.add("total");
    for (const item of series) if (!hiddenSeries.has(item.key)) keys.add(item.key);
    if (benchmark !== "__none__" && !hiddenSeries.has("benchmark")) keys.add("benchmark");
    return keys;
  }, [series, hiddenSeries, benchmark]);
  const periodSummary = useMemo(() => {
    const candidates = [
      { key: "total", name: "Total portfolio" },
      ...series.map(({ key, name }) => ({ key, name })),
      ...(benchmarkName ? [{ key: "benchmark", name: benchmarkName }] : []),
    ];
    return candidates.map(({ key, name }) => {
      const points = rangedData.flatMap((row) => typeof row[key] === "number" && Number.isFinite(row[key]) ? [{ value: row[key] as number }] : []);
      if (points.length < 2) return { key, name, periodChange: null as number | null, maxDrawdown: null as number | null };
      const baseline = 100 + points[0].value;
      const periodChange = baseline > 0 ? ((100 + points.at(-1)!.value) / baseline - 1) * 100 : null;
      let peak = baseline;
      let maxDrawdown = 0;
      for (const point of points) {
        const indexedValue = 100 + point.value;
        peak = Math.max(peak, indexedValue);
        if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (indexedValue / peak - 1) * 100);
      }
      return { key, name, periodChange, maxDrawdown };
    });
  }, [benchmarkName, rangedData, series]);
  const totalSummary = periodSummary.find((item) => item.key === "total");
  const benchmarkSummary = periodSummary.find((item) => item.key === "benchmark");
  const seriesRows = periodSummary.filter((item) => item.key !== "total");
  const leadingPortfolio = useMemo(() => {
    const rows = periodSummary.filter((item) => item.key !== "total" && item.key !== "benchmark" && item.periodChange != null);
    return rows.reduce<(typeof rows)[number] | null>(
      (best, item) => (best == null || (item.periodChange as number) > (best.periodChange as number) ? item : best),
      null,
    );
  }, [periodSummary]);
  const axisValues = useMemo(() => {
    const values: number[] = [0];
    for (const row of chartZoom.visible) {
      for (const key of visibleKeys) {
        const value = row[key];
        if (typeof value === "number" && Number.isFinite(value)) values.push(value);
      }
    }
    return values;
  }, [chartZoom.visible, visibleKeys]);
  const yDomain = useMemo(() => paddedDomain(axisValues), [axisValues]);
  const toggleSeries = (key: string) => {
    setHiddenSeries((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const colorFor = (key: string) =>
    key === "total" ? "#ffffff" : key === "benchmark" ? "#fbbf24" : (series.find((item) => item.key === key)?.color ?? "#71717a");
  const hasData = rangedData.length > 0;

  return (
    <section aria-label="Portfolio performance" className="flex min-h-[calc(100vh-7rem)] flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">Performance</h1>
        <p className="mt-2 text-xs text-zinc-500">Indexed value movement — not adjusted for contributions, withdrawals or trading.</p>
      </header>

      {hasData && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-white/[0.06] py-6 sm:grid-cols-3 sm:gap-x-10 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:gap-0 lg:py-7">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 lg:pr-8">
            <p className={LABEL}>Total portfolio · {range}</p>
            <p className={`mt-2 text-[34px] font-semibold leading-none tracking-tight tabular-nums sm:text-[38px] ${tone(totalSummary?.periodChange)}`}>
              {totalSummary?.periodChange == null ? "—" : fmtPct(totalSummary.periodChange)}
            </p>
            <p className={SUB}>Since {chartDateLabel(rangedData[0].dateISO)}</p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Largest pullback</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${totalSummary?.maxDrawdown != null && totalSummary.maxDrawdown < 0 ? "text-red-400" : "text-zinc-300"}`}>
              {drawdownLabel(totalSummary?.maxDrawdown)}
            </p>
            <p className={SUB}>Peak to trough</p>
          </div>

          <div className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <p className={LABEL}>Leading portfolio</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone(leadingPortfolio?.periodChange)}`}>
              {leadingPortfolio?.periodChange == null ? "—" : fmtPct(leadingPortfolio.periodChange)}
            </p>
            <p className={`${SUB} truncate`} title={leadingPortfolio?.name}>{leadingPortfolio?.name ?? "No portfolio history"}</p>
          </div>

          <div className="col-span-2 sm:col-span-1 lg:col-span-1 lg:border-l lg:border-white/[0.06] lg:pl-8">
            <p className={LABEL}>{benchmarkName ?? "Benchmark"}</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone(benchmarkSummary?.periodChange)}`}>
              {benchmarkSummary?.periodChange == null ? "—" : fmtPct(benchmarkSummary.periodChange)}
            </p>
            <p className={SUB}>{benchmarkName ? "Price only, no dividends" : "Not selected"}</p>
          </div>
        </div>
      )}

      <Card className="panel flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-white">Change over time</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Select value={benchmark} onValueChange={(value) => onBenchmarkChange(value ?? "__none__")}>
              <SelectTrigger className="h-8 w-28 border-white/[0.08] bg-transparent text-[11px] text-zinc-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Benchmark</SelectItem>
                <SelectItem value="VWRL.L">VWRL</SelectItem>
                <SelectItem value="^FTSE">FTSE 100</SelectItem>
                <SelectItem value="^GSPC">S&amp;P 500</SelectItem>
                <SelectItem value="MSFT">Microsoft</SelectItem>
              </SelectContent>
            </Select>
            <ChartRangeSelector range={range} onRangeChange={onRangeChange} segmented />
            {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {!hasData ? (
            <div className="grid flex-1 place-items-center py-16 text-center">
              <div>
                <p className="text-sm text-zinc-400">{data.length === 0 ? "No snapshots yet" : `No snapshots in the last ${range === "MAX" ? "period" : range}`}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {data.length === 0
                    ? "Performance will appear here after your first portfolio snapshot."
                    : "Choose a wider range to see earlier performance."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-[340px] w-full shrink-0 select-none sm:h-[420px] lg:h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis domain={yDomain ?? ["auto", "auto"]} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                      formatter={(value) => fmtPct(Number(value))}
                      labelStyle={{ color: "#a1a1aa" }}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.24)" strokeDasharray="4 4" />
                    {!hiddenSeries.has("total") && <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" fill="#ffffff" fillOpacity={0.08} strokeWidth={2.5} dot={false} connectNulls />}
                    {benchmarkName && !hiddenSeries.has("benchmark") && <Area type="monotone" dataKey="benchmark" name={benchmarkName} stroke="#fbbf24" fill="transparent" strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls />}
                    {series.filter((item) => !hiddenSeries.has(item.key)).map((item) => (
                      <Area key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[11px]">
                {[{ key: "total", name: "Total", color: "#ffffff" }, ...series, ...(benchmarkName ? [{ key: "benchmark", name: benchmarkName, color: "#fbbf24" }] : [])].map((item) => {
                  const hidden = hiddenSeries.has(item.key);
                  return (
                    <button key={item.key} type="button" onClick={() => toggleSeries(item.key)} title={`${hidden ? "Show" : "Hide"} ${item.name}`} className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors ${hidden ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-300 hover:text-white"}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color, opacity: hidden ? 0.3 : 1 }} /> {item.name}
                    </button>
                  );
                })}
                {hiddenSeries.size > 0 && <button type="button" onClick={() => setHiddenSeries(new Set())} className="px-2 py-1 text-zinc-500 underline underline-offset-2 transition-colors hover:text-white">Show all</button>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {hasData && seriesRows.length > 0 && (
        <section aria-labelledby="performance-series-heading">
          <div className="flex items-baseline justify-between gap-3 pb-2">
            <h2 id="performance-series-heading" className="text-sm font-medium text-white">By series</h2>
            <span className="text-[11px] text-zinc-600">Indexed · {range}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
            <span>Series</span>
            <span className="text-right">Change</span>
            <span className="text-right">Pullback</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {seriesRows.map((item) => (
              <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
                <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorFor(item.key) }} />
                  <span className="truncate" title={item.name}>{item.name}</span>
                </span>
                <span className={`text-right text-sm tabular-nums ${tone(item.periodChange)}`}>{item.periodChange == null ? "—" : fmtPct(item.periodChange)}</span>
                <span className="text-right text-sm tabular-nums text-zinc-400">{drawdownLabel(item.maxDrawdown)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-zinc-600">Figures show value movement, not a flow-adjusted investment return. “Largest pullback” is based on saved observations; benchmarks use price data and may exclude dividends.</p>
    </section>
  );
}
