"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtGBP, filterByRange, todayISODate, chartDateLabel } from "@/lib/format";
import { usePalette } from "@/lib/palette";
import { useWorkspaceBootstrap, type Goal, type Snapshot } from "@/lib/store";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const SUB = "mt-2 text-[11px] text-zinc-600";
const EMPTY_GOALS: Goal[] = [];
const FALLBACK_COLOR = "#34d399";

type GoalDraft = { id: string | null; name: string; targetValue: string; targetDate: string };
type GoalChartRow = { date: string; value: number; [key: string]: number | string };
type GoalStats = { progress: number; remaining: number; daysLeft: number; monthlyPace: number; reached: boolean };

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.name.localeCompare(b.name));
}

function defaultTargetDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function GoalPanel({ currentValue, history, dateFormat }: { currentValue: number; history: Snapshot[]; dateFormat: string }) {
  // Goals ship with the workspace bootstrap when available, so the first paint
  // already has their real shape. Multiple goals are supported: every goal is a
  // portfolio-value milestone, tracked against the same total.
  const boot = useWorkspaceBootstrap();
  const serverGoals = boot?.goals;
  const palette = usePalette();
  const [goalsOverride, setGoalsOverride] = useState<Goal[] | null>(null);
  // Derived, not copied: a save/remove replaces the bootstrapped list, and the
  // rest of the page follows it, so there is no state to re-sync.
  const goals = goalsOverride ?? serverGoals ?? EMPTY_GOALS;
  const sortedGoals = useMemo(() => sortGoals(goals), [goals]);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [range, setRange] = useState<ChartRange>("MAX");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    // Bootstrap already carried the goals (or proved there aren't any).
    if (serverGoals !== undefined) return;
    let cancelled = false;
    void fetch("/api/goals").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load goals");
      return (Array.isArray(data) ? data : []) as Goal[];
    }).then((list) => {
      // Keep any goal saved while the fallback read was in flight.
      if (!cancelled) setGoalsOverride((current) => current ?? list);
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load goals");
    });
    return () => { cancelled = true; };
  }, [serverGoals]);

  const goalColor = (index: number) => palette[index % palette.length]?.value ?? FALLBACK_COLOR;

  const goalStats = (goal: Goal): GoalStats => {
    const progress = goal.targetValue > 0 ? currentValue / goal.targetValue * 100 : 0;
    const remaining = Math.max(0, goal.targetValue - currentValue);
    const daysLeft = Math.max(0, Math.ceil((new Date(`${goal.targetDate}T00:00:00`).getTime() - new Date(`${todayISODate()}T00:00:00`).getTime()) / 86400000));
    const monthsLeft = Math.max(daysLeft / 30.4375, 1 / 30.4375);
    return { progress, remaining, daysLeft, monthlyPace: remaining / monthsLeft, reached: remaining === 0 };
  };

  // The metric band follows the most urgent goal that is still open, so adding
  // a long-range goal never hides the next milestone.
  const focusGoal = sortedGoals.find((goal) => currentValue < goal.targetValue) ?? sortedGoals[sortedGoals.length - 1] ?? null;
  const focusStats = focusGoal ? goalStats(focusGoal) : null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id ?? undefined,
          name: draft.name.trim(),
          targetValue: Number(draft.targetValue),
          targetDate: draft.targetDate,
        }),
      });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Could not save goal");
      const saved: Goal = { id: data.id, name: draft.name.trim(), targetValue: Number(draft.targetValue), targetDate: draft.targetDate };
      setGoalsOverride((current) => {
        const list = current ?? serverGoals ?? EMPTY_GOALS;
        return draft.id ? list.map((goal) => goal.id === saved.id ? saved : goal) : [...list, saved];
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (goal: Goal) => {
    setDeletingId(goal.id);
    setError("");
    try {
      const response = await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete goal");
      setGoalsOverride((current) => (current ?? serverGoals ?? EMPTY_GOALS).filter((item) => item.id !== goal.id));
      if (draft?.id === goal.id) setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const startAdd = () => {
    setDraft({ id: null, name: "", targetValue: "", targetDate: defaultTargetDate() });
    setError("");
  };

  const startEdit = (goal: Goal) => {
    setDraft({ id: goal.id, name: goal.name, targetValue: String(goal.targetValue), targetDate: goal.targetDate });
    setError("");
  };

  const allHistory = useMemo(() => {
    const byDate = new Map(history.map((row) => [row.date, row.value]));
    if (currentValue > 0) byDate.set(todayISODate(), currentValue);
    return Array.from(byDate, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, currentValue]);
  const chartRows = useMemo(() => filterByRange(allHistory, range).map((row) => {
    const entry: GoalChartRow = { date: row.date, value: row.value };
    for (const goal of sortedGoals) entry[goal.id] = goal.targetValue > 0 ? row.value / goal.targetValue * 100 : 0;
    return entry;
  }), [allHistory, range, sortedGoals]);
  const chartMax = useMemo(() => {
    if (!sortedGoals.length) return 100;
    let max = 100;
    for (const row of chartRows) {
      for (const goal of sortedGoals) max = Math.max(max, Number(row[goal.id] ?? 0));
    }
    return Math.ceil(max / 10) * 10;
  }, [chartRows, sortedGoals]);

  const startRow = chartRows[0];
  const endRow = chartRows[chartRows.length - 1];
  const periodChange = startRow && endRow && chartRows.length > 1 ? endRow.value - startRow.value : null;
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateFormat, { day: "numeric", month: "short", year: "numeric" });
  const rangeLabel = range === "MAX" ? "All" : range;
  const changeLabel = periodChange === null ? "—" : `${periodChange >= 0 ? "+" : "−"}${fmtGBP(Math.abs(periodChange))}`;
  const changeTone = periodChange === null ? "text-zinc-600" : periodChange >= 0 ? "text-emerald-400" : "text-red-400";
  const editingNew = draft?.id === null;

  return (
    <div className="space-y-8">
      <div className={`grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:gap-0 lg:py-7 ${focusGoal ? "sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]" : "sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]"}`}>
        <div className={`col-span-2 min-w-0 lg:col-span-1 lg:pr-8 ${focusGoal ? "sm:col-span-3" : "sm:col-span-2"}`}>
          <p className={`${LABEL} truncate`} title={focusGoal ? focusGoal.name : undefined}>{focusGoal ? focusGoal.name : "Portfolio value"}</p>
          <p className="mt-2 truncate text-[38px] font-semibold leading-none tracking-tight tabular-nums text-white sm:text-[42px]">
            {focusGoal && focusStats ? `${Math.min(focusStats.progress, 999).toFixed(1)}%` : fmtGBP(currentValue)}
          </p>
          {focusGoal && focusStats && (
            <div
              className="mt-3 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/[0.07]"
              role="progressbar"
              aria-label={`${focusGoal.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(focusStats.progress, 100)}
            >
              <div className="h-full rounded-full bg-emerald-400/80 transition-all" style={{ width: `${Math.min(focusStats.progress, 100)}%` }} />
            </div>
          )}
          <p className={SUB}>
            {focusGoal
              ? <>{fmtGBP(currentValue)} of {fmtGBP(focusGoal.targetValue)}{goals.length > 1 ? ` · ${goals.length} goals` : ""}</>
              : "As of today"}
          </p>
        </div>

        {focusGoal && focusStats ? (
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
              value={focusStats.reached ? "Reached" : fmtGBP(focusStats.remaining)}
              tone={focusStats.reached ? "text-emerald-400" : "text-white"}
              sub={focusStats.reached ? "Target met" : `By ${shortDate(focusGoal.targetDate)}`}
            />
            <Metric
              className="col-span-2 sm:col-span-1 lg:border-l lg:border-white/[0.06] lg:pl-8"
              label="Monthly pace"
              value={focusStats.reached || focusStats.daysLeft === 0 ? "—" : fmtGBP(focusStats.monthlyPace)}
              tone={focusStats.reached || focusStats.daysLeft === 0 ? "text-zinc-600" : "text-white"}
              sub={focusStats.reached
                ? "Complete"
                : focusStats.daysLeft === 0
                  ? focusGoal.targetDate < todayISODate() ? "Target date passed" : "Due today"
                  : `${focusStats.daysLeft} days left`}
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

      <Card className="panel">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="min-w-0 truncate text-sm font-medium text-white">{focusGoal ? "Progress over time" : "Value over time"}</CardTitle>
          <ChartRangeSelector range={range} onRangeChange={setRange} maxLabel="All" segmented />
        </CardHeader>
        <CardContent>
          {sortedGoals.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {sortedGoals.map((goal, index) => {
                const color = goalColor(index);
                const progress = goal.targetValue > 0 ? currentValue / goal.targetValue * 100 : 0;
                return (
                  <span key={goal.id} className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="max-w-[220px] truncate text-[11px] text-zinc-400" title={goal.name}>{goal.name}</span>
                    <span className="text-[11px] tabular-nums text-zinc-600">{progress.toFixed(1)}%</span>
                  </span>
                );
              })}
            </div>
          )}
          {chartRows.length > 0 ? (
            <>
              <div className="h-[320px] w-full sm:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows} margin={{ top: 12, right: 18, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goalProgressFill0" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sortedGoals.length ? goalColor(0) : FALLBACK_COLOR} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={sortedGoals.length ? goalColor(0) : FALLBACK_COLOR} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tickFormatter={chartDateLabel} minTickGap={28} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={sortedGoals.length ? [0, chartMax] : ["auto", "auto"]}
                      tickFormatter={(value: number) => sortedGoals.length ? `${value}%` : fmtGBP(value)}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={sortedGoals.length ? 48 : 64}
                    />
                    <Tooltip
                      labelFormatter={(label) => shortDate(String(label))}
                      formatter={(value, name) => sortedGoals.length
                        ? [`${Number(value).toFixed(1)}%`, String(name)]
                        : [fmtGBP(Number(value)), "Portfolio value"]}
                      contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }}
                    />
                    {sortedGoals.length > 0 && <ReferenceLine y={100} stroke="#a1a1aa" strokeDasharray="5 5" label={{ value: "Target", fill: "#a1a1aa", fontSize: 11, position: "insideTopRight" }} />}
                    {sortedGoals.length > 0 ? sortedGoals.map((goal, index) => {
                      const color = goalColor(index);
                      return (
                        <Area
                          key={goal.id}
                          type="monotone"
                          dataKey={goal.id}
                          name={goal.name}
                          stroke={color}
                          fill={sortedGoals.length === 1 ? "url(#goalProgressFill0)" : color}
                          fillOpacity={sortedGoals.length === 1 ? 1 : 0.06}
                          strokeWidth={2.5}
                          dot={chartRows.length === 1 ? { r: 4, fill: color } : false}
                          activeDot={{ r: 5, fill: color, stroke: "#09090b", strokeWidth: 2 }}
                        />
                      );
                    }) : (
                      <Area type="monotone" dataKey="value" name="Portfolio value" stroke={FALLBACK_COLOR} fill="url(#goalProgressFill0)" strokeWidth={2.5} dot={chartRows.length === 1 ? { r: 4, fill: FALLBACK_COLOR } : false} activeDot={{ r: 5, fill: FALLBACK_COLOR, stroke: "#09090b", strokeWidth: 2 }} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {chartRows.length === 1 && (
                <p className="mt-3 text-[11px] text-zinc-600">First snapshot saved. Progress will build from here.</p>
              )}
            </>
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-center sm:h-[400px]">
              <TrendingUp className="h-5 w-5 text-zinc-600" />
              <p className="text-sm text-zinc-500">History builds as your portfolio updates.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="goals-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
          <div className="flex items-baseline gap-2.5">
            <h2 id="goals-heading" className="text-sm font-medium text-white">Goal targets</h2>
            <span className="text-[11px] text-zinc-600">
              {sortedGoals.length ? `${sortedGoals.length} ${sortedGoals.length === 1 ? "goal" : "goals"}` : "None set"}
            </span>
          </div>
          {!draft && sortedGoals.length > 0 && (
            <Button variant="ghost" size="sm" className="rounded-full px-3 text-zinc-400 hover:bg-white/[0.05] hover:text-white" onClick={startAdd}>
              <Plus className="h-3.5 w-3.5" /> Add goal
            </Button>
          )}
        </div>

        {editingNew && draft && (
          <GoalEditor draft={draft} saving={saving} onChange={setDraft} onSubmit={(event) => void save(event)} onCancel={() => { setDraft(null); setError(""); }} />
        )}

        {sortedGoals.length === 0 && !editingNew ? (
          <div className="flex flex-col items-start gap-3 border-b border-white/[0.06] py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-zinc-400">No goals yet.</p>
              <p className="mt-1 text-xs text-zinc-600">Set one or more targets and track progress toward each.</p>
            </div>
            <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={startAdd}>
              <Plus className="h-3.5 w-3.5" /> Add a goal
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {sortedGoals.map((goal, index) => {
              if (draft?.id === goal.id) {
                return (
                  <li key={goal.id}>
                    <GoalEditor draft={draft} saving={saving} onChange={setDraft} onSubmit={(event) => void save(event)} onCancel={() => { setDraft(null); setError(""); }} />
                  </li>
                );
              }
              const color = goalColor(index);
              const stats = goalStats(goal);
              return (
                <li key={goal.id} className="grid gap-x-6 gap-y-3 py-4 lg:grid-cols-[minmax(0,1fr)_120px_140px_110px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <p className="truncate text-sm text-white" title={goal.name}>{goal.name}</p>
                      <span className={`ml-auto shrink-0 text-xs tabular-nums ${stats.reached ? "text-emerald-400" : "text-zinc-500"}`}>{Math.min(stats.progress, 999).toFixed(1)}%</span>
                    </div>
                    <div
                      className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]"
                      role="progressbar"
                      aria-label={`${goal.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(stats.progress, 100)}
                    >
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(stats.progress, 100)}%`, backgroundColor: color, opacity: 0.8 }} />
                    </div>
                    <p className="mt-2 text-[11px] tabular-nums text-zinc-600">
                      {fmtGBP(currentValue)} of {fmtGBP(goal.targetValue)}
                      {stats.reached ? " · Reached" : stats.daysLeft === 0 ? " · Target date passed" : ` · ${stats.daysLeft} days left`}
                    </p>
                  </div>
                  <div className="hidden lg:block">
                    <p className={LABEL}>Target</p>
                    <p className="mt-1 text-sm tabular-nums text-zinc-300">{fmtGBP(goal.targetValue)}</p>
                  </div>
                  <div>
                    <p className={LABEL}>By</p>
                    <p className="mt-1 text-sm text-zinc-300">{shortDate(goal.targetDate)}</p>
                  </div>
                  <div className="hidden lg:block">
                    <p className={LABEL}>Pace</p>
                    <p className={`mt-1 text-sm tabular-nums ${stats.reached ? "text-emerald-400" : "text-zinc-300"}`}>{stats.reached ? "Reached" : stats.daysLeft === 0 ? "—" : `${fmtGBP(stats.monthlyPace)}/mo`}</p>
                  </div>
                  <div className="flex items-center gap-1 lg:justify-end">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${goal.name}`} title="Edit goal" className="text-zinc-500 hover:bg-white/[0.05] hover:text-white" onClick={() => startEdit(goal)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${goal.name}`} title="Remove goal" className="text-zinc-600 hover:bg-white/[0.05] hover:text-red-300" onClick={() => void remove(goal)} disabled={deletingId === goal.id}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] leading-relaxed text-zinc-600">Progress is measured against your total portfolio value. Monthly pace is a straight-line estimate and excludes investment returns.</p>
        {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      </section>
    </div>
  );
}

function GoalEditor({ draft, saving, onChange, onSubmit, onCancel }: {
  draft: GoalDraft;
  saving: boolean;
  onChange: (draft: GoalDraft) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const fieldId = draft.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] xl:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`goal-name-${fieldId}`}>Goal name</Label>
          <Input id={`goal-name-${fieldId}`} value={draft.name} maxLength={64} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="e.g. House deposit" required minLength={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`goal-value-${fieldId}`}>Target amount (£)</Label>
          <Input id={`goal-value-${fieldId}`} type="number" min="1" step="any" value={draft.targetValue} onChange={(event) => onChange({ ...draft, targetValue: event.target.value })} placeholder="50,000" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`goal-date-${fieldId}`}>Target date</Label>
          <Input id={`goal-date-${fieldId}`} type="date" min={todayISODate()} value={draft.targetDate} onChange={(event) => onChange({ ...draft, targetDate: event.target.value })} required />
        </div>
        <div className="flex gap-2 md:col-span-2 xl:col-span-1">
          <Button className="flex-1 xl:flex-none" type="submit" disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add goal"}</Button>
          <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
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
