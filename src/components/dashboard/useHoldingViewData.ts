"use client";

import { useMemo } from "react";
import { resolveAccountColor, resolvePortfolioColor, resolveProviderColor } from "@/lib/colors";
import { holdingValueGBP, type FxRates } from "@/lib/format";
import type { Account, Holding, Portfolio, Provider } from "@/lib/store";

type UseHoldingViewDataProps = {
  holdingId: string | null;
  activePortfolioId: string | null;
  holdings: Holding[];
  portfolios: Portfolio[];
  providers: Provider[];
  accounts: Account[];
  fxRates: FxRates;
};

export function useHoldingViewData({
  holdingId,
  activePortfolioId,
  holdings,
  portfolios,
  providers,
  accounts,
  fxRates,
}: UseHoldingViewDataProps) {
  const holding = useMemo(() => {
    if (!holdingId) return null;
    const selected = holdings.find((item) => item.id === holdingId) ?? null;
    if (!selected || (selected.portfolioId && activePortfolioId && selected.portfolioId !== activePortfolioId)) return null;
    return selected;
  }, [activePortfolioId, holdingId, holdings]);

  const portfolio = useMemo(
    () => holding ? portfolios.find((item) => item.id === holding.portfolioId) ?? null : null,
    [holding, portfolios],
  );

  const color = useMemo(() => {
    if (!holding) return "#60a5fa";
    const provider = holding.providerId ? providers.find((item) => item.id === holding.providerId) : undefined;
    const account = holding.accountId ? accounts.find((item) => item.id === holding.accountId) : undefined;
    if (portfolio) return resolvePortfolioColor(portfolio, portfolios, providers, accounts);
    if (provider) return resolveProviderColor(provider, providers, accounts);
    return account ? resolveAccountColor(account, accounts) : "#60a5fa";
  }, [accounts, holding, portfolio, portfolios, providers]);

  const scopeValue = useMemo(() => {
    if (!holding) return 0;

    let scopedHoldings: Holding[];
    if (portfolio) {
      scopedHoldings = portfolio.holdings;
    } else if (holding.providerId) {
      const providerId = holding.providerId;
      scopedHoldings = holdings.filter((item) => item.providerId === providerId
        || (item.portfolioId && portfolios.find((parent) => parent.id === item.portfolioId)?.providerId === providerId));
    } else if (holding.accountId) {
      const accountId = holding.accountId;
      scopedHoldings = holdings.filter((item) => {
        if (item.accountId === accountId) return true;
        const providerId = item.providerId
          ?? (item.portfolioId ? portfolios.find((parent) => parent.id === item.portfolioId)?.providerId : null);
        if (providerId) return providers.find((itemProvider) => itemProvider.id === providerId)?.accountId === accountId;
        return item.portfolioId
          ? portfolios.find((parent) => parent.id === item.portfolioId)?.accountId === accountId
          : false;
      });
    } else {
      scopedHoldings = holdings;
    }

    return scopedHoldings.reduce((sum, item) => sum + holdingValueGBP(item, fxRates), 0);
  }, [fxRates, holding, holdings, portfolio, portfolios, providers]);

  return { holding, portfolio, color, scopeValue };
}
