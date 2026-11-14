"use client";

import { useMemo } from "react";
import { portfolioTint, resolveAccountColor, resolvePortfolioColor, resolveProviderColor, type PaletteColor, PALETTE } from "@/lib/colors";
import { holdingValueGBP, type FxRates } from "@/lib/format";
import { holdingSector } from "@/lib/sectors";
import type { Account, Holding, Portfolio, Provider } from "@/lib/store";
import type { AllocationItem } from "@/components/dashboard/shared/AllocationCard";

export type AllocationMode = "holding" | "account" | "sector";

type UsePortfolioAllocationProps = {
  activePortfolio: Portfolio | null;
  portfolios: Portfolio[];
  directHoldings: Holding[];
  accounts: Account[];
  providers: Provider[];
  fxRates: FxRates;
  activeBaseColor: string | null;
  mode: AllocationMode;
  palette?: readonly PaletteColor[];
};

export function usePortfolioAllocation({
  activePortfolio,
  portfolios,
  directHoldings,
  accounts,
  providers,
  fxRates,
  activeBaseColor,
  mode,
  palette = PALETTE,
}: UsePortfolioAllocationProps): AllocationItem[] {
  return useMemo(() => {
    const paletteValues = palette.map((color) => color.value);
    const uniqueHoldings = new Map<string, Holding>();
    const parentByHolding = new Map<string, Portfolio>();
    if (activePortfolio) {
      for (const holding of activePortfolio.holdings) {
        uniqueHoldings.set(holding.id, holding);
        parentByHolding.set(holding.id, activePortfolio);
      }
    } else {
      for (const portfolio of portfolios) {
        for (const holding of portfolio.holdings) {
          uniqueHoldings.set(holding.id, holding);
          parentByHolding.set(holding.id, portfolio);
        }
      }
      for (const holding of directHoldings) uniqueHoldings.set(holding.id, holding);
    }

    const holdings = [...uniqueHoldings.values()];
    const totalValue = holdings.reduce((sum, holding) => sum + holdingValueGBP(holding, fxRates), 0);
    if (!totalValue) return [];

    const accountIds = new Set(accounts.map((account) => account.id));
    const resolveHoldingAccountId = (holding: Holding): string | null => {
      if (holding.accountId && accountIds.has(holding.accountId)) return holding.accountId;
      if (holding.providerId) {
        const provider = providers.find((item) => item.id === holding.providerId);
        if (provider?.accountId && accountIds.has(provider.accountId)) return provider.accountId;
      }
      const parent = parentByHolding.get(holding.id);
      if (parent?.accountId && accountIds.has(parent.accountId)) return parent.accountId;
      return null;
    };

    if (mode === "account") {
      const valuesByAccount = new Map<string, number>();
      let unassignedValue = 0;
      for (const holding of holdings) {
        const value = holdingValueGBP(holding, fxRates);
        const accountId = resolveHoldingAccountId(holding);
        if (accountId) valuesByAccount.set(accountId, (valuesByAccount.get(accountId) ?? 0) + value);
        else unassignedValue += value;
      }

      const allocation: AllocationItem[] = [];
      for (const account of accounts) {
        const value = valuesByAccount.get(account.id) ?? 0;
        if (value <= 0) continue;
        allocation.push({ name: account.name, value, color: resolveAccountColor(account, accounts, palette), pct: value / totalValue * 100 });
      }
      if (unassignedValue > 0) allocation.push({ name: "Unassigned", value: unassignedValue, color: "#71717a", pct: unassignedValue / totalValue * 100 });
      return allocation.sort((a, b) => b.value - a.value);
    }

    if (mode === "sector") {
      const valuesBySector = new Map<string, number>();
      for (const holding of holdings) {
        const sector = holdingSector(holding);
        valuesBySector.set(sector, (valuesBySector.get(sector) ?? 0) + holdingValueGBP(holding, fxRates));
      }
      return [...valuesBySector.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], index) => ({ name, value, color: paletteValues[index % paletteValues.length] ?? "#71717a", pct: value / totalValue * 100 }));
    }

    const valuesBySymbol = new Map<string, { value: number; colorBase: string | null }>();
    for (const holding of holdings) {
      const value = holdingValueGBP(holding, fxRates);
      const parent = parentByHolding.get(holding.id);
      let colorBase: string | null = parent ? resolvePortfolioColor(parent, portfolios, providers, accounts, palette) : null;
      if (!colorBase && holding.providerId) {
        const provider = providers.find((item) => item.id === holding.providerId);
        if (provider) colorBase = resolveProviderColor(provider, providers, accounts, palette);
      }
      if (!colorBase && holding.accountId) {
        const account = accounts.find((item) => item.id === holding.accountId);
        if (account) colorBase = resolveAccountColor(account, accounts, palette);
      }

      const existing = valuesBySymbol.get(holding.symbol);
      if (existing) existing.value += value;
      else valuesBySymbol.set(holding.symbol, { value, colorBase });
    }

    const activeColor = activePortfolio ? activeBaseColor ?? paletteValues[0] : null;
    return [...valuesBySymbol.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([symbol, info], index) => ({
        name: symbol,
        value: info.value,
        color: portfolioTint(activePortfolio ? activeColor : info.colorBase, index, palette),
        pct: info.value / totalValue * 100,
      }));
  }, [activeBaseColor, activePortfolio, accounts, directHoldings, fxRates, mode, palette, portfolios, providers]);
}
