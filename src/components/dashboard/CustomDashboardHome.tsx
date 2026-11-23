import Link from "next/link";
import { ArrowUpRight, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardWidgetDefinition } from "@/lib/dashboards";
import type { SavedDashboard } from "@/lib/store";

type CustomDashboardHomeProps = {
  dashboards: SavedDashboard[];
  ready: boolean;
  error?: string | null;
  onCreate: () => void;
  onEdit: (dashboard: SavedDashboard) => void;
  onDelete: (dashboard: SavedDashboard) => void;
};

export function CustomDashboardHome({ dashboards, ready, error, onCreate, onEdit, onDelete }: CustomDashboardHomeProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboards"
        description="Build your own views from the widgets that matter to you. Every dashboard lives in the sidebar."
        actions={
          <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" /> New dashboard
          </Button>
        }
      />

      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}

      {!ready ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((index) => <Skeleton key={index} className="h-44 rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : dashboards.length === 0 ? (
        <div className="panel grid place-items-center px-6 py-16 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
              <LayoutGrid className="h-5 w-5 text-zinc-300" />
            </span>
            <h2 className="mt-4 text-sm font-medium text-white">No dashboards yet</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Choose the cards you want — value, charts, allocation, goals, trades — and keep the view in the sidebar.
            </p>
            <Button size="sm" className="mt-4 bg-white text-black hover:bg-zinc-100" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" /> Create dashboard
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((dashboard) => {
            const visibleWidgets = dashboard.widgets.slice(0, 4);
            const hiddenCount = dashboard.widgets.length - visibleWidgets.length;
            return (
              <article key={dashboard.id} className="panel group flex min-h-44 flex-col overflow-hidden">
                <Link
                  href={`/dashboards/${dashboard.id}`}
                  className="flex min-w-0 flex-1 flex-col p-4 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dashboard.color ?? "#71717a" }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{dashboard.name}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300" />
                  </span>
                  <span className="mt-1 text-[11px] text-zinc-400">{dashboard.widgets.length} {dashboard.widgets.length === 1 ? "widget" : "widgets"}</span>
                  <span className="mt-auto flex flex-wrap gap-1 pt-5">
                    {visibleWidgets.map((widget) => (
                      <span key={widget.id} className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {dashboardWidgetDefinition(widget.type).label}
                      </span>
                    ))}
                    {hiddenCount > 0 && <span className="px-1 py-0.5 text-[10px] text-zinc-500">+{hiddenCount}</span>}
                  </span>
                </Link>
                <div className="flex items-center justify-end gap-1 border-t border-white/[0.05] px-2 py-1.5">
                  <Button variant="ghost" size="xs" className="h-7 text-[11px] text-zinc-400 hover:text-white" onClick={() => onEdit(dashboard)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="xs" className="h-7 text-[11px] text-zinc-400 hover:text-red-300" onClick={() => onDelete(dashboard)}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={onCreate}
            className="group grid min-h-44 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-4 text-center transition-colors hover:border-white/20 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          >
            <span>
              <span className={`${buttonVariants({ variant: "ghost", size: "icon" })} mx-auto border border-white/10 text-zinc-400 group-hover:text-white`}>
                <Plus className="h-4 w-4" />
              </span>
              <span className="mt-2 block text-xs font-medium text-zinc-300">New dashboard</span>
              <span className="mt-0.5 block text-[11px] text-zinc-500">Pick widgets and arrange them</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
