"use client";

import { useMemo } from "react";
import type { AllocationItem } from "@/components/dashboard/shared/AllocationCard";
import { portfolioTint, resolveAccountColor, resolveProviderColor } from "@/lib/colors";
import { combineHistories, holdingCostGBP, holdingValueGBP, type FxRates } from "@/lib/format";
import type { Account, Holding, Portfolio, Provider, Snapshot } from "@/lib/store";

type HistoryIndex = Record<string, { data: Snapshot[] }>;

type UseAccountProviderDashboardDataProps = {
  activeAccount: Account | null;
  activeProvider: Provider | null;
  accounts: Account[];
  providers: Provider[];
  portfolios: Portfolio[];
  directHoldings: Holding[];
  byPortfolio: HistoryIndex;
  byHolding?: HistoryIndex;
  fxRates: FxRates;
};

function sortByOrder<T extends { sortOrder?: number | null }>(items: T[]) {
  return [...items].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
}

function getSortOrderIndexes(items: Array<{ id: string; sortOrder?: number | null }>) {
  const indexes = new Map<string, number>();
  sortByOrder(items).forEach((item, index) => {
    if (!indexes.has(item.id)) indexes.set(item.id, index);
  });
  return indexes;
}

function summarizeHoldings(holdings: Holding[], fxRates: FxRates) {
  let value = 0;
  let cost = 0;
  for (const holding of holdings) {
    value += holdingValueGBP(holding, fxRates);
    cost += holdingCostGBP(holding, fxRates);
  }
  return { value, cost, gain: value - cost };
}

function createAllocation(holdings: Holding[], totalValue: number, baseColor: string | null, fxRates: FxRates): AllocationItem[] {
  if (!totalValue) return [];

  const bySymbol = new Map<string, number>();
  for (const holding of holdings) {
    bySymbol.set(holding.symbol, (bySymbol.get(holding.symbol) ?? 0) + holdingValueGBP(holding, fxRates));
  }

  return [...bySymbol.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], index) => ({
      name,
      value,
      color: portfolioTint(baseColor, index),
      pct: (value / totalValue) * 100,
    }));
}

export function useAccountProviderDashboardData({
  activeAccount,
  activeProvider,
  accounts,
  providers,
  portfolios,
  directHoldings,
  byPortfolio,
  byHolding,
  fxRates,
}: UseAccountProviderDashboardDataProps) {
  const account = useMemo(() => {
    const accountProviders = activeAccount
      ? sortByOrder(providers.filter((provider) => provider.accountId === activeAccount.id))
      : [];
    const providerIds = new Set(accountProviders.map((provider) => provider.id));
    const allPortfolios = activeAccount
      ? sortByOrder(portfolios.filter((portfolio) => portfolio.accountId === activeAccount.id || (portfolio.providerId != null && providerIds.has(portfolio.providerId))))
      : [];
    const directPortfolios = allPortfolios.filter((portfolio) => !portfolio.providerId);
    const providerDirectHoldings = activeAccount
      ? directHoldings.filter((holding) => holding.providerId != null && providerIds.has(holding.providerId))
      : [];
    const accountDirectHoldings = activeAccount
      ? directHoldings.filter((holding) => holding.accountId === activeAccount.id && !holding.providerId)
      : [];
    const holdings = [
      ...allPortfolios.flatMap((portfolio) => portfolio.holdings),
      ...providerDirectHoldings,
      ...accountDirectHoldings,
    ];
    const { value, cost, gain } = summarizeHoldings(holdings, fxRates);
    const color = activeAccount ? resolveAccountColor(activeAccount, accounts) : null;
    const latestRefresh = holdings.reduce<number | null>((latest, holding) => {
      const refreshedAt = holding.lastRefreshedAt;
      return refreshedAt && (!latest || refreshedAt > latest) ? refreshedAt : latest;
    }, null);
    const history = activeAccount
      ? combineHistories([
        ...allPortfolios.map((portfolio) => byPortfolio[portfolio.id]?.data ?? []),
        ...[...providerDirectHoldings, ...accountDirectHoldings].map((holding) => byHolding?.[holding.id]?.data ?? []),
      ], value)
      : [];

    const accountProviderIndexes = getSortOrderIndexes(accountProviders);
    const directPortfolioIndexes = getSortOrderIndexes(directPortfolios);

    const providerSummaries = accountProviders.map((provider) => {
      const providerPortfolios = allPortfolios.filter((portfolio) => portfolio.providerId === provider.id);
      const providerHoldings = [
        ...providerPortfolios.flatMap((portfolio) => portfolio.holdings),
        ...providerDirectHoldings.filter((holding) => holding.providerId === provider.id),
      ];
      const totals = summarizeHoldings(providerHoldings, fxRates);
      const providerIndex = Math.max(0, accountProviderIndexes.get(provider.id) ?? -1);
      return {
        id: provider.id,
        name: provider.name,
        color: provider.color || portfolioTint(color, providerIndex),
        portfoliosCount: providerPortfolios.length,
        holdingsCount: providerHoldings.length,
        value: totals.value,
        gain: totals.gain,
      };
    });

    const portfolioSummaries = directPortfolios.map((portfolio) => {
      const totals = summarizeHoldings(portfolio.holdings, fxRates);
      return {
        id: portfolio.id,
        name: portfolio.name,
        color: portfolio.color || portfolioTint(color, Math.max(0, directPortfolioIndexes.get(portfolio.id) ?? -1)),
        holdingsCount: portfolio.holdings.length,
        value: totals.value,
        gain: totals.gain,
      };
    });

    const directHoldingSummaries = accountDirectHoldings.map((holding) => {
      const totals = summarizeHoldings([holding], fxRates);
      return { id: holding.id, symbol: holding.symbol, name: holding.name, exchange: holding.exchange, currency: holding.currency, value: totals.value, gain: totals.gain };
    });

    return {
      color,
      providers: providerSummaries,
      portfolios: portfolioSummaries,
      directHoldings: directHoldingSummaries,
      allPortfolios,
      holdings,
      history,
      allocation: createAllocation(holdings, value, color, fxRates),
      latestRefresh,
      value,
      cost,
      gain,
      gainPct: cost ? (gain / cost) * 100 : 0,
    };
  }, [activeAccount, accounts, byHolding, byPortfolio, directHoldings, fxRates, portfolios, providers]);

  const provider = useMemo(() => {
    const providerPortfolios = activeProvider
      ? sortByOrder(portfolios.filter((portfolio) => portfolio.providerId === activeProvider.id))
      : [];
    const directProviderHoldings = activeProvider
      ? directHoldings.filter((holding) => holding.providerId === activeProvider.id)
      : [];
    const holdings = [...providerPortfolios.flatMap((portfolio) => portfolio.holdings), ...directProviderHoldings];
    const { value, cost, gain } = summarizeHoldings(holdings, fxRates);
    const color = activeProvider ? resolveProviderColor(activeProvider, providers, accounts) : null;
    const latestRefresh = holdings.reduce<number | null>((latest, holding) => {
      const refreshedAt = holding.lastRefreshedAt;
      return refreshedAt && (!latest || refreshedAt > latest) ? refreshedAt : latest;
    }, null);
    const history = activeProvider
      ? combineHistories([
        ...providerPortfolios.map((portfolio) => byPortfolio[portfolio.id]?.data ?? []),
        ...directProviderHoldings.map((holding) => byHolding?.[holding.id]?.data ?? []),
      ], value)
      : [];

    const providerPortfolioIndexes = getSortOrderIndexes(providerPortfolios);

    const portfolioSummaries = providerPortfolios.map((portfolio) => {
      const totals = summarizeHoldings(portfolio.holdings, fxRates);
      return {
        id: portfolio.id,
        name: portfolio.name,
        color: portfolio.color || portfolioTint(color, Math.max(0, providerPortfolioIndexes.get(portfolio.id) ?? -1)),
        value: totals.value,
        gain: totals.gain,
        holdingsCount: portfolio.holdings.length,
      };
    });
    const directHoldingSummaries = directProviderHoldings.map((holding) => {
      const totals = summarizeHoldings([holding], fxRates);
      return { id: holding.id, symbol: holding.symbol, name: holding.name, exchange: holding.exchange, currency: holding.currency, value: totals.value, gain: totals.gain };
    });

    return {
      color,
      portfolios: providerPortfolios,
      holdings,
      portfolioSummaries,
      directHoldingSummaries,
      history,
      allocation: createAllocation(holdings, value, color, fxRates),
      latestRefresh,
      value,
      cost,
      gain,
      gainPct: cost ? (gain / cost) * 100 : 0,
    };
  }, [activeProvider, accounts, byHolding, byPortfolio, directHoldings, fxRates, portfolios, providers]);

  return { account, provider };
}
