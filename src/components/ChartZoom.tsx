"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReferenceArea } from "recharts";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ZoomRange<T> = { data: T[]; i1: number; i2: number } | null;
type DragState<T> = { data: T[]; base: number; a: number; b: number } | null;
type ChartMouseEvent = { activeTooltipIndex?: unknown; activeLabel?: string | number | undefined };

function indexFromEvent(e: ChartMouseEvent | undefined, rows: ReadonlyArray<{ date: string }>): number {
  const i = e?.activeTooltipIndex;
  if (typeof i === "number" && i >= 0 && i < rows.length) return i;
  const label = e?.activeLabel;
  if (label != null) {
    const idx = rows.findIndex((r) => r.date === String(label));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Drag-to-zoom for a category (date) X axis. Drag across the chart to size a period;
 * releasing commits the zoom (a plain click leaves it alone). Zoom and drag are tagged
 * with the series they were taken from, so changing range/portfolio/data invalidates
 * them without an extra render pass.
 */
export function useChartZoom<T extends { date: string }>(data: T[]) {
  const [zoom, setZoom] = useState<ZoomRange<T>>(null);
  const [drag, setDrag] = useState<DragState<T>>(null);
  const dragRef = useRef<DragState<T>>(null);

  const zoomed = zoom && zoom.data === data ? zoom : null;
  const base = zoomed ? zoomed.i1 : 0;
  const visible = useMemo(() => (zoomed ? data.slice(zoomed.i1, zoomed.i2 + 1) : data), [data, zoomed]);
  const activeDrag = drag && drag.data === data ? drag : null;

  // Releasing the pointer anywhere commits the selection, even outside the chart.
  useEffect(() => {
    const commit = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || d.data !== data) return;
      const a = Math.min(d.a, d.b);
      const b = Math.max(d.a, d.b);
      if (b - a < 1) return;
      setZoom({ data, i1: d.base + a, i2: d.base + b });
    };
    window.addEventListener("mouseup", commit);
    return () => window.removeEventListener("mouseup", commit);
  }, [data]);

  const onMouseDown = (e: ChartMouseEvent) => {
    const i = indexFromEvent(e, visible);
    if (i < 0) return;
    const next: DragState<T> = { data, base, a: i, b: i };
    dragRef.current = next;
    setDrag(next);
  };
  const onMouseMove = (e: ChartMouseEvent) => {
    const d = dragRef.current;
    if (!d || d.data !== data) return;
    const i = indexFromEvent(e, visible);
    if (i < 0 || i === d.b) return;
    const next: DragState<T> = { ...d, b: i };
    dragRef.current = next;
    setDrag(next);
  };

  const reset = () => {
    dragRef.current = null;
    setDrag(null);
    setZoom(null);
  };

  const selectionLabels = useMemo<[string, string] | null>(() => {
    if (!activeDrag || !visible.length) return null;
    const a = Math.min(activeDrag.a, activeDrag.b);
    const b = Math.max(activeDrag.a, activeDrag.b);
    if (a < 0 || b >= visible.length) return null;
    return [visible[a].date, visible[b].date];
  }, [activeDrag, visible]);

  return {
    visible,
    zoomed: zoomed !== null,
    reset,
    selectionLabels,
    chartProps: { onMouseDown, onMouseMove },
  };
}

/** Shaded band over the dragged region while a zoom selection is in progress. */
export function ZoomSelectionArea({ labels }: { labels: [string, string] | null }) {
  if (!labels) return null;
  return <ReferenceArea x1={labels[0]} x2={labels[1]} stroke="rgba(255,255,255,0.35)" fill="#ffffff" fillOpacity={0.08} />;
}

/** Shown only when the chart is not at its default period. */
export function ZoomResetButton({ onReset }: { onReset: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" onClick={onReset} title="Reset zoom" aria-label="Reset zoom" className="text-zinc-400 hover:text-white">
      <RotateCcw className="w-3.5 h-3.5" />
    </Button>
  );
}
