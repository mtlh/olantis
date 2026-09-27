"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtGBP } from "@/lib/format";

export type AllocationItem = {
  name: string;
  value: number;
  color: string;
  pct: number;
};

type AllocationCardProps = {
  allocation: AllocationItem[];
  mode: "holding" | "account" | "sector";
  onModeChange: (mode: "holding" | "account" | "sector") => void;
  layout?: "fill" | "stacked";
  showModeSelector?: boolean;
  compactChart?: boolean;
  emptyMessage?: string;
  emptyContent?: ReactNode;
};

export function AllocationCard({
  allocation,
  mode,
  onModeChange,
  layout = "stacked",
  showModeSelector = true,
  compactChart = false,
  emptyMessage = "No holdings — add one to see allocation",
  emptyContent,
}: AllocationCardProps) {
  const fillsCard = layout === "fill";

  return (
    <Card className={`glass-card flex flex-col ${fillsCard ? "h-full min-h-[420px]" : ""}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-white">Allocation</CardTitle>
        {showModeSelector && (
          <div className="flex flex-wrap gap-1">
            <Button variant={mode === "holding" ? "secondary" : "ghost"} size="xs" onClick={() => onModeChange("holding")}>Holdings</Button>
            <Button variant={mode === "account" ? "secondary" : "ghost"} size="xs" onClick={() => onModeChange("account")}>Accounts</Button>
            <Button variant={mode === "sector" ? "secondary" : "ghost"} size="xs" onClick={() => onModeChange("sector")}>Sectors</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className={`flex-1 min-h-0 ${fillsCard ? "flex" : ""}`}>
        {allocation.length === 0 ? (
          <div className="grid h-full min-h-40 place-items-center text-center">
            {emptyContent ?? <p className="text-sm text-zinc-500">{emptyMessage}</p>}
          </div>
        ) : fillsCard ? (
          <div className="flex min-h-[320px] w-full flex-1 flex-col items-stretch gap-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-4">
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
                <div key={`${mode}-${item.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-400">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="text-right font-medium tabular-nums text-white">{item.pct.toFixed(1)}%</span>
                  <span className="col-start-1 pl-[18px] text-xs tabular-nums text-zinc-500">{fmtGBP(item.value)}</span>
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
                  <span className="flex min-w-0 items-center gap-2 text-zinc-400"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span>
                  <span className="shrink-0 text-white tabular-nums">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
