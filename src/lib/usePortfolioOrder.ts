"use client";
import { useState, useCallback } from "react";
import type { Portfolio } from "@/lib/store";

const STORAGE_KEY = "olantis_portfolio_order";

function readOrder(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") || {}; } catch { return {}; }
}

function writeOrder(order: Record<string, string[]>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)); } catch {}
}

export function usePortfolioOrder() {
  const [order, setOrder] = useState<Record<string, string[]>>(() => readOrder());

  const reorder = useCallback((groupKey: string, fromIndex: number, toIndex: number) => {
    setOrder(prev => {
      const ids = [...(prev[groupKey] ?? [])];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      const next = { ...prev, [groupKey]: ids };
      writeOrder(next);
      return next;
    });
  }, []);

  const applyOrder = useCallback((groupKey: string, list: Portfolio[]): Portfolio[] => {
    const ids = order[groupKey];
    if (!ids?.length) return list;
    const byId = new Map(list.map(p => [p.id, p]));
    const sorted: Portfolio[] = [];
    for (const id of ids) { const p = byId.get(id); if (p) sorted.push(p); }
    for (const p of list) { if (!sorted.includes(p)) sorted.push(p); }
    return sorted;
  }, [order]);

  return { reorder, applyOrder };
}
