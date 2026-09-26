"use client";

import { useEffect, useState } from "react";
import { Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtGBP } from "@/lib/format";

type Goal = { id: string; name: string; targetValue: number; targetDate: string };

export function GoalPanel({ currentValue, dateFormat }: { currentValue: number; dateFormat: string }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [name, setName] = useState("Portfolio goal");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/goals").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load goal");
      const first = (Array.isArray(data) ? data[0] : null) as Goal | null;
      if (first) { setGoal(first); setName(first.name); setTargetValue(String(first.targetValue)); setTargetDate(first.targetDate); }
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load goal"));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goal?.id, name, targetValue: Number(targetValue), targetDate }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save goal");
      setGoal({ id: data.id, name: name.trim(), targetValue: Number(targetValue), targetDate });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!goal) return;
    const response = await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" });
    if (!response.ok) { setError("Could not delete goal"); return; }
    setGoal(null); setTargetValue(""); setTargetDate(""); setName("Portfolio goal");
  };

  const target = Number(targetValue);
  const progress = target > 0 ? Math.min(100, currentValue / target * 100) : 0;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-white"><Target className="w-4 h-4 text-zinc-500" /> Goal</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {goal ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div><div className="text-sm font-medium text-white">{goal.name}</div><div className="text-xs text-zinc-500">Target {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString(dateFormat)}</div></div>
              <Button variant="ghost" size="icon-xs" className="text-zinc-600 hover:text-red-400" onClick={() => void remove()} aria-label="Delete goal"><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="flex items-baseline justify-between"><span className="text-2xl font-bold text-white">{fmtGBP(currentValue)}</span><span className="text-xs text-zinc-500">of {fmtGBP(goal.targetValue)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="flex justify-between text-xs text-zinc-500"><span>{progress.toFixed(1)}% reached</span><span>{fmtGBP(Math.max(0, goal.targetValue - currentValue))} remaining</span></div>
          </>
        ) : (
          <form className="space-y-3" onSubmit={(event) => void save(event)}>
            <div className="space-y-1.5"><Label htmlFor="goal-name">Goal name</Label><Input id="goal-name" value={name} maxLength={64} onChange={(event) => setName(event.target.value)} required minLength={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="goal-value">Target (£)</Label><Input id="goal-value" type="number" min="1" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="goal-date">Target date</Label><Input id="goal-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></div>
            </div>
            <Button className="w-full" type="submit" disabled={saving}>{saving ? "Saving…" : "Set portfolio goal"}</Button>
          </form>
        )}
        {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      </CardContent>
    </Card>
  );
}
