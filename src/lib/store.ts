"use client";
import { useEffect, useState, useCallback } from "react";
export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate: string; exchange?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; userId?: string | null; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId?: string | null; providerId?: string | null; color?: string | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; color?: string | null; userId?: string; createdAt?: number };
export type Provider = { id: string; name: string; color?: string | null; accountId: string; userId?: string; createdAt?: number };
export type UserSettings = { userId: string; currency: string; dateFormat: string; defaultRange: string; showTradeMarkers: number };
export type Snapshot = { date: string; value: number };
export type SnapResponse = { total: Snapshot[]; byPortfolio: Record<string, { name: string; data: Snapshot[] }> };
export type Transaction = { id: string; userId?: string; portfolioId: string; holdingId?: string | null; symbol: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date: string; note?: string | null; createdAt: number };

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
  const rename = async (id: string, name: string, color?: string | null) => {
    const payload: any = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  };
  const setColor = async (id: string, color: string | null) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ id, color }) });
    await refresh();
  };
  return { accounts, ready, create, remove, rename, setColor, refresh, setAccounts };
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/providers");
      setProviders(Array.isArray(data) ? data : []);
    } catch { setProviders([]); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const create = async (name: string, accountId: string, color?: string | null) => {
    const r = await api("/api/providers", { method: "POST", body: JSON.stringify({ name, accountId, color: color ?? null }) });
    await refresh();
    return r;
  };
  const remove = async (id: string) => {
    await fetch(`/api/providers?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  const rename = async (id: string, name: string, color?: string | null) => {
    const payload: any = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/providers", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  };
  const setColor = async (id: string, color: string | null) => {
    await api("/api/providers", { method: "POST", body: JSON.stringify({ id, color }) });
    await refresh();
  };
  return { providers, ready, create, remove, rename, setColor, refresh, setProviders };
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

  const create = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ name, type, accountId: accountId ?? null, providerId: providerId ?? null }) });
    await refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  const move = async (id: string, accountId: string | null, providerId?: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ id, accountId, providerId: providerId ?? null }) });
    await refresh();
  };
  const setColor = async (id: string, color: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ id, color }) });
    await refresh();
  };
  const upsertHolding = async (targetId: string, h: Omit<Holding, "id"> & { id?: string } & { portfolioId?: string | null; providerId?: string | null; accountId?: string | null }, kind: "portfolio" | "provider" | "account" = "portfolio") => {
    const body: any = { ...h, id: h.id };
    if (kind === "portfolio") body.portfolioId = targetId;
    else if (kind === "provider") body.providerId = targetId;
    else body.accountId = targetId;
    if (h.portfolioId !== undefined) body.portfolioId = h.portfolioId;
    if ((h as any).providerId !== undefined) body.providerId = (h as any).providerId;
    if ((h as any).accountId !== undefined) body.accountId = (h as any).accountId;
    await api("/api/holdings", { method: "POST", body: JSON.stringify(body) });
    await refresh();
  };
  const deleteHolding = async (_targetId: string, holdingId: string) => {
    await fetch(`/api/holdings?id=${holdingId}`, { method: "DELETE" });
    await refresh();
  };
  const deleteHoldingDirect = async (holdingId: string) => {
    await fetch(`/api/holdings?id=${holdingId}`, { method: "DELETE" });
    await refresh();
  };
  const updatePrices = async (prices: Record<string, { price: number; currency: string }>) => {
    await api("/api/holdings", { method: "PATCH", body: JSON.stringify({ symbols: prices }) });
    await refresh();
  };
  return { portfolios, ready, create, remove, move, setColor, upsertHolding, deleteHolding, deleteHoldingDirect, updatePrices, refresh, setPortfolios };
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

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/api/holdings");
      setHoldings(Array.isArray(data) ? data : []);
    } catch { setHoldings([]); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { holdings, ready, refresh };
}

export function useTransactions(portfolioId?: string | null, symbol?: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (portfolioId) qs.set("portfolioId", portfolioId);
      if (symbol) qs.set("symbol", symbol);
      const q = qs.toString() ? `?${qs}` : "";
      const data = await api(`/api/transactions${q}`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch { setTransactions([]); }
    setReady(true);
  }, [portfolioId, symbol]);
  useEffect(() => { refresh(); }, [refresh]);
  const create = async (payload: { portfolioId: string; holdingId?: string | null; symbol?: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date?: string; note?: string }) => {
    await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  return { transactions, ready, refresh, create, remove };
}
