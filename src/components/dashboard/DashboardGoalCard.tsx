"use client";

import { useEffect, useState } from "react";
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
    <section className="pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-white">Goal</h2>
        {goal && <span className="text-xs font-medium tabular-nums text-emerald-300">{progress.toFixed(0)}%</span>}
      </div>

      {goal ? (
        <>
          <p className="mt-1 truncate text-xs text-zinc-400">{goal.name}</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-zinc-600">
            <span className="tabular-nums">{fmtGBP(currentValue)} of {fmtGBP(goal.targetValue)}</span>
            <button type="button" onClick={onViewGoals} className="shrink-0 text-zinc-500 transition-colors hover:text-white">View</button>
          </div>
        </>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-600">No goal set.</p>
          <button type="button" onClick={onViewGoals} className="text-[11px] text-zinc-400 transition-colors hover:text-white">Set one</button>
        </div>
      )}
    </section>
  );
}
