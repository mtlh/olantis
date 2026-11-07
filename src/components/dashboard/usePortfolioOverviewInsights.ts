"use client";

import { useDeferredValue, useMemo } from "react";
import { holdingCostGBP, holdingValueGBP, type FxRates, type ValueChange } from "@/lib/format";
import type { Account, Holding, HoldingMoverChanges, Portfolio, Provider } from "@/lib/store";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

export type AccountBreakdownChild = {
  id: string;
  name: string;
  kind: "provider" | "portfolio" | "direct";
  value: number;
  gain: number;
};

export type AccountBreakdownRow = {
  id: string;
  name: string;
  value: number;
  gain: number;
  children: AccountBreakdownChild[];
};

export type PositionInsight = {
  holding: Holding;
  portfolioName: string;
  value: number;
  gain: number;
  returnPct: number | null;
};

export type OverviewPositionInsights = {
  positions: PositionInsight[];
  profitableCount: number;
  losingCount: number;
  unchangedCount: number;
  largest: PositionInsight | null;
  latestRefresh: number | null;
  refreshedCount: number;
};

export type PositionMover = PositionInsight & { change: ValueChange };

type UsePortfolioOverviewInsightsProps = {
  accounts: Account[];
  providers: Provider[];
  portfolios: Portfolio[];
  allHoldings: Holding[];
  directHoldings: Holding[];
  moverChanges?: Record<string, HoldingMoverChanges>;
  fxRates: FxRates;
  range: ChartRange;
  /**
   * True before first paint (see useAfterFirstPaint): skip the O(holdings)
   * passes and return empty results so below-fold work lands after TTI.
   */
  defer?: boolean;
};

const EMPTY_INSIGHTS: OverviewPositionInsights = {
  positions: [],
  profitableCount: 0,
  losingCount: 0,
  unchangedCount: 0,
  largest: null,
  latestRefresh: null,
  refreshedCount: 0,
};

const EMPTY_MOVERS: { strongest: PositionMover | null; weakest: PositionMover | null } = {
  strongest: null,
  weakest: null,
};

const MOVE_KEY: Record<ChartRange, keyof HoldingMoverChanges> = {
  "1M": "change1M",
  "3M": "change3M",
  "1Y": "change1Y",
  MAX: "changeMax",
};

export function usePortfolioOverviewInsights({
  accounts,
  providers,
  portfolios,
  allHoldings,
  directHoldings,
  moverChanges,
  fxRates,
  range,
  defer = false,
}: UsePortfolioOverviewInsightsProps) {
  // Range toggles recompute movers in a low-priority render so the chart and
  // metric strip stay responsive while the toggle is dragged.
  const deferredRange = useDeferredValue(range);

  const breakdown = useMemo<AccountBreakdownRow[]>(() => {
    if (defer) return [];
    const portfolioById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio]));
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const resolveProviderId = (holding: Holding) => holding.providerId
      ?? (holding.portfolioId ? portfolioById.get(holding.portfolioId)?.providerId ?? null : null);
    const resolveAccountId = (holding: Holding) => {
      if (holding.accountId) return holding.accountId;
      const providerId = resolveProviderId(holding);
      if (providerId) return providerById.get(providerId)?.accountId ?? null;
      const portfolio = holding.portfolioId ? portfolioById.get(holding.portfolioId) : null;
      return portfolio?.accountId ?? null;
    };

    // One pass over the holdings, bucketed by account/provider/portfolio. The
    // previous implementation re-filtered every holding for every account,
    // provider and portfolio, which is quadratic on a large import.
    type Totals = { value: number; cost: number; count: number };
    const emptyTotals = (): Totals => ({ value: 0, cost: 0, count: 0 });
    const addTo = (totals: Totals, holding: Holding) => {
      totals.value += holdingValueGBP(holding, fxRates);
      totals.cost += holdingCostGBP(holding, fxRates);
      totals.count += 1;
    };
    type AccountBucket = {
      total: Totals;
      byProvider: Map<string, Totals>;
      byPortfolio: Map<string, Totals>;
      ungrouped: Totals;
    };
    const buckets = new Map<string, AccountBucket>();
    for (const account of accounts) {
      buckets.set(account.id, { total: emptyTotals(), byProvider: new Map(), byPortfolio: new Map(), ungrouped: emptyTotals() });
    }
    for (const holding of allHoldings) {
      const accountId = resolveAccountId(holding);
      if (!accountId) continue;
      const bucket = buckets.get(accountId);
      if (!bucket) continue;

      addTo(bucket.total, holding);
      const providerId = resolveProviderId(holding);
      if (providerId) {
        let totals = bucket.byProvider.get(providerId);
        if (!totals) bucket.byProvider.set(providerId, totals = emptyTotals());
        addTo(totals, holding);
      }
      if (holding.portfolioId) {
        let totals = bucket.byPortfolio.get(holding.portfolioId);
        if (!totals) bucket.byPortfolio.set(holding.portfolioId, totals = emptyTotals());
        addTo(totals, holding);
      }
      if (!holding.portfolioId && !holding.providerId) addTo(bucket.ungrouped, holding);
    }

    return accounts.map((account) => {
      const bucket = buckets.get(account.id) ?? { total: emptyTotals(), byProvider: new Map(), byPortfolio: new Map(), ungrouped: emptyTotals() };
      const children: AccountBreakdownChild[] = [
        ...providers.filter((provider) => provider.accountId === account.id).map((provider) => {
          const totals = bucket.byProvider.get(provider.id);
          return {
            id: provider.id,
            name: provider.name,
            kind: "provider" as const,
            value: totals?.value ?? 0,
            gain: (totals?.value ?? 0) - (totals?.cost ?? 0),
          };
        }),
        ...portfolios.filter((portfolio) => portfolio.accountId === account.id && !portfolio.providerId).map((portfolio) => {
          const totals = bucket.byPortfolio.get(portfolio.id);
          return {
            id: portfolio.id,
            name: portfolio.name,
            kind: "portfolio" as const,
            value: totals?.value ?? 0,
            gain: (totals?.value ?? 0) - (totals?.cost ?? 0),
          };
        }),
      ].sort((a, b) => b.value - a.value);

      if (bucket.ungrouped.count) {
        children.push({
          id: account.id,
          name: "Direct holdings",
          kind: "direct",
          value: bucket.ungrouped.value,
          gain: bucket.ungrouped.value - bucket.ungrouped.cost,
        });
      }
      return {
        id: account.id,
        name: account.name,
        value: bucket.total.value,
        gain: bucket.total.value - bucket.total.cost,
        children,
      };
    }).sort((a, b) => b.value - a.value);
  }, [accounts, allHoldings, defer, fxRates, portfolios, providers]);

  const insights = useMemo<OverviewPositionInsights>(() => {
    if (defer) return EMPTY_INSIGHTS;
    const byId = new Map<string, { holding: Holding; portfolioName: string }>();
    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) byId.set(holding.id, { holding, portfolioName: portfolio.name });
    }
    for (const holding of directHoldings) {
      if (!byId.has(holding.id)) byId.set(holding.id, { holding, portfolioName: "Direct holding" });
    }

    const positions: PositionInsight[] = [];
    let profitableCount = 0;
    let losingCount = 0;
    let unchangedCount = 0;
    let largest: PositionInsight | null = null;
    let latestRefresh: number | null = null;
    let refreshedCount = 0;
    for (const { holding, portfolioName } of byId.values()) {
      const value = holdingValueGBP(holding, fxRates);
      const cost = holdingCostGBP(holding, fxRates);
      const gain = value - cost;
      const position: PositionInsight = {
        holding,
        portfolioName,
        value,
        gain,
        returnPct: cost > 0 ? (gain / cost) * 100 : null,
      };
      positions.push(position);
      // Single pass over the positions instead of a filter per summary.
      if (position.returnPct !== null) {
        if (gain > 0) profitableCount += 1;
        else if (gain < 0) losingCount += 1;
        else unchangedCount += 1;
      }
      if (!largest || value > largest.value) largest = position;
      const refreshedAt = holding.lastRefreshedAt;
      if (refreshedAt) {
        refreshedCount += 1;
        if (!latestRefresh || refreshedAt > latestRefresh) latestRefresh = refreshedAt;
      }
    }

    return {
      positions,
      profitableCount,
      losingCount,
      unchangedCount,
      largest,
      latestRefresh,
      refreshedCount,
    };
  }, [defer, directHoldings, fxRates, portfolios]);

  const periodMovers = useMemo(() => {
    if (defer) return EMPTY_MOVERS;
    const key = MOVE_KEY[deferredRange];
    const movers = insights.positions.flatMap((position) => {
      const change = moverChanges?.[position.holding.id]?.[key];
      return change ? [{ ...position, change }] : [];
    });
    return {
      strongest: movers.reduce<PositionMover | null>((best, item) => !best || item.change.amount > best.change.amount ? item : best, null),
      weakest: movers.reduce<PositionMover | null>((worst, item) => !worst || item.change.amount < worst.change.amount ? item : worst, null),
    };
  }, [defer, deferredRange, insights.positions, moverChanges]);

  return { breakdown, insights, periodMovers };
}
