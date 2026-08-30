"use client";
import { useEffect, useState, useCallback } from "react";
export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate: string; exchange?: string; portfolioId?: string; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId?: string | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; userId?: string; createdAt?: number };
export type Snapshot = { date: string; value: number };
export type SnapResponse = { total: Snapshot[]; byPortfolio: Record<string, { name: string; data: Snapshot[] }> };

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/accounts");
      setAccounts(data);
    } catch { setAccounts([]); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const create = async (name: string) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  const rename = async (id: string, name: string) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ id, name }) });
    await refresh();
  };
  return { accounts, ready, create, remove, rename, refresh, setAccounts };
}

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/portfolios");
      setPortfolios(data);
    } catch { setPortfolios([]); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const create = async (name: string, type: "live" | "manual", accountId?: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ name, type, accountId: accountId ?? null }) });
    await refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  const move = async (id: string, accountId: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ id, accountId }) });
    await refresh();
  };
  const upsertHolding = async (portfolioId: string, h: Omit<Holding, "id"> & { id?: string }) => {
    await api("/api/holdings", { method: "POST", body: JSON.stringify({ ...h, portfolioId }) });
    await refresh();
  };
  const deleteHolding = async (_portfolioId: string, holdingId: string) => {
    await fetch(`/api/holdings?id=${holdingId}`, { method: "DELETE" });
    await refresh();
  };
  const updatePrices = async (prices: Record<string, { price: number; currency: string }>) => {
    await api("/api/holdings", { method: "PATCH", body: JSON.stringify({ symbols: prices }) });
    await refresh();
  };
  return { portfolios, ready, create, remove, move, upsertHolding, deleteHolding, updatePrices, refresh, setPortfolios };
}

export function useSnapshots(portfolios: Portfolio[]) {
  const [data, setData] = useState<SnapResponse>({ total: [], byPortfolio: {} });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshots");
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j)) setData({ total: j, byPortfolio: {} });
      else setData(j);
    } catch {}
  }, []);
  useEffect(() => { refresh(); }, [refresh, portfolios.length]);
  const totalValue = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h) => a + h.shares * h.currentPrice, 0), 0);
  useEffect(() => {
    if (!portfolios.length || totalValue === 0) return;
    const isDemo = typeof document !== "undefined" && document.cookie.includes("olantis_demo=1");
    if (isDemo) return;
    fetch("/api/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: totalValue }) }).then(() => refresh()).catch(() => {});
  }, [totalValue]);
  return { snapshots: data.total, byPortfolio: data.byPortfolio, refresh };
}
