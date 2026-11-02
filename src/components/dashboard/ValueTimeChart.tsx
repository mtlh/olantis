"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartZoom, ZoomResetButton, ZoomSelectionArea } from "@/components/ChartZoom";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { evenAxisTicks, fmtGBP, gbpAxisFormatter, numericValues, paddedDomain } from "@/lib/format";

export type ValueTimeChartRow = {
  date: string;
  dateISO: string;
  total: number;
  [key: string]: string | number | null;
};

export type ValueTimeChartSeries = {
  key: string;
  dataKey: string;
  name: string;
  color: string;
};

export type ValueTimeChartDot = {
  x: string;
  y: number;
  type: "buy" | "sell";
  symbol: string;
  date: string;
};

type ValueTimeChartProps = {
  data: ValueTimeChartRow[];
  title: string;
  detail: string;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  color?: string;
  totalName?: string;
  series?: ValueTimeChartSeries[];
  dots?: ValueTimeChartDot[];
  showTradeMarkers?: boolean;
  showSeriesToggle?: boolean;
  className?: string;
};

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
};

export function ValueTimeChart({
  data,
  title,
  detail,
  range,
  onRangeChange,
  color = "#ffffff",
  totalName = "Total",
  series = [],
  dots = [],
  showTradeMarkers = false,
  showSeriesToggle = false,
  className = "",
}: ValueTimeChartProps) {
  // Only the total is on by default so the Y axis stays tight around it;
  // per-portfolio lines are opt in. Keys (not a hidden set) so a series that
  // appears later — a new portfolio — also starts off.
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(["total"]));
  const chartZoom = useChartZoom(data);
  const totalVisible = !showSeriesToggle || visibleKeys.has("total");
  const visibleSeries = useMemo(
    () => showSeriesToggle ? series.filter((item) => visibleKeys.has(item.key)) : series,
    [series, showSeriesToggle, visibleKeys],
  );

  const axisValues = useMemo(() => {
    if (!showSeriesToggle) return numericValues(chartZoom.visible);

    const values: number[] = [];
    for (const row of chartZoom.visible) {
      if (totalVisible && typeof row.total === "number" && Number.isFinite(row.total)) values.push(row.total);
      for (const item of visibleSeries) {
        const value = row[item.dataKey];
        if (typeof value === "number" && Number.isFinite(value)) values.push(value);
      }
    }
    return values;
  }, [chartZoom.visible, showSeriesToggle, totalVisible, visibleSeries]);
  const axisFormatter = useMemo(() => gbpAxisFormatter(axisValues), [axisValues]);
  const axis = useMemo(() => evenAxisTicks(axisValues), [axisValues]);
  const yDomain = axis?.domain ?? paddedDomain(axisValues);
  const canShowDots = showTradeMarkers && (!showSeriesToggle || totalVisible);
  const visibleDates = useMemo(() => new Set(chartZoom.visible.map((row) => row.date)), [chartZoom.visible]);
  const visibleDots = useMemo(() => canShowDots ? dots.filter((dot) => visibleDates.has(dot.x)) : [], [canShowDots, dots, visibleDates]);

  const description = showSeriesToggle
    ? `${detail} • ${data.length} points • ${range}${visibleSeries.length ? ` • ${Number(totalVisible) + visibleSeries.length}/${1 + series.length} series` : ""}`
    : `${data.length} points • ${detail}${dots.length ? ` • ${dots.length} trades` : ""}`;
  const totalStroke = showSeriesToggle ? "#ffffff" : color;
  const totalFillOpacity = showSeriesToggle ? 0.08 : 0.14;

  const toggleSeries = (key: string) => {
    setVisibleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showAllSeries = () => setVisibleKeys(new Set(["total", ...series.map((item) => item.key)]));

  return (
    <Card className={`${className} glass-card`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <ChartRangeSelector range={range} onRangeChange={onRangeChange} />
          {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] select-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
              {/* Grid lines follow the Y ticks (which `evenAxisTicks` keeps on
                  equal steps) so every row of the grid is the same height. */}
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" syncWithTicks />
              <ZoomSelectionArea labels={chartZoom.selectionLabels} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis domain={yDomain ?? ["auto", "auto"]} ticks={axis?.ticks} tickFormatter={axisFormatter} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => fmtGBP(Number(value))} />
              {totalVisible && (
                <Area
                  type="monotone"
                  dataKey="total"
                  name={showSeriesToggle ? "Total" : totalName}
                  stroke={totalStroke}
                  fill={totalStroke}
                  fillOpacity={totalFillOpacity}
                  strokeWidth={2.5}
                  dot={false}
                />
              )}
              {visibleSeries.map((item) => (
                <Area key={item.key} type="monotone" dataKey={item.dataKey} name={item.name} stroke={item.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              ))}
              {visibleDots.map((dot) => (
                <ReferenceDot key={`${dot.date}-${dot.symbol}-${dot.x}`} x={dot.x} y={dot.y} r={showSeriesToggle ? 4 : 5} fill={dot.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={showSeriesToggle ? 1 : 1.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {canShowDots && dots.length > 0 && (
          <div className="flex gap-3 mt-2 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Buy</span>
            <span className="flex items-center gap-1.5 text-zinc-400"><span className="w-2 h-2 rounded-full bg-red-500" /> Sell</span>
            {!showSeriesToggle && <span className="text-zinc-600">Trades marked on chart</span>}
          </div>
        )}
        {showSeriesToggle && (
          <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
            {[{ key: "total", name: "Total", color: "#ffffff" }, ...series].map((item) => {
              const visible = visibleKeys.has(item.key);
              return (
                <button key={item.key} type="button" onClick={() => toggleSeries(item.key)} title={`${visible ? "Hide" : "Show"} ${item.name}`} className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors ${visible ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-white/5 text-zinc-600 hover:text-zinc-400"}`}>
                  <span className="w-3 h-0.5 rounded-full" style={{ background: item.color, opacity: visible ? 1 : 0.3 }} /> {item.name}
                </button>
              );
            })}
            {visibleSeries.length < series.length && <button type="button" onClick={showAllSeries} className="px-2 py-1 rounded-full text-zinc-500 hover:text-white underline underline-offset-2">Show all</button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
