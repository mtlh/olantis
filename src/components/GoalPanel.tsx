"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtGBP, filterByRange, todayISODate, chartDateLabel } from "@/lib/format";
import { useWorkspaceBootstrap, type Goal, type Snapshot } from "@/lib/store";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";

export function GoalPanel({ currentValue, history, dateFormat }: { currentValue: number; history: Snapshot[]; dateFormat: string }) {
  // The goal ships with the workspace bootstrap, so the first paint already has
  // its real shape (4 metrics, progress bar, goal sidebar). Fetching it on mount
  // meant /goals rendered the "no goal" layout first and then jumped to this one.
  const boot = useWorkspaceBootstrap();
  const serverGoal = boot ? boot.goals[0] ?? null : undefined;
  const [goalOverride, setGoalOverride] = useState<Goal | null | undefined>(undefined);
  // Derived, not copied: a save/remove overrides the bootstrapped goal, and
  // everything else follows it, so there is no state to re-sync.
  const goal = goalOverride !== undefined ? goalOverride : serverGoal ?? null;
  const [name, setName] = useState(serverGoal?.name ?? "Portfolio goal");
  const [targetValue, setTargetValue] = useState(serverGoal ? String(serverGoal.targetValue) : "");
  const [targetDate, setTargetDate] = useState(serverGoal?.targetDate ?? "");
  const [range, setRange] = useState<ChartRange>("MAX");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Bootstrap already carried the goal (or proved there isn't one).
    if (serverGoal !== undefined) return;
    let cancelled = false;
    fetch("/api/goals").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load goal");
      const first = (Array.isArray(data) ? data[0] : null) as Goal | null;
      if (!cancelled && first) {
        setGoalOverride(first);
        setName(first.name);
        setTargetValue(String(first.targetValue));
        setTargetDate(first.targetDate);
      }
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load goal");
    });
    return () => { cancelled = true; };
  }, [serverGoal]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal?.id, name, targetValue: Number(targetValue), targetDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save goal");
      setGoalOverride({ id: data.id, name: name.trim(), targetValue: Number(targetValue), targetDate });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete goal");
      setGoalOverride(null);
      setTargetValue("");
      setTargetDate("");
      setName("Portfolio goal");
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const allHistory = useMemo(() => {
    const byDate = new Map(history.map((row) => [row.date, row.value]));
    if (currentValue > 0) byDate.set(todayISODate(), currentValue);
    return Array.from(byDate, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, currentValue]);
  const chartRows = useMemo(() => filterByRange(allHistory, range).map((row) => ({
    ...row,
    progress: goal && goal.targetValue > 0 ? row.value / goal.targetValue * 100 : 0,
  })), [allHistory, range, goal]);

  const progress = goal && goal.targetValue > 0 ? currentValue / goal.targetValue * 100 : 0;
  const remaining = goal ? Math.max(0, goal.targetValue - currentValue) : 0;
  const daysLeft = goal ? Math.max(0, Math.ceil((new Date(`${goal.targetDate}T00:00:00`).getTime() - new Date(`${todayISODate()}T00:00:00`).getTime()) / 86400000)) : 0;
  const monthsLeft = Math.max(daysLeft / 30.4375, 1 / 30.4375);
  const monthlyPace = remaining / monthsLeft;
  const chartMetric = goal ? "progress" : "value";
  const chartMax = goal ? Math.max(100, Math.ceil(Math.max(...chartRows.map((row) => row.progress), 0) / 10) * 10) : undefined;
  const startRow = chartRows[0];
  const endRow = chartRows[chartRows.length - 1];
  const periodChange = startRow && endRow && chartRows.length > 1 ? endRow.value - startRow.value : null;
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateFormat, { day: "numeric", month: "short", year: "numeric" });
  const targetDateLabel = goal ? shortDate(goal.targetDate) : "";
  const rangeLabel = range === "MAX" ? "All" : range;
  const reached = goal !== null && remaining === 0;
  const changeLabel = periodChange === null ? "—" : `${periodChange >= 0 ? "+" : "−"}${fmtGBP(Math.abs(periodChange))}`;
  const changeTone = periodChange === null ? "text-zinc-600" : periodChange >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="space-y-8">
      <div className={`grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:gap-0 lg:py-7 ${goal ? "sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]" : "sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]"}`}>
        <div className={`col-span-2 min-w-0 lg:col-span-1 lg:pr-8 ${goal ? "sm:col-span-3" : "sm:col-span-2"}`}>
          <p className={`${LABEL} truncate`} title={goal ? goal.name : undefined}>{goal ? goal.name : "Portfolio value"}</p>
          <p className="mt-2 truncate text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">
            {goal ? `${Math.min(progress, 999).toFixed(1)}%` : fmtGBP(currentValue)}
          </p>
          {goal && (
            <div
              className="mt-3 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/[0.07]"
              role="progressbar"
              aria-label={`${goal.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(progress, 100)}
            >
              <div className="h-full rounded-full bg-emerald-400/80 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          )}
          <p className={SUB}>{goal ? <>{fmtGBP(currentValue)} of {fmtGBP(goal.targetValue)}</> : "As of today"}</p>
        </div>

        {goal ? (
          <>
            <Metric
              className="lg:border-l lg:border-white/[0.06] lg:px-8"
              label="Portfolio value"
              value={fmtGBP(currentValue)}
              sub={periodChange === null ? "No period change yet" : `${changeLabel} over ${rangeLabel}`}
            />
            <Metric
              className="lg:border-l lg:border-white/[0.06] lg:px-8"
              label="Still to go"
              value={reached ? "Reached" : fmtGBP(remaining)}
              tone={reached ? "text-emerald-400" : "text-white"}
              sub={reached ? "Target met" : `By ${targetDateLabel}`}
            />
            <Metric
              className="col-span-2 sm:col-span-1 lg:border-l lg:border-white/[0.06] lg:pl-8"
              label="Monthly pace"
              value={reached ? "—" : fmtGBP(monthlyPace)}
              tone={reached ? "text-zinc-600" : "text-white"}
              sub={reached ? "Complete" : daysLeft === 0 ? "Due today" : `${daysLeft} days left`}
            />
          </>
        ) : (
          <>
            <Metric
              className="lg:border-l lg:border-white/[0.06] lg:px-8"
              label={`Change · ${rangeLabel}`}
              value={changeLabel}
              tone={changeTone}
              sub={periodChange === null || !startRow ? "More history needed" : `Since ${shortDate(startRow.date)}`}
            />
            <Metric
              className="lg:border-l lg:border-white/[0.06] lg:pl-8"
              label="Snapshots"
              value={String(history.length)}
              sub={history[0] ? `Since ${shortDate(history[0].date)}` : "No history yet"}
            />
          </>
        )}
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-0">
        <div className="min-w-0 xl:pr-8">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="min-w-0 truncate text-sm font-medium text-white">{goal ? "Progress over time" : "Value over time"}</CardTitle>
              <ChartRangeSelector range={range} onRangeChange={setRange} maxLabel="All" segmented />
            </CardHeader>
            <CardContent>
              {chartRows.length > 0 ? (
                <>
                  <div className="h-[280px] w-full sm:h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartRows} margin={{ top: 12, right: 18, left: 4, bottom: 0 }}>
                        <defs>
                          <linearGradient id="goalProgressFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#34d399" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tickFormatter={chartDateLabel} minTickGap={28} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                        <YAxis
                          domain={goal ? [0, chartMax ?? 100] : ["auto", "auto"]}
                          tickFormatter={(value: number) => goal ? `${value}%` : fmtGBP(value)}
                          tick={{ fontSize: 11, fill: "#71717a" }}
                          axisLine={false}
                          tickLine={false}
                          width={goal ? 48 : 64}
                        />
                        <Tooltip
                          labelFormatter={(label) => shortDate(String(label))}
                          formatter={(value) => goal ? [`${Number(value).toFixed(1)}%`, "Goal progress"] : [fmtGBP(Number(value)), "Portfolio value"]}
                          contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                        />
                        {goal && <ReferenceLine y={100} stroke="#a1a1aa" strokeDasharray="5 5" label={{ value: "Target", fill: "#a1a1aa", fontSize: 11, position: "insideTopRight" }} />}
                        <Area type="monotone" dataKey={chartMetric} name={goal ? "Goal progress" : "Portfolio value"} stroke="#34d399" fill="url(#goalProgressFill)" strokeWidth={2.5} dot={chartRows.length === 1 ? { r: 4, fill: "#34d399" } : false} activeDot={{ r: 5, fill: "#34d399", stroke: "#09090b", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {chartRows.length === 1 && (
                    <p className="mt-3 text-[11px] text-zinc-600">First snapshot saved. Progress will build from here.</p>
                  )}
                </>
              ) : (
                <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
                  <TrendingUp className="h-5 w-5 text-zinc-600" />
                  <p className="text-sm text-zinc-500">History builds as your portfolio updates.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-6 xl:border-l xl:border-white/[0.06] xl:pl-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
            <h2 className="text-sm font-medium text-white">{goal && !editing ? "Goal" : goal ? "Edit goal" : "Set a goal"}</h2>
            {goal && !editing && (
              <button
                type="button"
                onClick={() => { setEditing(true); setError(""); }}
                className="flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-white"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>

          {goal && !editing ? (
            <>
              <dl className="divide-y divide-white/[0.05]">
                <div className="flex items-baseline justify-between gap-3 py-3">
                  <dt className="text-xs text-zinc-600">Target</dt>
                  <dd className="text-sm font-medium tabular-nums text-white">{fmtGBP(goal.targetValue)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-3">
                  <dt className="text-xs text-zinc-600">Date</dt>
                  <dd className="text-sm text-zinc-300">{targetDateLabel}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-3">
                  <dt className="text-xs text-zinc-600">Status</dt>
                  <dd className={`text-sm ${reached ? "text-emerald-400" : "text-zinc-300"}`}>{reached ? "Reached" : "In progress"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">Monthly pace is a straight-line estimate and excludes investment returns.</p>
              <Button
                variant="ghost"
                className="mt-3 w-full justify-start px-0 text-xs text-zinc-600 hover:bg-transparent hover:text-red-300"
                onClick={() => void remove()}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />{deleting ? "Removing…" : "Remove goal"}
              </Button>
            </>
          ) : (
            <form className="space-y-4 pt-4" onSubmit={(event) => void save(event)}>
              <div className="space-y-1.5"><Label htmlFor="goal-name">Goal name</Label><Input id="goal-name" value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder="e.g. House deposit" required minLength={2} /></div>
              <div className="space-y-1.5"><Label htmlFor="goal-value">Target amount (£)</Label><Input id="goal-value" type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="50,000" required /></div>
              <div className="space-y-1.5"><Label htmlFor="goal-date">Target date</Label><Input id="goal-date" type="date" min={todayISODate()} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></div>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit" disabled={saving}>{saving ? "Saving…" : goal ? "Save changes" : "Set portfolio goal"}</Button>
                {goal && <Button variant="ghost" type="button" onClick={() => { setEditing(false); setName(goal.name); setTargetValue(String(goal.targetValue)); setTargetDate(goal.targetDate); setError(""); }}>Cancel</Button>}
              </div>
            </form>
          )}
          {error && <p role="alert" className="mt-3 text-xs text-amber-300">{error}</p>}
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, tone = "text-white", className = "" }: { label: string; value: React.ReactNode; sub: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className={LABEL}>{label}</p>
      <p className={`mt-2 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${tone}`}>{value}</p>
      <p className={`${SUB} truncate`} title={typeof sub === "string" ? sub : undefined}>{sub}</p>
    </div>
  );
}
