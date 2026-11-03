"use client";

import { useMemo } from "react";
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
}: UsePortfolioOverviewInsightsProps) {
  const breakdown = useMemo<AccountBreakdownRow[]>(() => {
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
    const summarize = (holdings: Holding[]) => {
      const value = holdings.reduce((sum, holding) => sum + holdingValueGBP(holding, fxRates), 0);
      const cost = holdings.reduce((sum, holding) => sum + holdingCostGBP(holding, fxRates), 0);
      return { value, gain: value - cost };
    };

    return accounts.map((account) => {
      const accountHoldings = allHoldings.filter((holding) => resolveAccountId(holding) === account.id);
      const accountTotals = summarize(accountHoldings);
      const children: AccountBreakdownChild[] = [
        ...providers.filter((provider) => provider.accountId === account.id).map((provider) => ({
          id: provider.id,
          name: provider.name,
          kind: "provider" as const,
          ...summarize(accountHoldings.filter((holding) => resolveProviderId(holding) === provider.id)),
        })),
        ...portfolios.filter((portfolio) => portfolio.accountId === account.id && !portfolio.providerId).map((portfolio) => ({
          id: portfolio.id,
          name: portfolio.name,
          kind: "portfolio" as const,
          ...summarize(accountHoldings.filter((holding) => holding.portfolioId === portfolio.id)),
        })),
      ].sort((a, b) => b.value - a.value);

      const ungroupedHoldings = accountHoldings.filter((holding) => !holding.portfolioId && !holding.providerId);
      if (ungroupedHoldings.length) {
        children.push({ id: account.id, name: "Direct holdings", kind: "direct", ...summarize(ungroupedHoldings) });
      }
      return { id: account.id, name: account.name, ...accountTotals, children };
    }).sort((a, b) => b.value - a.value);
  }, [accounts, allHoldings, fxRates, portfolios, providers]);

  const insights = useMemo<OverviewPositionInsights>(() => {
    const byId = new Map<string, { holding: Holding; portfolioName: string }>();
    for (const portfolio of portfolios) {
      for (const holding of portfolio.holdings) byId.set(holding.id, { holding, portfolioName: portfolio.name });
    }
    for (const holding of directHoldings) {
      if (!byId.has(holding.id)) byId.set(holding.id, { holding, portfolioName: "Direct holding" });
    }

    const positions: PositionInsight[] = [...byId.values()].map(({ holding, portfolioName }) => {
      const value = holdingValueGBP(holding, fxRates);
      const cost = holdingCostGBP(holding, fxRates);
      const gain = value - cost;
      return { holding, portfolioName, value, gain, returnPct: cost > 0 ? (gain / cost) * 100 : null };
    });
    const withCostBasis = positions.filter((position) => position.returnPct !== null);
    const latestRefresh = positions.reduce<number | null>((latest, position) => {
      const refreshedAt = position.holding.lastRefreshedAt;
      return refreshedAt && (!latest || refreshedAt > latest) ? refreshedAt : latest;
    }, null);

    return {
      positions,
      profitableCount: withCostBasis.filter((position) => position.gain > 0).length,
      losingCount: withCostBasis.filter((position) => position.gain < 0).length,
      unchangedCount: withCostBasis.filter((position) => position.gain === 0).length,
      largest: positions.reduce<PositionInsight | null>((best, position) => !best || position.value > best.value ? position : best, null),
      latestRefresh,
      refreshedCount: positions.filter((position) => position.holding.lastRefreshedAt).length,
    };
  }, [directHoldings, fxRates, portfolios]);

  const periodMovers = useMemo(() => {
    const key = MOVE_KEY[range];
    const movers = insights.positions.flatMap((position) => {
      const change = moverChanges?.[position.holding.id]?.[key];
      return change ? [{ ...position, change }] : [];
    });
    return {
      strongest: movers.reduce<PositionMover | null>((best, item) => !best || item.change.amount > best.change.amount ? item : best, null),
      weakest: movers.reduce<PositionMover | null>((worst, item) => !worst || item.change.amount < worst.change.amount ? item : worst, null),
    };
  }, [insights.positions, moverChanges, range]);

  return { breakdown, insights, periodMovers };
}
