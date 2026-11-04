"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { memo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtGBP } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AllocationItem = {
  name: string;
  value: number;
  color: string;
  pct: number;
};

type AllocationMode = "holding" | "account" | "sector";

type AllocationCardProps = {
  allocation: AllocationItem[];
  mode: AllocationMode;
  onModeChange: (mode: AllocationMode) => void;
  layout?: "fill" | "stacked";
  showModeSelector?: boolean;
  compactChart?: boolean;
  emptyMessage?: string;
  emptyContent?: ReactNode;
  /** `panel` uses the quieter overview surface; `glass` keeps the classic card. */
  surface?: "glass" | "panel";
};

const MODES: { value: AllocationMode; label: string }[] = [
  { value: "holding", label: "Holdings" },
  { value: "account", label: "Accounts" },
  { value: "sector", label: "Sectors" },
];

export const AllocationCard = memo(function AllocationCard({
  allocation,
  mode,
  onModeChange,
  layout = "stacked",
  showModeSelector = true,
  compactChart = false,
  emptyMessage = "No holdings — add one to see allocation",
  emptyContent,
  surface = "glass",
}: AllocationCardProps) {
  const fillsCard = layout === "fill";

  return (
    <Card className={cn("flex flex-col", surface === "panel" ? "panel" : "glass-card", fillsCard && "h-full min-h-[420px]")}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-white">Allocation</CardTitle>
        {showModeSelector && (
          <div className="flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5">
            {MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={mode === item.value}
                onClick={() => onModeChange(item.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  mode === item.value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className={`flex-1 min-h-0 ${fillsCard ? "flex" : ""}`}>
        {allocation.length === 0 ? (
          <div className="grid h-full min-h-40 place-items-center text-center">
            {emptyContent ?? <p className="text-sm text-zinc-500">{emptyMessage}</p>}
          </div>
        ) : fillsCard ? (
          <div className="mx-auto flex min-h-[320px] w-full max-w-[560px] flex-1 flex-col items-stretch gap-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-4">
            <div className={`mx-auto h-[200px] min-h-[200px] w-full max-w-[240px] shrink-0 min-[360px]:mx-0 min-[360px]:h-full min-[360px]:min-h-[300px] ${compactChart ? "min-[360px]:w-[38%] min-[360px]:min-w-[140px]" : "min-[360px]:w-[44%] min-[360px]:min-w-[180px]"}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={mode}>
                  <Pie data={allocation} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="82%" stroke="none">
                    {allocation.map((item, index) => <Cell key={`${mode}-${item.name}-${index}`} fill={item.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} formatter={(value) => fmtGBP(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex max-h-[360px] min-h-0 min-w-0 flex-1 flex-col justify-evenly overflow-y-auto pr-1 min-[360px]:h-full min-[360px]:min-h-[300px]">
              {allocation.map((item) => (
                <div key={`${mode}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-400">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="text-right text-xs font-medium tabular-nums text-zinc-300">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={mode}>
                  <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} stroke="none">
                    {allocation.map((item, index) => <Cell key={`${mode}-${item.name}-${index}`} fill={item.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} formatter={(value) => fmtGBP(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
              {allocation.map((item) => (
                <div key={`${mode}-${item.name}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-400"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span>
                  <span className="shrink-0 text-zinc-300 tabular-nums">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});
