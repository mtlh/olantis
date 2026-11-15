"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartZoom, ZoomResetButton, ZoomSelectionArea } from "@/components/ChartZoom";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { chartDateLabel, carryForward, evenAxisTicks, rangeCutoff, paddedDomain, fmtPct, seriesCursor, type SeriesCursor } from "@/lib/format";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { Metric, MetricStrip } from "@/components/shared/MetricStrip";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { signedTone } from "@/components/shared/SignedValue";
import type { Snapshot } from "@/lib/store";

export type PerformanceChartRow = {
  date: string;
  dateISO: string;
  [key: string]: string | number | null;
};

export type PerformanceSeries = { key: string; name: string; color: string };

// Module-level cache of benchmark series, keyed by symbol, so remounts/route
// changes do not refetch the benchmark MAX chart.
const benchmarkCache = new Map<string, Array<{ date: string; price: number }>>();

// Base UI renders the raw selected value unless `items` is passed to the
// select, so every option needs a human label here.
const BENCHMARK_OPTIONS = [
  { value: "__none__", label: "None" },
  { value: "VWRL.L", label: "VWRL" },
  { value: "^FTSE", label: "FTSE 100" },
  { value: "^GSPC", label: "S&P 500" },
  { value: "MSFT", label: "Microsoft" },
];

function drawdownLabel(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

export const PerformanceChart = memo(function PerformanceChart({
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

  // The benchmark is anchored to the first day any series has data, so the
  // comparison starts from the same point as the portfolio.
  const dataStart = useMemo(() => {
    let earliest: string | null = null;
    for (const snapshot of snapshots) if (!earliest || snapshot.date < earliest) earliest = snapshot.date;
    for (const info of Object.values(byPortfolio)) {
      for (const snapshot of info.data) if (!earliest || snapshot.date < earliest) earliest = snapshot.date;
    }
    return earliest;
  }, [snapshots, byPortfolio]);

  useEffect(() => {
    if (benchmark === "__none__" || !dataStart) return;
    const cacheKey = `${benchmark}:${dataStart}`;
    const cachedRows = benchmarkCache.get(cacheKey);
    if (cachedRows) {
      const rows = cachedRows;
      setTimeout(() => setBenchmarkPrices({ key: cacheKey, rows }), 0);
      return;
    }
    let cancelled = false;
    fetch(`/api/benchmark?symbol=${encodeURIComponent(benchmark)}&from=${encodeURIComponent(dataStart)}`)
      .then(async (response) => response.ok ? (await response.json()).prices as Array<{ date: string; price: number }> : [])
      .then((rows) => {
        if (rows.length) benchmarkCache.set(cacheKey, rows);
        if (!cancelled) setBenchmarkPrices({ key: cacheKey, rows });
      })
      .catch(() => {
        if (!cancelled) setBenchmarkPrices({ key: cacheKey, rows: [] });
      });
    return () => { cancelled = true; };
  }, [benchmark, dataStart]);

  const data = useMemo<PerformanceChartRow[]>(() => {
    const totalHistory = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const portfolioHistories = Object.entries(byPortfolio).map(([id, info]) => ({
      id,
      history: [...info.data].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    const dates = new Set<string>(totalHistory.map((snapshot) => snapshot.date));
    for (const { history } of portfolioHistories) for (const snapshot of history) dates.add(snapshot.date);
    const cutoff = rangeCutoff(range);
    const orderedDates = [...dates].filter((date) => cutoff == null || date >= cutoff).sort((a, b) => a.localeCompare(b));
    if (!orderedDates.length) return [];

    // One forward cursor per series: each history is walked once across the
    // merged date axis instead of rescanned for every date. Every series is
    // indexed to its own first observation *inside the selected range*, so each
    // line starts at 0% for the same window the metrics above describe —
    // otherwise the chart sat at 1M/3M/1Y with the benchmark still near its
    // three-year level and read as if the benchmark were wrong.
    type PercentCurve = { cursor: SeriesCursor; base: number | null };
    const curveFor = (history: Snapshot[]): PercentCurve => ({ cursor: seriesCursor(history), base: null });
    const percentAt = (curve: PercentCurve, date: string): number | null => {
      const value = carryForward(curve.cursor, date);
      if (value == null || !(value > 0)) return null;
      curve.base ??= value;
      return ((value / curve.base) - 1) * 100;
    };

    const totalCurve = curveFor(totalHistory);
    const portfolioCurves = portfolioHistories.map(({ id, history }) => ({ id, curve: curveFor(history) }));
    const benchmarkHistory = benchmarkPrices?.key === `${benchmark}:${dataStart}`
      ? [...benchmarkPrices.rows]
        .filter((point) => Number.isFinite(point.price) && point.price > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((point) => ({ date: point.date, value: point.price }))
      : [];
    const benchmarkCurve = curveFor(benchmarkHistory);

    return orderedDates.map((date) => {
      const row: PerformanceChartRow = { date: chartDateLabel(date), dateISO: date };
      const totalPct = percentAt(totalCurve, date);
      if (totalPct != null) row.total = totalPct;
      for (const { id, curve } of portfolioCurves) {
        const value = percentAt(curve, date);
        if (value != null) row[id] = value;
      }
      const benchmarkPct = percentAt(benchmarkCurve, date);
      if (benchmarkPct != null) row.benchmark = benchmarkPct;
      return row;
    });
  }, [snapshots, byPortfolio, benchmarkPrices, benchmark, dataStart, range]);
  const hasHistory = snapshots.length > 0 || Object.values(byPortfolio).some((info) => info.data.length > 0);
  const chartZoom = useChartZoom(data);
  const animateSeries = useChartAnimation(chartZoom.visible.length);
  const benchmarkName = useMemo(() => {
    if (benchmark === "__none__") return null;
    return BENCHMARK_OPTIONS.find((option) => option.value === benchmark)?.label ?? benchmark;
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
      const points = data.flatMap((row) => typeof row[key] === "number" && Number.isFinite(row[key]) ? [{ value: row[key] }] : []);
      if (points.length < 2) return { key, name, periodChange: null as number | null, maxDrawdown: null as number | null };
      const baseline = 100 + points[0].value;
      const periodChange = baseline > 0 ? ((100 + points[points.length - 1].value) / baseline - 1) * 100 : null;
      let peak = baseline;
      let maxDrawdown = 0;
      for (const point of points) {
        const indexedValue = 100 + point.value;
        peak = Math.max(peak, indexedValue);
        if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (indexedValue / peak - 1) * 100);
      }
      return { key, name, periodChange, maxDrawdown };
    });
  }, [benchmarkName, data, series]);
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
  // Evenly spaced ticks with round labels. Recharts' own ticks against a padded
  // domain gave one short band at the top whose label was the raw padded
  // maximum (`+1 / +26 / +51 / +65`), so every value read off the grid — the
  // benchmark's included — was off by up to half a step.
  const axis = useMemo(() => evenAxisTicks(axisValues), [axisValues]);
  const yDomain = axis?.domain ?? paddedDomain(axisValues);
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
  const hasData = data.length > 0;

  return (
    <section aria-label="Portfolio performance" className="flex min-h-[calc(100vh-7rem)] flex-col gap-6">
      <PageHeader
        title="Performance"
        description="Indexed value movement — not adjusted for contributions, withdrawals or trading."
      />

      {hasData && (
        <MetricStrip variant="performance">
          <Metric
            wide
            size="hero"
            position="first"
            className="sm:col-span-3"
            label={`Total portfolio · ${range}`}
            tone={signedTone(totalSummary?.periodChange)}
            valueClassName="text-[34px] sm:text-[38px]"
            value={totalSummary?.periodChange == null ? "—" : fmtPct(totalSummary.periodChange)}
            sub={`Since ${chartDateLabel(data[0].dateISO)}`}
          />

          <Metric
            position="middle"
            label="Largest pullback"
            tone={totalSummary?.maxDrawdown != null && totalSummary.maxDrawdown < 0 ? "text-red-400" : "text-zinc-300"}
            value={drawdownLabel(totalSummary?.maxDrawdown)}
            sub="Peak to trough"
          />

          <Metric
            position="middle"
            label="Leading portfolio"
            tone={signedTone(leadingPortfolio?.periodChange)}
            value={leadingPortfolio?.periodChange == null ? "—" : fmtPct(leadingPortfolio.periodChange)}
            sub={leadingPortfolio?.name ?? "No portfolio history"}
            subClassName="truncate"
            title={leadingPortfolio?.name}
          />

          <Metric
            position="last"
            className="col-span-2 sm:col-span-1"
            label={benchmarkName ?? "Benchmark"}
            tone={signedTone(benchmarkSummary?.periodChange)}
            value={benchmarkSummary?.periodChange == null ? "—" : fmtPct(benchmarkSummary.periodChange)}
            sub={benchmarkName ? "Price only, no dividends" : "Not selected"}
          />
        </MetricStrip>
      )}

      <Card className="panel flex flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-white">Change over time</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            <Select items={BENCHMARK_OPTIONS} value={benchmark} onValueChange={(value) => onBenchmarkChange(value ?? "__none__")}>
              <SelectTrigger className="h-8 w-28 border-white/[0.08] bg-transparent text-[11px] text-zinc-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BENCHMARK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
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
                <p className="text-sm text-zinc-400">{hasHistory ? `No snapshots in the last ${range === "MAX" ? "period" : range}` : "No snapshots yet"}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {hasHistory
                    ? "Choose a wider range to see earlier performance."
                    : "Performance will appear here after your first portfolio snapshot."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-[340px] w-full shrink-0 select-none sm:h-[420px] lg:h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" syncWithTicks />
                    <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis domain={yDomain ?? ["auto", "auto"]} ticks={axis?.ticks} tickFormatter={(value: number) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                      formatter={(value) => fmtPct(Number(value))}
                      labelStyle={{ color: "#a1a1aa" }}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.24)" strokeDasharray="4 4" />
                    {!hiddenSeries.has("total") && <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" fill="#ffffff" fillOpacity={0.08} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={animateSeries} />}
                    {benchmarkName && !hiddenSeries.has("benchmark") && <Area type="monotone" dataKey="benchmark" name={benchmarkName} stroke="#fbbf24" fill="transparent" strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls isAnimationActive={animateSeries} />}
                    {series.filter((item) => !hiddenSeries.has(item.key)).map((item) => (
                      <Area key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls isAnimationActive={animateSeries} />
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
          <SectionHeading
            id="performance-series-heading"
            title="By series"
            meta={`Indexed · ${range}`}
            spacing="tight"
          />
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
                <span className={`text-right text-sm tabular-nums ${signedTone(item.periodChange)}`}>{item.periodChange == null ? "—" : fmtPct(item.periodChange)}</span>
                <span className="text-right text-sm tabular-nums text-zinc-400">{drawdownLabel(item.maxDrawdown)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs leading-relaxed text-zinc-600">Figures show value movement, not a flow-adjusted investment return. “Largest pullback” is based on saved observations; benchmarks use price data and may exclude dividends.</p>
    </section>
  );
});
