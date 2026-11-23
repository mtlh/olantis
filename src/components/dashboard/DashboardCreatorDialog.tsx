"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Columns2, GripVertical, Maximize2, Minus, Plus, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogActions } from "@/components/shared/DialogActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePalette } from "@/lib/palette";
import {
  DASHBOARD_NAME_MAX,
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_LIMIT,
  createDashboardWidget,
  dashboardWidgetDefinition,
  defaultDashboardWidgets,
  normalizeDashboardName,
  type DashboardWidget,
  type DashboardWidgetSize,
  type DashboardWidgetType,
} from "@/lib/dashboards";
import type { SavedDashboard } from "@/lib/store";
import { cn } from "@/lib/utils";

export type DashboardDraft = {
  name: string;
  color: string | null;
  widgets: DashboardWidget[];
};

type DashboardCreatorDialogProps = {
  /** Null creates a new dashboard; a row edits that one. Mount with a key per target. */
  dashboard: SavedDashboard | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: DashboardDraft) => Promise<void>;
};

const SIZE_OPTIONS: Array<{ value: DashboardWidgetSize; label: string; icon: LucideIcon }> = [
  { value: "half", label: "Half", icon: Columns2 },
  { value: "full", label: "Full", icon: Maximize2 },
];

export function DashboardCreatorDialog({ dashboard, onOpenChange, onSubmit }: DashboardCreatorDialogProps) {
  const palette = usePalette();
  const [name, setName] = useState(dashboard?.name ?? "");
  const [color, setColor] = useState<string | null>(dashboard?.color ?? palette.at(0)?.value ?? null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => dashboard?.widgets ?? defaultDashboardWidgets());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedTypes = new Set(widgets.map((widget) => widget.type));
  const atLimit = widgets.length >= DASHBOARD_WIDGET_LIMIT;

  const toggleWidget = (type: DashboardWidgetType) => {
    setError("");
    setWidgets((current) => current.some((widget) => widget.type === type)
      ? current.filter((widget) => widget.type !== type)
      : [...current, createDashboardWidget(type)]);
  };

  const moveWidget = (index: number, delta: number) => {
    setWidgets((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const resizeWidget = (id: string, size: DashboardWidgetSize) => {
    setWidgets((current) => current.map((widget) => (widget.id === id ? { ...widget, size } : widget)));
  };

  const removeWidget = (id: string) => {
    setWidgets((current) => current.filter((widget) => widget.id !== id));
  };

  const submit = async () => {
    const normalized = normalizeDashboardName(name);
    if (!normalized) {
      setError(`Name must be 2–${DASHBOARD_NAME_MAX} characters`);
      return;
    }
    if (widgets.length === 0) {
      setError("Add at least one widget");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ name: normalized, color, widgets });
      onOpenChange(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dashboard ? "Edit dashboard" : "Create dashboard"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="dashboard-name">Name</Label>
              <Input
                id="dashboard-name"
                value={name}
                onChange={(event) => { setName(event.target.value); setError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
                placeholder="e.g. Monthly review, Retirement"
                maxLength={DASHBOARD_NAME_MAX}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <span className="block text-sm leading-none font-medium">Accent</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {palette.slice(0, 8).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setColor(option.value)}
                    aria-label={`Use ${option.label}`}
                    aria-pressed={color === option.value}
                    title={option.label}
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                      color === option.value ? "border-white/70" : "border-white/10",
                    )}
                    style={{ background: option.value }}
                  >
                    {color === option.value && <Check className="h-3.5 w-3.5 text-black/80" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="dashboard-library-heading" className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <h2 id="dashboard-library-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Widgets</h2>
                <span className="text-[11px] tabular-nums text-zinc-400">{selectedTypes.size}/{DASHBOARD_WIDGET_LIMIT}</span>
              </div>
              <div className="max-h-[340px] space-y-0.5 overflow-y-auto p-1.5">
                {DASHBOARD_WIDGETS.map((definition) => {
                  const active = selectedTypes.has(definition.type);
                  return (
                    <button
                      key={definition.type}
                      type="button"
                      onClick={() => toggleWidget(definition.type)}
                      disabled={!active && atLimit}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40",
                        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                        active ? "border-white bg-white text-black" : "border-white/20 text-transparent",
                      )}>
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-xs font-medium", active ? "text-white" : "text-zinc-200")}>{definition.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">{definition.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="dashboard-layout-heading" className="flex min-h-0 flex-col rounded-xl border border-white/[0.07] bg-white/[0.02]">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <h2 id="dashboard-layout-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Layout</h2>
                <span className="text-[11px] tabular-nums text-zinc-400">{widgets.length} placed</span>
              </div>
              {widgets.length === 0 ? (
                <div className="grid flex-1 place-items-center px-4 py-10 text-center">
                  <div>
                    <Plus className="mx-auto h-5 w-5 text-zinc-500" />
                    <p className="mt-2 text-xs text-zinc-400">Pick widgets on the left to build your dashboard.</p>
                  </div>
                </div>
              ) : (
                <ol className="max-h-[340px] space-y-1 overflow-y-auto p-1.5">
                  {widgets.map((widget, index) => {
                    const definition = dashboardWidgetDefinition(widget.type);
                    return (
                      <li key={widget.id} className="rounded-lg bg-white/[0.03] px-2 py-2">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">{definition.label}</span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="h-6 w-6 text-zinc-400 hover:text-white"
                              aria-label={`Move ${definition.label} up`}
                              disabled={index === 0}
                              onClick={() => moveWidget(index, -1)}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="h-6 w-6 text-zinc-400 hover:text-white"
                              aria-label={`Move ${definition.label} down`}
                              disabled={index === widgets.length - 1}
                              onClick={() => moveWidget(index, 1)}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="h-6 w-6 text-zinc-400 hover:text-red-300"
                              aria-label={`Remove ${definition.label}`}
                              onClick={() => removeWidget(widget.id)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 pl-5" role="group" aria-label={`${definition.label} width`}>
                          {SIZE_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const active = widget.size === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => resizeWidget(widget.id, option.value)}
                                aria-pressed={active}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
                                  active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
                                )}
                              >
                                <Icon className="h-2.5 w-2.5" />
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

          <DialogActions
            onCancel={() => onOpenChange(false)}
            onSubmit={() => void submit()}
            submitLabel={dashboard ? "Save dashboard" : "Create dashboard"}
            savingLabel={dashboard ? "Saving…" : "Creating…"}
            saving={saving}
            submitClassName="bg-white text-black hover:bg-zinc-100"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
