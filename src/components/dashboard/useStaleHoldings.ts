"use client";

import { useEffect, useMemo, useState } from "react";
import { isLiveHolding } from "@/lib/format";
import type { Holding, Portfolio } from "@/lib/store";

const STALE_AFTER_SECONDS = 36 * 60 * 60;

export function useStaleHoldings(holdings: Holding[], portfolios: Portfolio[]) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Math.floor(Date.now() / 1000)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return useMemo(() => {
    const typeById = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.type]));
    return [...holdings]
      .filter((holding) => {
        const portfolioType = holding.portfolioId ? typeById.get(holding.portfolioId) : undefined;
        if (!isLiveHolding(holding, portfolioType)) return false;
        return !holding.lastRefreshedAt || (now > 0 && now - holding.lastRefreshedAt > STALE_AFTER_SECONDS);
      })
      .sort((a, b) => (a.lastRefreshedAt ?? 0) - (b.lastRefreshedAt ?? 0));
  }, [holdings, now, portfolios]);
}
