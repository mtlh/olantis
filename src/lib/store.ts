"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { holdingValueGBP } from "@/lib/format";

export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate: string; exchange?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; userId?: string | null; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId: string | null; providerId: string | null; color: string | null; sortOrder?: number | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; color: string | null; sortOrder?: number | null; userId?: string; createdAt?: number };
export type Provider = { id: string; name: string; color: string | null; accountId: string; sortOrder?: number | null; userId?: string; createdAt?: number };
export type UserSettings = { userId: string; currency: string; dateFormat: string; defaultRange: string; showTradeMarkers: number };
export type Snapshot = { date: string; value: number };
export type SnapResponse = { total: Snapshot[]; byPortfolio: Record<string, { name: string; data: Snapshot[] }>; byHolding?: Record<string, { symbol: string; name: string; data: Snapshot[] }> };
export type Transaction = { id: string; userId?: string; portfolioId: string; holdingId?: string | null; symbol: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date: string; note?: string | null; createdAt: number };

type AccountPayload = { id: string; name?: string; color?: string | null };
type ProviderPayload = { id: string; name?: string; color?: string | null; accountId?: string };
type HoldingsBody = { id?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; purchaseDate?: string; exchange?: string };

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function parseList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function useVisibilityRefresh(refresh: () => void) {
  const ref = useRef(refresh);
  useEffect(() => {
    ref.current = refresh;
  }, [refresh]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
}

function useAsyncInit(load: () => Promise<void>) {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await load();
    };
    const p = Promise.resolve().then(run);
    void p;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setAccounts(parseList<Account>(await api("/api/accounts")));
    } catch {
      setAccounts([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(refresh);
  const create = async (name: string) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  };
  const remove = async (id: string) => {
    await api(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
  const refresh = useCallback(async () => {
    try {
      setProviders(parseList<Provider>(await api("/api/providers")));
    } catch {
      setProviders([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(refresh);
  const create = async (name: string, accountId: string, color?: string | null) => {
    const r = await api("/api/providers", { method: "POST", body: JSON.stringify({ name, accountId, color: color ?? null }) });
    await refresh();
    return r as { id: string };
  };
  const remove = async (id: string) => {
    await api(`/api/providers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
  const refresh = useCallback(async () => {
    try {
      setPortfolios(parseList<Portfolio>(await api("/api/portfolios")));
    } catch {
      setPortfolios([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(refresh);
  useVisibilityRefresh(refresh);

  const create = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    const r = await api("/api/portfolios", { method: "POST", body: JSON.stringify({ name, type, accountId: accountId ?? null, providerId: providerId ?? null }) });
    await refresh();
    return r as { id: string };
  };
  const remove = async (id: string) => {
    await api(`/api/portfolios?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
  const upsertHolding = async (targetId: string, h: Omit<Holding, "id"> & { id?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null }, kind: "portfolio" | "provider" | "account" = "portfolio") => {
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
  const deleteHolding = async (holdingId: string) => {
    await api(`/api/holdings?id=${encodeURIComponent(holdingId)}`, { method: "DELETE" });
    await refresh();
  };
  const updatePrices = async (prices: Record<string, { price: number; currency: string }>) => {
    await api("/api/holdings", { method: "PATCH", body: JSON.stringify({ symbols: prices }) });
    await refresh();
  };
  return { portfolios, ready, create, remove, move, setColor, upsertHolding, deleteHolding, updatePrices, refresh, setPortfolios };
}

const SNAPSHOT_DEBOUNCE_MS = 2000;

export function useSnapshots(portfolios: Portfolio[], directHoldings: Holding[] = []) {
  const [data, setData] = useState<SnapResponse>({ total: [], byPortfolio: {} });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshots");
      if (!r.ok) return;
      const j: unknown = await r.json();
      if (Array.isArray(j)) setData({ total: j as Snapshot[], byPortfolio: {} });
      else setData(j as SnapResponse);
    } catch {
      /* keep previous data */
    }
  }, []);
  useAsyncInit(refresh);
  useVisibilityRefresh(refresh);

  const pfVals = useMemo(
    () => portfolios.map((p) => ({ id: p.id, value: p.holdings.reduce((a, h) => a + holdingValueGBP(h), 0) })),
    [portfolios]
  );
  const hVals = useMemo(() => {
    const out: Array<{ id: string; value: number }> = [];
    for (const p of portfolios) for (const h of p.holdings) out.push({ id: h.id, value: holdingValueGBP(h) });
    for (const h of directHoldings) out.push({ id: h.id, value: holdingValueGBP(h) });
    return out;
  }, [portfolios, directHoldings]);
  const totalValue = useMemo(() => pfVals.reduce((s, p) => s + p.value, 0) + directHoldings.reduce((s, h) => s + holdingValueGBP(h), 0), [pfVals, directHoldings]);

  const lastPosted = useRef<{ day: string; value: number } | null>(null);
  useEffect(() => {
    if (!portfolios.length && !directHoldings.length) return;
    if (totalValue === 0) return;
    const day = new Date().toISOString().slice(0, 10);
    const prev = lastPosted.current;
    if (prev && prev.day === day && Math.abs(prev.value - totalValue) < 0.01) return;
    const t = setTimeout(() => {
      lastPosted.current = { day, value: totalValue };
      fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: totalValue, portfolios: pfVals, holdings: hVals }),
      })
        .then(() => refresh())
        .catch(() => {});
    }, SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [totalValue, portfolios.length, directHoldings.length, pfVals, hVals, refresh]);

  return { snapshots: data.total, byPortfolio: data.byPortfolio, byHolding: data.byHolding, refresh };
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setHoldings(parseList<Holding>(await api("/api/holdings")));
    } catch {
      setHoldings([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(refresh);
  useVisibilityRefresh(refresh);
  return { holdings, ready, refresh };
}

export function useTransactions(portfolioId?: string | null, symbol?: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ready, setReady] = useState(false);
  const key = `${portfolioId ?? ""}:${symbol ?? ""}`;
  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (portfolioId) qs.set("portfolioId", portfolioId);
      if (symbol) qs.set("symbol", symbol);
      const q = qs.toString() ? `?${qs}` : "";
      setTransactions(parseList<Transaction>(await api(`/api/transactions${q}`)));
    } catch {
      setTransactions([]);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    let cancelled = false;
    const p = Promise.resolve().then(async () => {
      if (cancelled) return;
      await refresh();
    });
    void p;
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  const create = async (payload: { portfolioId: string; holdingId?: string | null; symbol?: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date?: string; note?: string }) => {
    await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  };
  const remove = async (id: string) => {
    await api(`/api/transactions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  };
  return { transactions, ready, refresh, create, remove };
}
