"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Check, Pencil, Target, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtGBP, filterByRange, todayISODate, chartDateLabel } from "@/lib/format";
import type { Snapshot } from "@/lib/store";

type Goal = { id: string; name: string; targetValue: number; targetDate: string };
type Range = "1M" | "3M" | "1Y" | "MAX";

const RANGES: Range[] = ["1M", "3M", "1Y", "MAX"];

export function GoalPanel({ currentValue, history, dateFormat }: { currentValue: number; history: Snapshot[]; dateFormat: string }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [name, setName] = useState("Portfolio goal");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [range, setRange] = useState<Range>("MAX");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load goal");
      const first = (Array.isArray(data) ? data[0] : null) as Goal | null;
      if (!cancelled && first) {
        setGoal(first);
        setName(first.name);
        setTargetValue(String(first.targetValue));
        setTargetDate(first.targetDate);
      }
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load goal");
    });
    return () => { cancelled = true; };
  }, []);

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
      setGoal({ id: data.id, name: name.trim(), targetValue: Number(targetValue), targetDate });
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
      setGoal(null);
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
    progress: goal ? row.value / goal.targetValue * 100 : 0,
  })), [allHistory, range, goal]);

  const progress = goal ? currentValue / goal.targetValue * 100 : 0;
  const remaining = goal ? Math.max(0, goal.targetValue - currentValue) : 0;
  const daysLeft = goal ? Math.max(0, Math.ceil((new Date(`${goal.targetDate}T00:00:00`).getTime() - new Date(`${todayISODate()}T00:00:00`).getTime()) / 86400000)) : 0;
  const monthsLeft = Math.max(daysLeft / 30.4375, 1 / 30.4375);
  const monthlyPace = remaining / monthsLeft;
  const chartMetric = goal ? "progress" : "value";
  const chartMax = goal ? Math.max(100, Math.ceil(Math.max(...chartRows.map((row) => row.progress), 0) / 10) * 10) : undefined;
  const startRow = chartRows[0];
  const endRow = chartRows[chartRows.length - 1];
  const periodChange = startRow && endRow && chartRows.length > 1 ? endRow.value - startRow.value : null;
  const targetDateLabel = goal ? new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(dateFormat, { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <StatCard label="Portfolio value" value={fmtGBP(currentValue)} detail={periodChange === null ? "Your latest balance" : `${periodChange >= 0 ? "+" : "−"}${fmtGBP(Math.abs(periodChange))} in selected period`} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label={goal ? "Goal progress" : "Snapshots"} value={goal ? `${Math.min(progress, 999).toFixed(1)}%` : String(history.length)} detail={goal ? `of ${fmtGBP(goal.targetValue)} target` : "Daily portfolio history"} icon={<Target className="h-4 w-4" />} />
          <StatCard label={goal ? "Still to go" : "Goal status"} value={goal ? fmtGBP(remaining) : "No goal set"} detail={goal && remaining === 0 ? "Target reached — congratulations" : goal ? "Remaining to your target" : "Choose a target to get started"} icon={<Check className="h-4 w-4" />} />
          <StatCard label={goal ? "Suggested monthly pace" : "Tracking since"} value={goal ? (remaining === 0 ? "Complete" : fmtGBP(monthlyPace)) : (history[0] ? new Date(`${history[0].date}T00:00:00`).toLocaleDateString(dateFormat) : "Today")} detail={goal ? (remaining === 0 ? "You have reached your goal" : "Straight-line estimate, excluding returns") : `${history.length} saved ${history.length === 1 ? "snapshot" : "snapshots"}`} icon={<CalendarDays className="h-4 w-4" />} />
        </div>

        {goal && (
          <Card className="glass-card">
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{goal.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Target {targetDateLabel} · {daysLeft === 0 ? "Due today" : `${daysLeft} days to go`}</p>
                </div>
                <span className="text-sm font-semibold text-emerald-300">{Math.min(progress, 999).toFixed(1)}% reached</span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-label={`${goal.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(progress, 100)}
              >
                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
              </div>
              <div className="flex justify-between gap-3 text-xs text-zinc-500"><span>{fmtGBP(currentValue)} saved</span><span>{fmtGBP(goal.targetValue)} target</span></div>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-white">Progress over time</CardTitle>
              <CardDescription className="mt-1">{goal ? "Follow your portfolio as it moves toward your target." : "Your portfolio value, captured over time."}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
              {RANGES.map((item) => <Button key={item} variant={range === item ? "secondary" : "ghost"} size="xs" className="px-2 text-[11px]" onClick={() => setRange(item)}>{item === "MAX" ? "All" : item}</Button>)}
            </div>
          </CardHeader>
          <CardContent>
            {chartRows.length > 0 ? (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows} margin={{ top: 12, right: 10, left: 4, bottom: 0 }}>
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
                      width={goal ? 48 : 70}
                    />
                    <Tooltip
                      labelFormatter={(label) => new Date(`${String(label)}T00:00:00`).toLocaleDateString(dateFormat, { day: "numeric", month: "short", year: "numeric" })}
                      formatter={(value) => goal ? [`${Number(value).toFixed(1)}%`, "Goal progress"] : [fmtGBP(Number(value)), "Portfolio value"]}
                      contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                    />
                    {goal && <ReferenceLine y={100} stroke="#a1a1aa" strokeDasharray="5 5" label={{ value: "Target", fill: "#a1a1aa", fontSize: 11, position: "insideTopRight" }} />}
                    <Area type="monotone" dataKey={chartMetric} name={goal ? "Goal progress" : "Portfolio value"} stroke="#34d399" fill="url(#goalProgressFill)" strokeWidth={2.5} dot={chartRows.length === 1 ? { r: 4, fill: "#34d399" } : false} activeDot={{ r: 5, fill: "#34d399", stroke: "#09090b", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-center">
                <TrendingUp className="h-5 w-5 text-zinc-600" />
                <p className="text-sm text-zinc-400">Your history is just getting started</p>
                <p className="max-w-sm text-xs text-zinc-600">Portfolio snapshots build over time as your balances are updated.</p>
              </div>
            )}
            {chartRows.length > 0 && chartRows.length < 2 && (
              <p className="mt-2 text-center text-xs text-zinc-600">Your first snapshot is in. Progress will build here as your portfolio is updated.</p>
            )}
            {periodChange !== null && <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-zinc-500"><TrendingUp className={`h-3.5 w-3.5 ${periodChange >= 0 ? "text-emerald-400" : "rotate-180 text-red-400"}`} />{periodChange >= 0 ? "Up" : "Down"} {fmtGBP(Math.abs(periodChange))} over this period</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card xl:sticky xl:top-6">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-white"><Target className="h-4 w-4 text-zinc-500" />{goal && !editing ? "Your goal" : goal ? "Edit goal" : "Set a goal"}</CardTitle>
              <CardDescription className="mt-1">{goal && !editing ? "Make your next milestone tangible." : "Give your portfolio a target to work toward."}</CardDescription>
            </div>
            {goal && !editing && <Button variant="ghost" size="icon-xs" className="text-zinc-500 hover:text-white" onClick={() => { setEditing(true); setError(""); }} aria-label="Edit goal"><Pencil className="h-3.5 w-3.5" /></Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {goal && !editing ? (
            <>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-sm font-medium text-white">{goal.name}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div><p className="text-xs text-zinc-500">Target amount</p><p className="mt-1 text-xl font-semibold tracking-tight text-white">{fmtGBP(goal.targetValue)}</p></div>
                  <div className="text-right"><p className="text-xs text-zinc-500">Target date</p><p className="mt-1 text-sm font-medium text-zinc-200">{new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(dateFormat)}</p></div>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                <p className="text-xs font-medium text-zinc-300">A simple pace to aim for</p>
                <p className="text-sm leading-relaxed text-zinc-500">{remaining > 0 ? `Adding about ${fmtGBP(monthlyPace)} to your portfolio each month would close the gap by your target date, before any investment returns.` : "You have reached your target. Set a new milestone whenever you are ready."}</p>
              </div>
              <Button variant="ghost" className="w-full justify-center text-zinc-500 hover:text-red-300" onClick={() => void remove()} disabled={deleting}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />{deleting ? "Removing…" : "Remove goal"}
              </Button>
            </>
          ) : (
            <form className="space-y-3.5" onSubmit={(event) => void save(event)}>
              <div className="space-y-1.5"><Label htmlFor="goal-name">Goal name</Label><Input id="goal-name" value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder="e.g. House deposit" required minLength={2} /></div>
              <div className="space-y-1.5"><Label htmlFor="goal-value">Target amount (£)</Label><Input id="goal-value" type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} placeholder="50,000" required /></div>
              <div className="space-y-1.5"><Label htmlFor="goal-date">Target date</Label><Input id="goal-date" type="date" min={todayISODate()} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-xs leading-relaxed text-zinc-500">Track how your portfolio moves toward this amount. Your progress history is based on saved portfolio snapshots.</div>
              <Button className="w-full" type="submit" disabled={saving}>{saving ? "Saving…" : goal ? "Save changes" : "Set portfolio goal"}</Button>
              {goal && <Button variant="ghost" className="w-full" type="button" onClick={() => { setEditing(false); setName(goal.name); setTargetValue(String(goal.targetValue)); setTargetDate(goal.targetDate); setError(""); }}>Cancel</Button>}
            </form>
          )}
          {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 text-zinc-500"><span className="text-xs">{label}</span>{icon}</div>
        <p className="mt-2 truncate text-xl font-semibold tracking-tight text-white" title={value}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-zinc-600" title={detail}>{detail}</p>
      </CardContent>
    </Card>
  );
}
