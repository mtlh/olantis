"use client";
import { createContext, useContext, useEffect, useEffectEvent, useState, useCallback, useRef, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_FX_RATES, holdingValueGBP, type FxRates, type ValueChange } from "@/lib/format";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "@/lib/settings";

export { DEFAULT_SETTINGS, normalizeSettings, type AppSettings };

export type Holding = { id: string; symbol: string; name: string; shares: number; avgPrice: number; currentPrice: number; currency: string; sector?: string | null; purchaseDate: string; exchange?: string; portfolioId?: string | null; providerId?: string | null; accountId?: string | null; userId?: string | null; lastRefreshedAt?: number | null };
export type Portfolio = { id: string; name: string; type: "live" | "manual"; accountId: string | null; providerId: string | null; color: string | null; sortOrder?: number | null; holdings: Holding[]; userId?: string; createdAt?: number };
export type Account = { id: string; name: string; color: string | null; icon: string | null; sortOrder?: number | null; userId?: string; createdAt?: number };
export type Provider = { id: string; name: string; color: string | null; icon: string | null; accountId: string; sortOrder?: number | null; userId?: string; createdAt?: number };
export type UserSettings = { userId: string; currency: string; dateFormat: string; defaultRange: string; showTradeMarkers: number };
export type Snapshot = { date: string; value: number };
/** Per-range move of one holding, precomputed on the server (see lib/bootstrap.ts). */
export type HoldingMoverChanges = {
  change1M: ValueChange | null;
  change3M: ValueChange | null;
  change1Y: ValueChange | null;
  changeMax: ValueChange | null;
};
export type SnapResponse = {
  total: Snapshot[];
  byPortfolio: Record<string, { name: string; data: Snapshot[] }>;
  /**
   * Full series for direct holdings only (no portfolioId), which drive the
   * account/provider history. Portfolio holdings already ship through
   * byPortfolio. `/api/snapshots?holdingId=` still returns any single series.
   */
  byHolding?: Record<string, { symbol: string; name: string; data: Snapshot[] }>;
  /**
   * 1M/3M/1Y/MAX move per holding so the dashboard's strongest/weakest movers
   * do not need a full series for every holding in the payload.
   */
  moverChanges?: Record<string, HoldingMoverChanges>;
};
export type Transaction = { id: string; userId?: string; portfolioId?: string | null; holdingId?: string | null; symbol: string; name?: string; type: "buy" | "sell"; shares: number; price: number; date: string; note?: string | null; createdAt: number };
export type Goal = { id: string; name: string; targetValue: number; targetDate: string };

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
  /** Deferred after paint; useTransactions fetches via /api/transactions when undefined. */
  transactions?: Transaction[];
  /** Deferred after paint; GoalPanel / DashboardGoalCard fetch via /api/goals when undefined. */
  goals?: Goal[];
  settings: Record<string, unknown>;
  fx: { date: string | null; rates: FxRates };
  /**
   * True when the snapshot history above already contains today's row, i.e.
   * the server handed the client today's values. A plain page view must not
   * write them again — only a real value change should.
   */
  snapshotsFresh: boolean;
  /**
   * True when byPortfolio/byHolding were omitted for FCP. useSnapshots then
   * refreshes via /api/snapshots after paint instead of trusting the partial.
   */
  snapshotsDeferred?: boolean;
};

const WorkspaceBootstrapContext = createContext<WorkspaceBootstrap | null>(null);
export const WorkspaceDataProvider = WorkspaceBootstrapContext.Provider;

export function useWorkspaceBootstrap(): WorkspaceBootstrap | null {
  return useContext(WorkspaceBootstrapContext);
}

/**
 * A reorder is accepted by the server but only the view that issued it holds
 * fresh rows — every hook call keeps its own state, so the sidebar used to wait
 * for its next refetch before it reflected the new order. The accepted order is
 * broadcast here instead, and each hook layers it over its own rows until the
 * server order lands. Small, synchronous and external, so it is a store rather
 * than state that needs an effect to stay in sync.
 */
type OrderTable = "accounts" | "providers" | "portfolios";
type WorkspaceOrder = Record<OrderTable, Record<string, number>>;

const EMPTY_ORDER: Record<string, number> = {};
const EMPTY_WORKSPACE_ORDER: WorkspaceOrder = { accounts: EMPTY_ORDER, providers: EMPTY_ORDER, portfolios: EMPTY_ORDER };

let workspaceOrder: WorkspaceOrder = EMPTY_WORKSPACE_ORDER;
const orderListeners = new Set<() => void>();

function subscribeWorkspaceOrder(listener: () => void) {
  orderListeners.add(listener);
  return () => {
    orderListeners.delete(listener);
  };
}

function readWorkspaceOrder() {
  return workspaceOrder;
}

/** Publishes the order the server accepted (or is about to accept) for a table. */
export function applyWorkspaceOrder(table: OrderTable, ids: string[]) {
  workspaceOrder = {
    ...workspaceOrder,
    [table]: ids.length ? Object.fromEntries(ids.map((id, index) => [id, index])) : EMPTY_ORDER,
  };
  for (const listener of orderListeners) listener();
}

function useWorkspaceOrder(): WorkspaceOrder {
  return useSyncExternalStore(subscribeWorkspaceOrder, readWorkspaceOrder, () => EMPTY_WORKSPACE_ORDER);
}

/** Overlays a broadcast order on rows, reusing every row the order did not move. */
function applyOrder<T extends { id: string; sortOrder?: number | null }>(rows: T[], order: Record<string, number>): T[] {
  if (order === EMPTY_ORDER) return rows;
  return rows.map((row) => {
    const next = order[row.id];
    return next === undefined || next === row.sortOrder ? row : { ...row, sortOrder: next };
  });
}

type AccountPayload = { id: string; name?: string; color?: string | null; icon?: string | null };
type ProviderPayload = { id: string; name?: string; color?: string | null; icon?: string | null; accountId?: string };
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
  // An Effect Event always sees the latest refresh without being a dependency,
  // so the listener effect can stay mounted for the life of the page.
  const onRefresh = useEffectEvent(refresh);
  const lastRef = useRef(0);
  const mountedAtRef = useRef(0);
  useEffect(() => {
    // Anchor the TTI quiet window so a visibility event racing first paint
    // never triggers a fetch in the first 2s after mount.
    mountedAtRef.current = Date.now();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (readSaveDataMode()) return;
      if (Date.now() - mountedAtRef.current < TTI_QUIET_MS) return;
      const now = Date.now();
      if (now - lastRef.current >= 60000) {
        lastRef.current = now;
        onRefresh();
      }
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
  const [rows, setRows] = useState<Account[]>(boot?.accounts ?? []);
  const order = useWorkspaceOrder();
  const accounts = useMemo(() => applyOrder(rows, order.accounts), [rows, order.accounts]);
  const [ready, setReady] = useState(!!boot);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRows(parseList<Account>(await api("/api/accounts")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load accounts");
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  const create = useCallback(async (name: string) => {
    const r = await api("/api/accounts", { method: "POST", body: JSON.stringify({ name }) }) as { id: string };
    setRows((prev) => [...prev, { id: r.id, name, color: null, icon: null, userId: undefined, createdAt: Math.floor(Date.now() / 1000) }]);
    return r;
  }, []);
  const remove = useCallback(async (id: string) => {
    await api(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);
  const rename = useCallback(async (id: string, name: string, color?: string | null) => {
    const payload: AccountPayload = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, name, ...(color !== undefined ? { color: color ?? null } : {}) } : a)));
  }, []);
  const setColor = useCallback(async (id: string, color: string | null) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ id, color }) });
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
  }, []);
  const setIcon = useCallback(async (id: string, icon: string | null) => {
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ id, icon }) });
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, icon } : a)));
  }, []);
  return { accounts, ready, error, create, remove, rename, setColor, setIcon, refresh, setAccounts: setRows };
}

export function useProviders() {
  const boot = useWorkspaceBootstrap();
  const [rows, setRows] = useState<Provider[]>(boot?.providers ?? []);
  const order = useWorkspaceOrder();
  const providers = useMemo(() => applyOrder(rows, order.providers), [rows, order.providers]);
  const [ready, setReady] = useState(!!boot);
  const refresh = useCallback(async () => {
    try {
      setRows(parseList<Provider>(await api("/api/providers")));
    } catch {
      setRows([]);
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  const remove = useCallback(async (id: string) => {
    await api(`/api/providers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);
  const rename = useCallback(async (id: string, name: string, color?: string | null) => {
    const payload: ProviderPayload = { id, name };
    if (color !== undefined) payload.color = color;
    await api("/api/providers", { method: "POST", body: JSON.stringify(payload) });
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, name, ...(color !== undefined ? { color: color ?? null } : {}) } : p)));
  }, []);
  const setColor = useCallback(async (id: string, color: string | null) => {
    await api("/api/providers", { method: "POST", body: JSON.stringify({ id, color }) });
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
  }, []);
  const setIcon = useCallback(async (id: string, icon: string | null) => {
    await api("/api/providers", { method: "POST", body: JSON.stringify({ id, icon }) });
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, icon } : p)));
  }, []);
  return { providers, ready, remove, rename, setColor, setIcon, refresh, setProviders: setRows };
}

export function usePortfolios() {
  const boot = useWorkspaceBootstrap();
  const [rows, setRows] = useState<Portfolio[]>(boot?.portfolios ?? []);
  const order = useWorkspaceOrder();
  const portfolios = useMemo(() => applyOrder(rows, order.portfolios), [rows, order.portfolios]);
  const [ready, setReady] = useState(!!boot);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRows(parseList<Portfolio>(await api("/api/portfolios")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load portfolios");
    }
    setReady(true);
  }, []);
  useAsyncInit(() => (boot ? Promise.resolve() : refresh()));
  useVisibilityRefresh(refresh);

  const create = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    const r = await api("/api/portfolios", { method: "POST", body: JSON.stringify({ name, type, accountId: accountId ?? null, providerId: providerId ?? null }) }) as { id: string };
    setRows((prev) => [...prev, { id: r.id, name, type, accountId: accountId ?? null, providerId: providerId ?? null, color: null, holdings: [], sortOrder: null, userId: undefined, createdAt: Math.floor(Date.now() / 1000) } as Portfolio]);
    return r;
  };
  const remove = async (id: string) => {
    await api(`/api/portfolios?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  };
  const move = async (id: string, accountId: string | null, providerId?: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ id, accountId, providerId: providerId ?? null }) });
    if (providerId) {
      await refresh();
    } else {
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, accountId, providerId: providerId ?? null } : p)));
    }
  };
  const setColor = async (id: string, color: string | null) => {
    await api("/api/portfolios", { method: "POST", body: JSON.stringify({ id, color }) });
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
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
    const r = await api("/api/holdings", { method: "PATCH", body: JSON.stringify({ symbols: prices }) }) as { holdings?: Holding[] };
    // The route echoes the rows it touched, so apply them without a re-read.
    const touched = Array.isArray(r.holdings) ? r.holdings : [];
    if (touched.length) {
      const byId = new Map(touched.map((h) => [h.id, h]));
      setRows((prev) => prev.map((p) => ({ ...p, holdings: p.holdings.map((h) => byId.get(h.id) ?? h) })));
    }
    return touched;
  };
  return { portfolios, ready, error, create, remove, move, setColor, upsertHolding, deleteHolding, moveHolding, updatePrices, refresh, setPortfolios: setRows };
}

const SNAPSHOT_DEBOUNCE_MS = 2000;

/**
 * Quiet window after mount: snapshot writes, history backfills and visibility
 * refetches must never fire inside it, so they cannot contend with first
 * paint or input.
 */
const TTI_QUIET_MS = 2000;

/** Backfill starts just after the snapshot write window, so the two never contend. */
const BACKFILL_DELAY_MS = 2500;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** True when the OS/browser reports data-saver: bulk/prefetch work stays off. */
function readSaveDataMode(): boolean {
  const connection = (window.navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

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
  // A trimmed first payload (snapshotsDeferred) carries total + moverChanges
  // only; fill in the full byPortfolio/byHolding history after paint.
  useAsyncInit(() => (boot && !boot.snapshotsDeferred ? Promise.resolve() : refresh()));
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
    if (!prev && boot?.snapshotsFresh) {
      // The server render already contained today's snapshot, so this page view
      // has nothing new to record. Seed the guard with the value we were given;
      // a later price/trade change will still POST.
      lastPosted.current = { day, value: totalValue };
      return;
    }
    // Idle write: nothing posts from a hidden tab, and the POST itself waits
    // out the debounce and then yields to idle so it never blocks input. The
    // guard stays unset on a skip, so the next value change retries.
    if (document.visibilityState === "hidden") return;
    const win = window as IdleWindow;
    let idleHandle: number | undefined;
    const post = () => {
      if (document.visibilityState === "hidden") return;
      lastPosted.current = { day, value: totalValue };
      fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: totalValue, portfolios: pfVals, holdings: hVals }),
      }).catch(() => {});
    };
    const timer = window.setTimeout(() => {
      if (win.requestIdleCallback) {
        idleHandle = win.requestIdleCallback(post, { timeout: 2000 });
      } else {
        post();
      }
    }, SNAPSHOT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== undefined) win.cancelIdleCallback?.(idleHandle);
    };
  }, [totalValue, portfolios.length, directHoldings.length, pfVals, hVals, refresh, boot]);

  // Fill in history from before the account existed: if the saved series starts
  // later than the oldest purchase, ask the server to reconstruct it once. The
  // server marks completed holdings, so repeat calls are cheap no-ops.
  const earliestPurchase = useMemo<string | null>(() => {
    let earliest: string | null = null;
    const consider = (date?: string | null) => {
      const day = date?.slice(0, 10);
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      if (!earliest || day < earliest) earliest = day;
    };
    for (const p of portfolios) for (const h of p.holdings) consider(h.purchaseDate);
    for (const h of directHoldings) consider(h.purchaseDate);
    return earliest;
  }, [portfolios, directHoldings]);

  const backfillRequestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!earliestPurchase) return;
    const firstSnapshot = data.total[0]?.date;
    if (firstSnapshot && firstSnapshot <= earliestPurchase) return;
    if (backfillRequestedFor.current === earliestPurchase) return;
    // Idle-only prefetch: never contend with first paint, a hidden tab, or a
    // data-saver connection. Guards run before the request is marked, so a
    // skip retries naturally when snapshot data refreshes.
    if (document.visibilityState === "hidden") return;
    if (readSaveDataMode()) return;
    const storageKey = "olantis:history-backfill";
    try {
      if (sessionStorage.getItem(storageKey) === earliestPurchase) return;
      sessionStorage.setItem(storageKey, earliestPurchase);
    } catch {
      /* sessionStorage may be unavailable (private mode); the server still dedupes */
    }
    backfillRequestedFor.current = earliestPurchase;
    let cancelled = false;
    let idleHandle: number | undefined;
    const win = window as IdleWindow;
    const run = async () => {
      let filled = 0;
      // Follow the pending count for a few rounds so a large import completes in
      // one page load instead of waiting for the daily cron.
      for (let round = 0; round < 3 && !cancelled; round++) {
        const r = await fetch("/api/snapshots/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!r.ok) break;
        const result = (await r.json()) as { holdingsBackfilled?: number; pending?: number };
        const count = result.holdingsBackfilled ?? 0;
        filled += count;
        if (count === 0 || (result.pending ?? 0) === 0) break;
      }
      if (!cancelled && filled > 0) void refresh();
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (document.visibilityState === "hidden" || readSaveDataMode()) return;
      if (win.requestIdleCallback) {
        idleHandle = win.requestIdleCallback(() => {
          void run().catch(() => {});
        }, { timeout: 3000 });
      } else {
        void run().catch(() => {});
      }
    }, BACKFILL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleHandle !== undefined) win.cancelIdleCallback?.(idleHandle);
    };
  }, [earliestPurchase, data.total, refresh]);

  return { snapshots: data.total, byPortfolio: data.byPortfolio, byHolding: data.byHolding, moverChanges: data.moverChanges, refresh };
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
  return { holdings, ready, error, refresh, setHoldings };
}

export function useTransactions(portfolioId?: string | null, symbol?: string | null, holdingId?: string | null) {
  const boot = useWorkspaceBootstrap();
  const hasFilter = !!(portfolioId || symbol || holdingId);
  const [transactions, setTransactions] = useState<Transaction[]>(
    boot?.transactions && !hasFilter ? boot.transactions : [],
  );
  const [ready, setReady] = useState(!!boot?.transactions && !hasFilter);
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
    if (boot?.transactions && !hasFilter) return;
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
    const r = await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) }) as { transaction?: Transaction; holding?: Holding | null };
    // Paint the new trade immediately; the caller reconciles in parallel.
    const created = r.transaction;
    const visible = created && (!portfolioId || created.portfolioId === portfolioId)
      && (!symbol || created.symbol === symbol.toUpperCase())
      && (!holdingId || created.holdingId === holdingId);
    if (created && visible) {
      setTransactions((prev) => [created, ...prev.filter((t) => t.id !== created.id)]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt));
    }
    return { holding: r.holding ?? null };
  };
  const remove = async (id: string) => {
    const r = await api(`/api/transactions?id=${encodeURIComponent(id)}`, { method: "DELETE" }) as { holding?: Holding | null };
    // Drop the row now so the list and the recalculated position update together.
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    return { holding: r.holding ?? null };
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
