"use client";
import { useEffect, useState, useCallback, useRef } from "react";
export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate: string; exchange?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; userId?: string | null; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId: string | null; providerId: string | null; color: string | null; sortOrder?: number | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; color: string | null; sortOrder?: number | null; userId?: string; createdAt?: number };
export type Provider = { id: string; name: string; color: string | null; accountId: string; sortOrder?: number | null; userId?: string; createdAt?: number };
export type UserSettings = { userId: string; currency: string; dateFormat: string; defaultRange: string; showTradeMarkers: number };
export type Snapshot = { date: string; value: number };
export type SnapResponse = { total: Snapshot[]; byPortfolio: Record<string, { name: string; data: Snapshot[] }> };
export type Transaction = { id: string; userId?: string; portfolioId: string; holdingId?: string | null; symbol: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date: string; note?: string | null; createdAt: number };

type AccountPayload = { id: string; name?: string; color?: string | null };
type ProviderPayload = { id: string; name?: string; color?: string | null; accountId?: string };
type HoldingsBody = { id?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate?: string; exchange?: string };

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data: Account[] = await api("/api/accounts");
      setAccounts(data);
    } catch { setAccounts([]); }
    setReady(true);
  }, []);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh]);
  const create = async (name: string) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    await refresh();
  };
  const rename = async (id: string, name: string, color?: string | null) => {
    const payload: AccountPayload = { id, name };
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
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data: unknown = await api("/api/providers");
      setProviders(Array.isArray(data) ? (data as Provider[]) : []);
    } catch { setProviders([]); }
    setReady(true);
  }, []);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh]);
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
    const payload: ProviderPayload = { id, name };
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
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data: Portfolio[] = await api("/api/portfolios");
      setPortfolios(data);
    } catch { setPortfolios([]); }
    setReady(true);
  }, []);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh]);

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
    const body: HoldingsBody = { ...h, id: h.id };
    if (kind === "portfolio") body.portfolioId = targetId;
    else if (kind === "provider") body.providerId = targetId;
    else body.accountId = targetId;
    if (h.portfolioId !== undefined) body.portfolioId = h.portfolioId;
    if (h.providerId !== undefined) body.providerId = h.providerId;
    if (h.accountId !== undefined) body.accountId = h.accountId;
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

export function useSnapshots(portfolios: Portfolio[], directHoldings: Holding[] = []) {
  const [data, setData] = useState<SnapResponse>({ total: [], byPortfolio: {} });
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshots");
      if (!r.ok) return;
      const j: unknown = await r.json();
      if (Array.isArray(j)) setData({ total: j as Snapshot[], byPortfolio: {} });
      else setData(j as SnapResponse);
    } catch {}
  }, []);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh, portfolios.length]);
  const valGBP = (h: Holding) => { const v = h.shares * h.currentPrice; return h.currency === "GBX" || h.currency === "GBp" ? v / 100 : v; };
  const totalValue = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h) => a + valGBP(h), 0), 0) + directHoldings.reduce((s, h) => s + valGBP(h), 0);
  useEffect(() => {
    if ((!portfolios.length && !directHoldings.length) || totalValue === 0) return;
    const isDemo = typeof document !== "undefined" && document.cookie.includes("olantis_demo=1");
    if (isDemo) return;
    const pfVals = portfolios.map((p) => ({ id: p.id, value: p.holdings.reduce((a, h) => a + valGBP(h), 0) }));
    fetch("/api/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: totalValue, portfolios: pfVals }) }).then(() => refresh()).catch(() => {});
  }, [totalValue, portfolios, directHoldings, refresh]);
  return { snapshots: data.total, byPortfolio: data.byPortfolio, refresh };
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const data: unknown = await api("/api/holdings");
      setHoldings(Array.isArray(data) ? (data as Holding[]) : []);
    } catch { setHoldings([]); }
    setReady(true);
  }, []);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh]);
  return { holdings, ready, refresh };
}

export function useTransactions(portfolioId?: string | null, symbol?: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);
  const fetched = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (portfolioId) qs.set("portfolioId", portfolioId);
      if (symbol) qs.set("symbol", symbol);
      const q = qs.toString() ? `?${qs}` : "";
      const data: unknown = await api(`/api/transactions${q}`);
      setTransactions(Array.isArray(data) ? (data as Transaction[]) : []);
    } catch { setTransactions([]); }
    setReady(true);
  }, [portfolioId, symbol]);
  useEffect(() => { if (!fetched.current) { fetched.current = true; refresh(); } }, [refresh]);
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
