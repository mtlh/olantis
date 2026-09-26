"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChartZoom, ZoomResetButton, ZoomSelectionArea } from "@/components/ChartZoom";
import { paddedDomain, fmtPct } from "@/lib/format";

export type PerformanceChartRow = {
  date: string;
  dateISO: string;
  [key: string]: string | number | null;
};

export type PerformanceSeries = { key: string; name: string; color: string };

export function PerformanceChart({
  data,
  series,
  range,
  onRangeChange,
  benchmark,
  onBenchmarkChange,
}: {
  data: PerformanceChartRow[];
  series: PerformanceSeries[];
  range: "1M" | "3M" | "1Y" | "MAX";
  onRangeChange: (range: "1M" | "3M" | "1Y" | "MAX") => void;
  benchmark: string;
  onBenchmarkChange: (benchmark: string) => void;
}) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const chartZoom = useChartZoom(data);
  const visibleKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!hiddenSeries.has("total")) keys.add("total");
    for (const item of series) if (!hiddenSeries.has(item.key)) keys.add(item.key);
    if (benchmark !== "__none__" && !hiddenSeries.has("benchmark")) keys.add("benchmark");
    return keys;
  }, [series, hiddenSeries, benchmark]);
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

  return (
    <section aria-label="Portfolio performance" className="flex min-h-[calc(100vh-7rem)] flex-col gap-5">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Performance</h1>
        <p className="mt-1 text-sm text-zinc-500">Compare how your portfolios have changed since their first snapshot.</p>
      </header>

      <Card className="glass-card flex min-h-[480px] flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-white">Change over time</CardTitle>
            <CardDescription>{data.length} points · percentage change since first snapshot</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Select value={benchmark} onValueChange={(value) => onBenchmarkChange(value ?? "__none__")}>
              <SelectTrigger className="h-8 w-28 bg-white/5 border-white/10 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Benchmark</SelectItem>
                <SelectItem value="VWRL.L">VWRL</SelectItem>
                <SelectItem value="^FTSE">FTSE 100</SelectItem>
                <SelectItem value="^GSPC">S&amp;P 500</SelectItem>
                <SelectItem value="MSFT">Microsoft</SelectItem>
              </SelectContent>
            </Select>
            {(["1M", "3M", "1Y", "MAX"] as const).map((item) => (
              <Button key={item} variant={range === item ? "secondary" : "ghost"} size="xs" onClick={() => onRangeChange(item)}>{item}</Button>
            ))}
            {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {data.length === 0 ? (
            <div className="grid flex-1 place-items-center text-center">
              <div>
                <p className="text-sm text-zinc-400">No snapshots yet</p>
                <p className="mt-1 text-xs text-zinc-600">Performance will appear here after your first portfolio snapshot.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-[calc(100vh-18rem)] min-h-[340px] flex-1 select-none">
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
                    {benchmark !== "__none__" && !hiddenSeries.has("benchmark") && <Area type="monotone" dataKey="benchmark" name={benchmark === "VWRL.L" ? "VWRL" : benchmark === "^FTSE" ? "FTSE 100" : benchmark === "^GSPC" ? "S&P 500" : benchmark} stroke="#fbbf24" fill="transparent" strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls />}
                    {series.filter((item) => !hiddenSeries.has(item.key)).map((item) => (
                      <Area key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {[{ key: "total", name: "Total", color: "#ffffff" }, ...series, ...(benchmark !== "__none__" ? [{ key: "benchmark", name: benchmark === "VWRL.L" ? "VWRL" : benchmark === "^FTSE" ? "FTSE 100" : benchmark === "^GSPC" ? "S&P 500" : benchmark, color: "#fbbf24" }] : [])].map((item) => (
                  <button key={item.key} onClick={() => toggleSeries(item.key)} title={`${hiddenSeries.has(item.key) ? "Show" : "Hide"} ${item.name}`} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors ${!hiddenSeries.has(item.key) ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-white/5 text-zinc-600 hover:text-zinc-400"}`}>
                    <span className="h-0.5 w-3 rounded-full" style={{ background: item.color, opacity: hiddenSeries.has(item.key) ? 0.3 : 1 }} /> {item.name}
                  </button>
                ))}
                {hiddenSeries.size > 0 && <button onClick={() => setHiddenSeries(new Set())} className="px-2 py-1 text-zinc-500 underline underline-offset-2 hover:text-white">Show all</button>}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
