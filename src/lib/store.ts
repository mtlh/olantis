"use client";
import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { DEFAULT_FX_RATES, holdingValueGBP, type FxRates } from "@/lib/format";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "@/lib/settings";

export { DEFAULT_SETTINGS, normalizeSettings, type AppSettings };

export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; sector?: string | null; purchaseDate: string; exchange?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; userId?: string | null; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId: string | null; providerId: string | null; color: string | null; sortOrder?: number | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; color: string | null; sortOrder?: number | null; userId?: string; createdAt?: number };
export type Provider = { id: string; name: string; color: string | null; accountId: string; sortOrder?: number | null; userId?: string; createdAt?: number };
export type UserSettings = { userId: string; currency: string; dateFormat: string; defaultRange: string; showTradeMarkers: number };
export type Snapshot = { date: string; value: number };
export type SnapResponse = { total: Snapshot[]; byPortfolio: Record<string, { name: string; data: Snapshot[] }>; byHolding?: Record<string, { symbol: string; name: string; data: Snapshot[] }> };
export type Transaction = { id: string; userId?: string; portfolioId?: string | null; holdingId?: string | null; symbol: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date: string; note?: string | null; createdAt: number };

/**
 * Workspace data resolved on the server (see lib/bootstrap.ts) and handed to
 * the client tree. Hooks initialise from it so the server HTML and the first
 * client render agree, and skip their mount fetch entirely.
 */
export type WorkspaceBootstrap = {
  accounts: Account[];
  providers: Provider[];
  portfolios: Portfolio[];
  holdings: Holding[];
  snapshots: SnapResponse;
  transactions: Transaction[];
  settings: Record<string, unknown>;
  fx: { date: string | null; rates: FxRates };
};

const WorkspaceBootstrapContext = createContext<WorkspaceBootstrap | null>(null);
export const WorkspaceDataProvider = WorkspaceBootstrapContext.Provider;

export function useWorkspaceBootstrap(): WorkspaceBootstrap | null {
  return useContext(WorkspaceBootstrapContext);
}

type AccountPayload = { id: string; name?: string; color?: string | null };
type ProviderPayload = { id: string; name?: string; color?: string | null; accountId?: string };
type HoldingsBody = { id?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; sector?: string | null; purchaseDate?: string; exchange?: string };

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
  const boot = useWorkspaceBootstrap();
  const [accounts, setAccounts] = useState<Account[]>(boot?.accounts ?? []);
  const [ready, setReady] = useState(!!boot);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setAccounts(parseList<Account>(await api("/api/accounts")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load accounts");
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  const create = useCallback(async (name: string) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  }, [refresh]);
  const remove = useCallback(async (id: string) => {
    await api(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);
  const rename = useCallback(async (id: string, name: string, color?: string | null) => {
    const payload: AccountPayload = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  }, [refresh]);
  const setColor = useCallback(async (id: string, color: string | null) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ id, color }) });
    await refresh();
  }, [refresh]);
  return { accounts, ready, error, create, remove, rename, setColor, refresh, setAccounts };
}

export function useProviders() {
  const boot = useWorkspaceBootstrap();
  const [providers, setProviders] = useState<Provider[]>(boot?.providers ?? []);
  const [ready, setReady] = useState(!!boot);
  const refresh = useCallback(async () => {
    try {
      setProviders(parseList<Provider>(await api("/api/providers")));
    } catch {
      setProviders([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  const create = useCallback(async (name: string, accountId: string, color?: string | null) => {
    const r = await api("/api/providers", { method: "POST", body: JSON.stringify({ name, accountId, color: color ?? null }) });
    await refresh();
    return r as { id: string };
  }, [refresh]);
  const remove = useCallback(async (id: string) => {
    await api(`/api/providers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);
  const rename = useCallback(async (id: string, name: string, color?: string | null) => {
    const payload: ProviderPayload = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/providers", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  }, [refresh]);
  const setColor = useCallback(async (id: string, color: string | null) => {
    await api("/api/providers", { method: "POST", body: JSON.stringify({ id, color }) });
    await refresh();
  }, [refresh]);
  return { providers, ready, create, remove, rename, setColor, refresh, setProviders };
}

export function usePortfolios() {
  const boot = useWorkspaceBootstrap();
  const [portfolios, setPortfolios] = useState<Portfolio[]>(boot?.portfolios ?? []);
  const [ready, setReady] = useState(!!boot);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setPortfolios(parseList<Portfolio>(await api("/api/portfolios")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load portfolios");
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
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
  const moveHolding = async (holdingId: string, portfolioId: string) => {
    await api("/api/holdings", { method: "POST", body: JSON.stringify({ id: holdingId, portfolioId }) });
    await refresh();
  };
  const updatePrices = async (prices: Record<string, { price: number; currency: string }>) => {
    await api("/api/holdings", { method: "PATCH", body: JSON.stringify({ symbols: prices }) });
    await refresh();
  };
  return { portfolios, ready, error, create, remove, move, setColor, upsertHolding, deleteHolding, moveHolding, updatePrices, refresh, setPortfolios };
}

const SNAPSHOT_DEBOUNCE_MS = 2000;

export function useSnapshots(portfolios: Portfolio[], directHoldings: Holding[] = [], fxRates: FxRates = DEFAULT_FX_RATES) {
  const boot = useWorkspaceBootstrap();
  const [data, setData] = useState<SnapResponse>(boot?.snapshots ?? { total: [], byPortfolio: {} });
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
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  useVisibilityRefresh(refresh);

  const pfVals = useMemo(
    () => portfolios.map((p) => ({ id: p.id, value: p.holdings.reduce((a, h) => a + holdingValueGBP(h, fxRates), 0) })),
    [portfolios, fxRates]
  );
  const hVals = useMemo(() => {
    const out: Array<{ id: string; value: number }> = [];
    for (const p of portfolios) for (const h of p.holdings) out.push({ id: h.id, value: holdingValueGBP(h, fxRates) });
    for (const h of directHoldings) out.push({ id: h.id, value: holdingValueGBP(h, fxRates) });
    return out;
  }, [portfolios, directHoldings, fxRates]);
  const totalValue = useMemo(() => pfVals.reduce((s, p) => s + p.value, 0) + directHoldings.reduce((s, h) => s + holdingValueGBP(h, fxRates), 0), [pfVals, directHoldings, fxRates]);

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
  const boot = useWorkspaceBootstrap();
  const [holdings, setHoldings] = useState<Holding[]>(boot?.holdings ?? []);
  const [ready, setReady] = useState(!!boot);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setHoldings(parseList<Holding>(await api("/api/holdings")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load holdings");
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  useVisibilityRefresh(refresh);
  return { holdings, ready, error, refresh };
}

export function useTransactions(portfolioId?: string | null, symbol?: string | null, holdingId?: string | null) {
  const boot = useWorkspaceBootstrap();
  const hasFilter = !!(portfolioId || symbol || holdingId);
  const [transactions, setTransactions] = useState<Transaction[]>(
    boot && !hasFilter ? boot.transactions : [],
  );
  const [ready, setReady] = useState(!!boot && !hasFilter);
  const key = `${portfolioId ?? ""}:${symbol ?? ""}:${holdingId ?? ""}`;
  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (portfolioId) qs.set("portfolioId", portfolioId);
      if (symbol) qs.set("symbol", symbol);
      if (holdingId) qs.set("holdingId", holdingId);
      const q = qs.toString() ? `?${qs}` : "";
      setTransactions(parseList<Transaction>(await api(`/api/transactions${q}`)));
    } catch {
      setTransactions([]);
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (boot && !hasFilter) return;
    let cancelled = false;
    const p = Promise.resolve().then(async () => {
      if (cancelled) return;
      await refresh();
    });
    void p;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  const create = async (payload: { portfolioId?: string | null; holdingId?: string | null; symbol?: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date?: string; note?: string }) => {
    await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
    await refresh();
  };
  const remove = async (id: string) => {
    await api(`/api/transactions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  };
  return { transactions, ready, refresh, create, remove };
}

/**
 * User preferences, shared across the dashboard. Previously these were written
 * by /settings but never read anywhere — chart range, trade markers and
 * currency were all hardcoded. Consumers now subscribe here.
 */
export function useSettings() {
  const boot = useWorkspaceBootstrap();
  const [settings, setSettings] = useState<AppSettings>(() => boot
    ? {
        ...normalizeSettings(boot.settings),
        fxRates: { ...DEFAULT_FX_RATES, ...boot.fx.rates },
        fxDate: boot.fx.date,
      }
    : DEFAULT_SETTINGS);
  const [ready, setReady] = useState(!!boot);

  const refresh = useCallback(async () => {
    try {
      const [rawSettings, rawFx] = await Promise.all([api("/api/settings"), api("/api/fx").catch(() => null)]);
      const normalized = normalizeSettings(rawSettings);
      const fx = rawFx as { rates?: FxRates; date?: string | null } | null;
      setSettings({ ...normalized, fxRates: { ...DEFAULT_FX_RATES, ...(fx?.rates ?? {}) }, fxDate: fx?.date ?? null });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));

  const save = useCallback(
    async (patch: Partial<AppSettings>) => {
      const body: Record<string, unknown> = {};
      if (patch.currency !== undefined) body.currency = patch.currency;
      if (patch.dateFormat !== undefined) body.dateFormat = patch.dateFormat;
      if (patch.defaultRange !== undefined) body.defaultRange = patch.defaultRange;
      if (patch.showTradeMarkers !== undefined) body.showTradeMarkers = patch.showTradeMarkers ? 1 : 0;
      await api("/api/settings", { method: "POST", body: JSON.stringify(body) });
      await refresh();
    },
    [refresh]
  );

  return { settings, ready, save, refresh, setSettings };
}
