"use client";

import { memo, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChartZoom, ZoomResetButton, ZoomSelectionArea } from "@/components/ChartZoom";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { evenAxisTicks, fmtGBP, fmtPct, fmtPrice, gbpAxisFormatter, numericValues, paddedDomain, priceAxisFormatter } from "@/lib/format";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  color?: string;
  totalName?: string;
  series?: ValueTimeChartSeries[];
  dots?: ValueTimeChartDot[];
  showTradeMarkers?: boolean;
  showSeriesToggle?: boolean;
  /** Optional one-line note under the title. Omit it when the chart speaks for itself. */
  description?: string;
  /** Format as a per-share price in this currency instead of a GBP value. */
  currency?: string | null;
  /** `panel` uses the quieter overview surface; `glass` keeps the classic card. */
  surface?: "glass" | "panel";
  /** Chart plot height utility. Defaults to `h-[320px]`. */
  heightClassName?: string;
  className?: string;
};

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
};

// Module-level defaults keep the props referentially stable so `memo` can skip
// re-rendering the chart when unrelated dashboard state changes.
const NO_SERIES: ValueTimeChartSeries[] = [];
const NO_DOTS: ValueTimeChartDot[] = [];

export const ValueTimeChart = memo(function ValueTimeChart({
  data,
  title,
  range,
  onRangeChange,
  color = "#ffffff",
  totalName = "Total",
  series = NO_SERIES,
  dots = NO_DOTS,
  showTradeMarkers = false,
  showSeriesToggle = false,
  description,
  currency,
  surface = "glass",
  heightClassName = "h-[320px]",
  className = "",
}: ValueTimeChartProps) {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(["total"]));
  const [mode, setMode] = useState<"value" | "percent">("value");
  const [expanded, setExpanded] = useState(false);

  const baselineMap = useMemo(() => {
    const map: Record<string, number> = {};
    const keys = ["total", ...series.map((item) => item.dataKey)];
    for (const key of keys) {
      for (const row of data) {
        const v = row[key];
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) { map[key] = v; break; }
      }
    }
    return map;
  }, [data, series]);

  const displayData = useMemo(() => {
    if (mode === "value") return data;
    return data.map((row) => {
      const next: ValueTimeChartRow = { ...row };
      for (const key of ["total", ...series.map((item) => item.dataKey)]) {
        const v = row[key];
        const base = baselineMap[key];
        if (typeof v === "number" && Number.isFinite(v) && base) {
          next[key] = ((v / base) - 1) * 100;
        } else {
          next[key] = null;
        }
      }
      return next;
    });
  }, [data, mode, series, baselineMap]);

  const displayDots = useMemo(() => {
    if (mode === "value") return dots;
    const base = baselineMap.total;
    if (!base) return [];
    return dots.map((dot) => ({ ...dot, y: ((dot.y / base) - 1) * 100 }));
  }, [dots, mode, baselineMap]);

  const chartZoom = useChartZoom(displayData);
  const animateSeries = useChartAnimation(chartZoom.visible.length);
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
  const axisFormatter = useMemo(() => {
    if (mode === "percent") return (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
    return currency ? priceAxisFormatter(axisValues, currency) : gbpAxisFormatter(axisValues);
  }, [mode, currency, axisValues]);
  const axis = useMemo(() => evenAxisTicks(axisValues), [axisValues]);
  const yDomain = axis?.domain ?? paddedDomain(axisValues);
  const canShowDots = showTradeMarkers && (!showSeriesToggle || totalVisible);
  const visibleDates = useMemo(() => new Set(chartZoom.visible.map((row) => row.date)), [chartZoom.visible]);
  const visibleDots = useMemo(() => canShowDots ? displayDots.filter((dot) => visibleDates.has(dot.x)) : [], [canShowDots, displayDots, visibleDates]);

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

  const tooltipFormatter = (value: unknown) => {
    const n = Number(value);
    if (mode === "percent") return fmtPct(n);
    return currency ? fmtPrice(n, currency) : fmtGBP(n);
  };

  const renderChart = (heightClass: string) => (
    <>
      <div className={`${heightClass} select-none`} role="img" aria-label={`${title} chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
            {/* Grid lines follow the Y ticks (which `evenAxisTicks` keeps on
                equal steps) so every row of the grid is the same height. */}
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" syncWithTicks />
            <ZoomSelectionArea labels={chartZoom.selectionLabels} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
            <YAxis domain={yDomain ?? ["auto", "auto"]} ticks={axis?.ticks} tickFormatter={axisFormatter} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => tooltipFormatter(value)} />
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
                isAnimationActive={animateSeries}
              />
            )}
            {visibleSeries.map((item) => (
              <Area key={item.key} type="monotone" dataKey={item.dataKey} name={item.name} stroke={item.color} fill="transparent" strokeWidth={2} dot={false} strokeDasharray="4 4" isAnimationActive={animateSeries} />
            ))}
            {visibleDots.map((dot) => (
              <ReferenceDot key={`${dot.date}-${dot.symbol}-${dot.x}`} x={dot.x} y={dot.y} r={showSeriesToggle ? 4 : 5} fill={dot.type === "buy" ? "#10b981" : "#ef4444"} stroke="#fff" strokeWidth={showSeriesToggle ? 1 : 1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {canShowDots && dots.length > 0 && (
        <div className="mt-2 flex gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Buy</span>
          <span className="flex items-center gap-1.5 text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Sell</span>
        </div>
      )}
      {showSeriesToggle && (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[11px]">
          {[{ key: "total", name: "Total", color: "#ffffff" }, ...series].map((item) => {
            const visible = visibleKeys.has(item.key);
            return (
              <button key={item.key} type="button" onClick={() => toggleSeries(item.key)} title={`${visible ? "Hide" : "Show"} ${item.name}`} className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors ${visible ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-400"}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color, opacity: visible ? 1 : 0.3 }} /> {item.name}
              </button>
            );
          })}
          {visibleSeries.length < series.length && <button type="button" onClick={showAllSeries} className="px-2 py-1 text-zinc-500 transition-colors hover:text-white">Show all</button>}
        </div>
      )}
    </>
  );

  return (
    <>
      <Card className={`${className} ${surface === "panel" ? "panel" : "glass-card"}`}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium text-white">{title}</CardTitle>
            {description && <CardDescription className="mt-1 text-xs text-zinc-500">{description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5">
              <button type="button" onClick={() => setMode("value")} aria-pressed={mode === "value"} className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", mode === "value" ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300")}>Value</button>
              <button type="button" onClick={() => setMode("percent")} aria-pressed={mode === "percent"} className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors", mode === "percent" ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300")}>%</button>
            </div>
            <ChartRangeSelector range={range} onRangeChange={onRangeChange} segmented />
            {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
            <button type="button" onClick={() => setExpanded(true)} aria-label="Expand chart" className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {renderChart(heightClassName)}
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/* The chart itself is the first tabbable element, so the default
            autofocus lands on it and draws its focus ring around the whole
            plot. Opening with a pointer should not move focus there; keyboard
            users still get the chart, where the ring is meaningful. */}
        <DialogContent
          className="max-w-[95vw] sm:max-w-[95vw]"
          initialFocus={(openType) => openType === "keyboard"}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 pr-10">
            <DialogTitle>{title}</DialogTitle>
            {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} label="Reset" />}
          </DialogHeader>
          {renderChart("h-[70vh]")}
        </DialogContent>
      </Dialog>
    </>
  );
});