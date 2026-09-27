"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { AllocationCard, type AllocationItem } from "@/components/dashboard/shared/AllocationCard";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { ZoomResetButton, ZoomSelectionArea, useChartZoom } from "@/components/ChartZoom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { Snapshot } from "@/lib/store";
import { chartDateLabel, filterByRange, fmtGBP, fmtPct, fmtRelative, gbpAxisFormatter, numericValues, paddedDomain, todayISODate, valueChangeOverRange } from "@/lib/format";

type ProviderPortfolioSummary = {
  id: string;
  name: string;
  color: string;
  value: number;
  gain: number;
  holdingsCount: number;
};

type ProviderHoldingSummary = {
  id: string;
  symbol: string;
  name: string;
  value: number;
  gain: number;
};

type ProviderDashboardProps = {
  name: string;
  accountName: string;
  color: string;
  dateFormat: string;
  portfolios: ProviderPortfolioSummary[];
  directHoldings: ProviderHoldingSummary[];
  history: Snapshot[];
  allocation: AllocationItem[];
  holdingCount: number;
  latestRefresh: number | null;
  staleCount: number;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  onBack: () => void;
  onRename: (name: string) => Promise<void>;
  onNewPortfolio: () => void;
  onDelete: () => void;
  onOpenPortfolio: (id: string) => void;
  onOpenHolding: (id: string) => void;
};

type ProviderChartRow = { date: string; dateISO: string; total: number };

export function ProviderDashboard({
  name,
  accountName,
  color,
  dateFormat,
  portfolios,
  directHoldings,
  history,
  allocation,
  holdingCount,
  latestRefresh,
  staleCount,
  value,
  cost,
  gain,
  gainPct,
  onBack,
  onRename,
  onNewPortfolio,
  onDelete,
  onOpenPortfolio,
  onOpenHolding,
}: ProviderDashboardProps) {
  const [range, setRange] = useState<"1M" | "3M" | "1Y" | "MAX">("1Y");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const chartData = useMemo<ProviderChartRow[]>(() => {
    const rows = filterByRange(history, range);
    if (!rows.length) return [{ date: chartDateLabel(todayISODate()), dateISO: todayISODate(), total: value }];
    return rows.map((row) => ({ date: chartDateLabel(row.date), dateISO: row.date, total: row.value }));
  }, [history, range, value]);
  const chartZoom = useChartZoom(chartData);
  const periodChange = useMemo(() => valueChangeOverRange(history, range, value), [history, range, value]);
  const axisValues = useMemo(() => numericValues(chartZoom.visible), [chartZoom.visible]);
  const axisFmt = useMemo(() => gbpAxisFormatter(axisValues), [axisValues]);
  const yDomain = useMemo(() => paddedDomain(axisValues), [axisValues]);

  const saveName = async () => {
    const trimmed = editName.trim();
    if (trimmed.length < 2) return toast({ title: "Name too short", variant: "error" });
    setSaving(true);
    try {
      await onRename(trimmed);
      setEditOpen(false);
      toast({ title: "Provider renamed", variant: "success" });
    } catch (error) {
      toast({ title: "Rename failed", description: error instanceof Error ? error.message : String(error), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLevel label={`${name} provider`}>
      <div className="relative overflow-hidden rounded-2xl border p-6 md:p-8" style={{ borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, background: `linear-gradient(to bottom right, color-mix(in srgb, ${color} 16.5%, transparent), color-mix(in srgb, ${color} 7%, transparent))` }}>
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{name}</h1>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-300">Provider</Badge>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-zinc-400">{accountName}</Badge>
            </div>
            <p className="mt-2 text-sm text-zinc-500">{portfolios.length} {portfolios.length === 1 ? "portfolio" : "portfolios"} • {holdingCount} {holdingCount === 1 ? "holding" : "holdings"} • prices updated {fmtRelative(latestRefresh, dateFormat)} • {staleCount} stale / unverified</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={onBack}>← {accountName}</Button>
            <Button variant="outline" className="border-white/10 bg-white/5" onClick={() => { setEditName(name); setEditOpen(true); }}>Edit</Button>
            <Button onClick={onNewPortfolio}><Plus className="h-4 w-4" /> Add portfolio</Button>
            <Button variant="ghost" className="border border-white/5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</Button>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-1 gap-4 min-[520px]:grid-cols-3">
          <div className="rounded-xl border-l-4 bg-white p-4 text-black" style={{ borderLeftColor: color }}>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Value</div>
            <div className="mt-1 text-2xl font-bold">{fmtGBP(value)}</div>
            <div className="mt-1 text-xs text-zinc-600">Cost {fmtGBP(cost)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Unrealized gain</div>
            <div className="flex items-center gap-2 text-2xl font-bold" style={{ color: gain >= 0 ? "#34d399" : "#f87171" }}>{fmtGBP(gain)} <span className="text-sm">{fmtPct(gainPct)}</span></div>
            <div className="mt-1 text-xs text-zinc-500">Current positions only</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Value change · {range}</div>
            {periodChange ? <>
              <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: periodChange.amount >= 0 ? "#34d399" : "#f87171" }}>{periodChange.amount >= 0 ? "+" : "−"}{fmtGBP(Math.abs(periodChange.amount))} <span className="text-sm">{periodChange.percent == null ? "" : fmtPct(periodChange.percent)}</span></div>
              <div className="mt-1 text-xs text-zinc-500">Since {periodChange.fromDate} · trades can affect value</div>
            </> : <div className="mt-1 text-sm text-zinc-500">More history needed</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="glass-card xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white">Performance</CardTitle>
              <CardDescription>{history.length} points • {name}</CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {(["1M", "3M", "1Y", "MAX"] as const).map((item) => (
                <Button key={item} variant={range === item ? "secondary" : "ghost"} size="xs" onClick={() => setRange(item)}>{item}</Button>
              ))}
              {chartZoom.zoomed && <ZoomResetButton onReset={chartZoom.reset} />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] select-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartZoom.visible} style={{ cursor: chartZoom.selectionLabels ? "col-resize" : "crosshair" }} {...chartZoom.chartProps}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <ZoomSelectionArea labels={chartZoom.selectionLabels} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis domain={yDomain ?? ["auto", "auto"]} tickFormatter={axisFmt} tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} formatter={(point) => fmtGBP(Number(point))} />
                  <Area type="monotone" dataKey="total" name={name} stroke={color} fill={color} fillOpacity={0.14} strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <div className="min-w-0 xl:col-span-2">
          <AllocationCard allocation={allocation} mode="holding" onModeChange={() => {}} layout="fill" showModeSelector={false} compactChart emptyMessage="No holdings in this provider yet" />
        </div>
      </div>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-white">Portfolios</CardTitle>
          <CardDescription>Choose a portfolio to open its full dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {portfolios.length === 0 && directHoldings.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No portfolios or holdings at this provider yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {portfolios.map((portfolio) => (
                <button key={portfolio.id} type="button" onClick={() => onOpenPortfolio(portfolio.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: portfolio.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{portfolio.name}</span>
                    <span className="block text-xs text-zinc-500">{portfolio.holdingsCount} holdings • {value > 0 ? `${(portfolio.value / value * 100).toFixed(1)}% of provider` : "0% of provider"} • unrealized {fmtGBP(portfolio.gain)}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums text-white">{fmtGBP(portfolio.value)}</span>
                </button>
              ))}
              {directHoldings.map((holding) => (
                <button key={holding.id} type="button" onClick={() => onOpenHolding(holding.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-bold text-zinc-300">{holding.symbol.slice(0, 3)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{holding.symbol}</span>
                    <span className="block truncate text-xs text-zinc-500">Direct holding • {holding.name} • {value > 0 ? `${(holding.value / value * 100).toFixed(1)}% of provider` : "0% of provider"} • unrealized {fmtGBP(holding.gain)}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums text-white">{fmtGBP(holding.value)}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-white/10 bg-zinc-900 text-white">
          <DialogHeader><DialogTitle>Edit provider</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="provider-name">Name</Label>
            <Input id="provider-name" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveName()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLevel>
  );
}
