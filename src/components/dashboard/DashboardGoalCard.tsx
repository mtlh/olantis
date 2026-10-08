"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtGBP } from "@/lib/format";

type GoalSummary = { id: string; name: string; targetValue: number; targetDate: string };

type DashboardGoalCardProps = {
  currentValue: number;
  onViewGoals: () => void;
};

export function DashboardGoalCard({ currentValue, onViewGoals }: DashboardGoalCardProps) {
  const [goal, setGoal] = useState<GoalSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals")
      .then(async (response) => response.ok ? await response.json() as GoalSummary[] : [])
      .then((goals) => { if (!cancelled) setGoal(Array.isArray(goals) ? goals[0] ?? null : null); })
      .catch(() => { if (!cancelled) setGoal(null); });
    return () => { cancelled = true; };
  }, []);

  const progress = goal && goal.targetValue > 0 ? currentValue / goal.targetValue * 100 : 0;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-white">Portfolio goal</CardTitle>
        <CardDescription>Progress toward your next milestone.</CardDescription>
      </CardHeader>
      <CardContent>
        {goal ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-medium text-zinc-200">{goal.name}</span>
              <span className="text-sm font-semibold tabular-nums text-emerald-300">{progress.toFixed(1)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between gap-3 text-xs text-zinc-500">
              <span>{fmtGBP(currentValue)} tracked</span><span>{fmtGBP(goal.targetValue)} target</span>
            </div>
            <Button type="button" variant="link" size="xs" className="mt-2 h-auto p-0 text-zinc-400" onClick={onViewGoals}>View goal details →</Button>
          </>
        ) : (
          <>
            <p className="text-xs text-zinc-500">Set a target value and date to track progress here.</p>
            <Button type="button" variant="link" size="xs" className="mt-2 h-auto p-0 text-zinc-300" onClick={onViewGoals}>Set a goal →</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
